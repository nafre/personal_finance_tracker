"use server";

import { cache } from "react";
import { getServerSession } from "next-auth";
import { revalidatePath, updateTag, unstable_cache } from "next/cache";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getNextDueDate, DEFAULT_CATEGORIES, enumerateMonths, MAX_BACKFILL, type RecurringFrequency } from "@/lib/utils";
import { IS_SQLITE, encodeLabels, normalizeTx, getLabelFilter, getTrendRows, type TrendGranularity, normalizeBudget, encodeBudgetArray, parseLabels } from "@/lib/db-adapter";
import { transactionSchema, categorySchema, budgetSchema, recurringSchema, recurringUpdateSchema, passwordSchema, roleSchema } from "@/lib/validation";
import { rateLimit } from "@/lib/rate-limit";
import bcrypt from "bcryptjs";

// ─── Auth helpers ──────────────────────────────────────────────────────────────

// cache() dedupes the sessionVersion DB lookup across the multiple server
// actions invoked within a single request (e.g. a dashboard render calls four).
const getAuthenticatedUserId = cache(async (): Promise<string> => {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new Error("Unauthorized");
  const userId = session.user.userId;
  if (!userId) throw new Error("Unauthorized");

  // Session version check — rejects stale JWTs after password change
  const dbUser = await db.user.findUnique({
    where: { id: userId },
    select: { sessionVersion: true },
  });
  if (!dbUser) throw new Error("Unauthorized");
  if (dbUser.sessionVersion !== (session.user.sessionVersion ?? 1)) {
    throw new Error("Unauthorized");
  }

  return userId;
});

// Like getAuthenticatedUserId, this must not trust the JWT alone: the role and
// sessionVersion are re-checked against the DB so a demoted or deleted admin
// loses access immediately instead of at JWT expiry (30 days).
async function requireAdmin(): Promise<string> {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new Error("Unauthorized");
  const userId = session.user.userId;
  if (!userId) throw new Error("Unauthorized");

  const dbUser = await db.user.findUnique({
    where: { id: userId },
    select: { role: true, sessionVersion: true },
  });
  if (!dbUser) throw new Error("Unauthorized");
  if (dbUser.sessionVersion !== (session.user.sessionVersion ?? 1)) {
    throw new Error("Unauthorized");
  }
  if (dbUser.role !== "admin") throw new Error("Forbidden");
  return userId;
}

// ─── Transactions ─────────────────────────────────────────────────────────────

export async function addTransaction(data: {
  category: string;
  amount: number;
  type: "income" | "expense";
  note?: string;
  date?: Date;
  labels?: string[];
  excludedBudgetIds?: string[];
  excludeFromStats?: boolean;
}) {
  const userId = await getAuthenticatedUserId();
  transactionSchema.parse({ ...data, date: data.date ?? undefined });

  const tx = await db.transaction.create({
    data: {
      userId,
      category: data.category,
      amount: data.amount,
      type: data.type,
      note: data.note ?? null,
      date: data.date ?? new Date(),
      labels: encodeLabels(data.labels ?? []),
      excludedBudgetIds: encodeLabels(data.excludedBudgetIds ?? []),
      excludeFromStats: data.excludeFromStats ?? false,
    },
  });

  revalidatePath("/dashboard");
  revalidatePath("/transactions");
  updateTag("transactions");
  return normalizeTx(tx);
}

export async function updateTransaction(
  id: string,
  data: {
    category?: string;
    amount?: number;
    type?: "income" | "expense";
    note?: string;
    date?: Date;
    labels?: string[];
    excludedBudgetIds?: string[];
    excludeFromStats?: boolean;
  }
) {
  const userId = await getAuthenticatedUserId();
  transactionSchema.partial().parse(data);

  // Verify ownership
  const existing = await db.transaction.findFirst({ where: { id, userId } });
  if (!existing) throw new Error("Transaction not found");

  const tx = await db.transaction.update({
    where: { id },
    data: {
      ...(data.category !== undefined && { category: data.category }),
      ...(data.amount !== undefined && { amount: data.amount }),
      ...(data.type !== undefined && { type: data.type }),
      ...(data.note !== undefined && { note: data.note || null }),
      ...(data.date !== undefined && { date: data.date }),
      ...(data.labels !== undefined && { labels: encodeLabels(data.labels) }),
      ...(data.excludedBudgetIds !== undefined && { excludedBudgetIds: encodeLabels(data.excludedBudgetIds) }),
      ...(data.excludeFromStats !== undefined && { excludeFromStats: data.excludeFromStats }),
    },
  });

  revalidatePath("/dashboard");
  revalidatePath("/transactions");
  updateTag("transactions");
  return normalizeTx(tx);
}

export async function deleteTransaction(id: string) {
  const userId = await getAuthenticatedUserId();

  const existing = await db.transaction.findFirst({ where: { id, userId } });
  if (!existing) throw new Error("Transaction not found");

  await db.transaction.delete({ where: { id } });

  revalidatePath("/dashboard");
  revalidatePath("/transactions");
  updateTag("transactions");
}

export async function getTransactionIds(): Promise<string[]> {
  const userId = await getAuthenticatedUserId();
  const rows = await db.transaction.findMany({
    where: { userId },
    select: { id: true },
    // Practical upper bound for IDB reconciliation; prevents unbounded scans
    // while still covering virtually all real-world usage.
    take: 25000,
  });
  return rows.map((r) => r.id);
}

// ─── Dashboard data ───────────────────────────────────────────────────────────

// Inner implementation — receives userId explicitly so it can be cached.
// Dates in the return value are serialized to ISO strings by unstable_cache;
// Transaction.date is typed as Date|string to handle both cached and live paths.
// Range-based dashboard fetch. `granularity` controls the trend chart buckets:
// "day" (per-day fill within a single month) or "month" (per-month fill across
// the range, used by the year/all-time views). `start`/`end` are Date objects;
// unstable_cache serializes them into the cache key.
async function _fetchDashboardData(
  userId: string,
  start: Date,
  end: Date,
  granularity: TrendGranularity,
  withWealthSeries = false
) {
  const dateFilter = { gte: start, lte: end };

  // Run aggregation queries + a bounded recent-transactions query in parallel.
  // Totals include every transaction; the category breakdown and trend
  // exclude transactions flagged `excludeFromStats` (charts-only exclusion).
  // `withWealthSeries` (all-time view) adds a ledger-basis trend series — the
  // wealth curve plots cumulative net balance, so off-chart rows must count.
  const [transactionsRaw, typeBreakdown, categoryBreakdown, trendRows, wealthRows] = await Promise.all([
    db.transaction.findMany({
      where: { userId, date: dateFilter },
      orderBy: { date: "desc" },
      take: 500,
    }),
    db.transaction.groupBy({
      by: ["type"],
      where: { userId, date: dateFilter },
      _sum: { amount: true },
    }),
    db.transaction.groupBy({
      by: ["category"],
      where: { userId, date: dateFilter, type: "expense", excludeFromStats: false },
      _sum: { amount: true },
    }),
    getTrendRows(userId, start, end, granularity),
    withWealthSeries
      ? getTrendRows(userId, start, end, granularity, true)
      : Promise.resolve(null),
  ]);

  const transactions = transactionsRaw.map(normalizeTx);

  // Totals from the unfiltered type breakdown (excluded txns still count).
  let totalIncome = 0;
  let totalExpenses = 0;
  for (const row of typeBreakdown) {
    const sum = row._sum.amount ?? 0;
    if (row.type === "income") totalIncome += sum;
    else if (row.type === "expense") totalExpenses += sum;
  }

  // Category breakdown excludes `excludeFromStats` transactions.
  const catMap = new Map<string, number>();
  for (const row of categoryBreakdown) {
    catMap.set(row.category, (catMap.get(row.category) ?? 0) + (row._sum.amount ?? 0));
  }

  const categoryData = Array.from(catMap.entries())
    .map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }))
    .sort((a, b) => b.value - a.value);

  const dailyData =
    granularity === "month"
      ? buildMonthlyTrend(start, end, trendRows)
      : buildDailyTrend(start, trendRows);

  const wealthData = wealthRows
    ? granularity === "month"
      ? buildMonthlyTrend(start, end, wealthRows)
      : buildDailyTrend(start, wealthRows)
    : null;

  return {
    transactions,
    totalIncome,
    totalExpenses,
    netBalance: totalIncome - totalExpenses,
    categoryData,
    dailyData,
    wealthData,
    topCategory: categoryData[0] ?? null,
  };
}

// Per-day trend within a single month (the classic month view).
function buildDailyTrend(
  start: Date,
  rows: Array<{ day: string | Date; type: string; total: number | bigint }>
) {
  const year = start.getFullYear();
  const month = start.getMonth() + 1;
  const map = new Map<string, { income: number; expense: number }>();
  for (const row of rows) {
    const key =
      typeof row.day === "string"
        ? row.day // SQLite: already YYYY-MM-DD
        : (() => {
            const d = new Date(row.day);
            return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
          })();
    const existing = map.get(key) ?? { income: 0, expense: 0 };
    const total = Number(row.total);
    if (row.type === "income") existing.income += total;
    else existing.expense += total;
    map.set(key, existing);
  }

  const days = new Date(year, month, 0).getDate();
  return Array.from({ length: days }, (_, i) => i + 1).map((day) => {
    const isoKey = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const val = map.get(isoKey) ?? { income: 0, expense: 0 };
    const dateLabel = new Date(year, month - 1, day).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    return { date: dateLabel, day, ...val };
  });
}

// Per-month trend across an arbitrary range (year / all-time views). `day` is a
// 1-based ordinal index so the DailyData shape is reused unchanged.
function buildMonthlyTrend(
  start: Date,
  end: Date,
  rows: Array<{ day: string | Date; type: string; total: number | bigint }>
) {
  const map = new Map<string, { income: number; expense: number }>();
  for (const row of rows) {
    const key =
      typeof row.day === "string"
        ? row.day.slice(0, 7) // SQLite: "YYYY-MM"
        : (() => {
            const d = new Date(row.day);
            return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
          })();
    const existing = map.get(key) ?? { income: 0, expense: 0 };
    const total = Number(row.total);
    if (row.type === "income") existing.income += total;
    else existing.expense += total;
    map.set(key, existing);
  }

  const months = enumerateMonths(start, end);
  const multiYear = start.getFullYear() !== end.getFullYear();
  return months.map(({ year, month }, i) => {
    const key = `${year}-${String(month).padStart(2, "0")}`;
    const val = map.get(key) ?? { income: 0, expense: 0 };
    const d = new Date(year, month - 1, 1);
    const dateLabel = multiYear
      ? `${d.toLocaleDateString("en-US", { month: "short" })} '${String(year).slice(2)}`
      : d.toLocaleDateString("en-US", { month: "short" });
    return { date: dateLabel, day: i + 1, ...val };
  });
}

// Cached by (userId, start, end, granularity). Invalidated via
// revalidateTag("transactions") on any transaction mutation, so past
// periods are served from cache and the live period refreshes after writes.
const _getDashboardDataCached = unstable_cache(
  _fetchDashboardData,
  ["dashboard-data"],
  { tags: ["transactions"] }
);

export async function getDashboardData(month: number, year: number) {
  const userId = await getAuthenticatedUserId();
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0, 23, 59, 59, 999); // last ms of month
  return _getDashboardDataCached(userId, start, end, "day");
}

// Range variant for the year / all-time views. Accepts ISO strings so the
// caller (a server component) can pass plain serializable values.
export async function getRangeDashboardData(
  startISO: string,
  endISO: string,
  granularity: TrendGranularity,
  withWealthSeries = false
) {
  const userId = await getAuthenticatedUserId();
  return _getDashboardDataCached(
    userId,
    new Date(startISO),
    new Date(endISO),
    granularity,
    withWealthSeries
  );
}

// Earliest transaction date for the user (bounds the all-time range so the
// monthly trend fill is proportional to actual data). Returns null when empty.
export async function getEarliestTransactionDate(): Promise<string | null> {
  const userId = await getAuthenticatedUserId();
  const row = await db.transaction.findFirst({
    where: { userId },
    orderBy: { date: "asc" },
    select: { date: true },
  });
  return row ? new Date(row.date).toISOString() : null;
}

// ─── Transactions page ────────────────────────────────────────────────────────

export async function getTransactions(filters: {
  month: number;
  year: number;
  category?: string;
  label?: string;
  q?: string;
  from?: Date;
  to?: Date;
  cursor?: string;
  limit?: number;
}): Promise<{
  transactions: ReturnType<typeof normalizeTx>[];
  nextCursor: string | null;
  totalCount: number;
  totalIncome: number;
  totalExpenses: number;
}> {
  const userId = await getAuthenticatedUserId();
  const limit = filters.limit ?? 50;

  // Date range: prefer explicit from/to, else fall back to month/year window
  const start = filters.from ?? new Date(filters.year, filters.month - 1, 1);
  const end = filters.to ?? new Date(filters.year, filters.month, 0, 23, 59, 59, 999);

  const baseWhere = {
    userId,
    date: { gte: start, lte: end },
    ...(filters.category ? { category: filters.category } : {}),
    ...(filters.q ? { note: { contains: filters.q } } : {}),
  };

  // SQLite: no native array `has` — fetch all matching then apply label filter + cursor in JS
  if (IS_SQLITE && filters.label) {
    const rows = (await db.transaction.findMany({
      where: baseWhere,
      orderBy: [{ date: "desc" }, { id: "desc" }],
    })).map(normalizeTx).filter((tx) => tx.labels.includes(filters.label!));

    const cursorIdx = filters.cursor ? rows.findIndex((r) => r.id === filters.cursor) : -1;
    const startIdx = cursorIdx >= 0 ? cursorIdx + 1 : 0;
    const page = rows.slice(startIdx, startIdx + limit + 1);
    const nextCursor = page.length > limit ? page[limit - 1].id : null;
    const finalRows = page.slice(0, limit);
    const totalIncome = rows.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0);
    const totalExpenses = rows.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0);
    return { transactions: finalRows, nextCursor, totalCount: rows.length, totalIncome, totalExpenses };
  }

  const pgWhere = {
    ...baseWhere,
    ...getLabelFilter(filters.label),
  };

  const [rows, totals, count] = await Promise.all([
    db.transaction.findMany({
      where: pgWhere,
      orderBy: [{ date: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
    }),
    db.transaction.groupBy({
      by: ["type"],
      where: pgWhere,
      _sum: { amount: true },
    }),
    db.transaction.count({ where: pgWhere }),
  ]);

  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit).map(normalizeTx);
  const nextCursor = hasMore ? page[page.length - 1].id : null;

  let totalIncome = 0;
  let totalExpenses = 0;
  for (const row of totals) {
    if (row.type === "income") totalIncome = row._sum.amount ?? 0;
    else if (row.type === "expense") totalExpenses = row._sum.amount ?? 0;
  }

  return { transactions: page, nextCursor, totalCount: count, totalIncome, totalExpenses };
}

// ─── Categories ───────────────────────────────────────────────────────────────

export const getCategories = cache(async function getCategories() {
  const userId = await getAuthenticatedUserId();
  return db.category.findMany({
    where: { userId },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
  });
});

export async function addCategory(data: {
  name: string;
  icon?: string;
  color?: string;
}) {
  const userId = await getAuthenticatedUserId();
  categorySchema.parse(data);

  const category = await db.category.create({
    data: {
      userId,
      name: data.name,
      icon: data.icon ?? "📦",
      color: data.color ?? "#6366f1",
      isDefault: false,
    },
  });

  revalidatePath("/dashboard");
  revalidatePath("/transactions");
  return category;
}

export async function updateCategory(
  id: string,
  data: { name?: string; icon?: string; color?: string }
) {
  const userId = await getAuthenticatedUserId();
  categorySchema.partial().parse(data);

  const existing = await db.category.findFirst({ where: { id, userId } });
  if (!existing) throw new Error("Category not found");

  if (data.name && data.name !== existing.name) {
    const conflict = await db.category.findFirst({
      where: { userId, name: data.name, id: { not: id } },
    });
    if (conflict) throw new Error("A category with that name already exists");
  }

  const updated = await db.category.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.icon !== undefined && { icon: data.icon }),
      ...(data.color !== undefined && { color: data.color }),
    },
  });

  revalidatePath("/dashboard");
  revalidatePath("/transactions");
  revalidatePath("/settings");
  return updated;
}

export async function deleteCategory(id: string) {
  const userId = await getAuthenticatedUserId();

  const existing = await db.category.findFirst({ where: { id, userId } });
  if (!existing) throw new Error("Category not found");
  if (existing.isDefault) throw new Error("Cannot delete default categories");

  await db.category.delete({ where: { id } });
  revalidatePath("/dashboard");
  revalidatePath("/transactions");
}

// Seeds all default categories for a given userId — no auth check (internal use only).
async function _seedDefaultCategories(userId: string): Promise<void> {
  await db.category.createMany({
    data: DEFAULT_CATEGORIES.map((c) => ({ ...c, userId, isDefault: true })),
    skipDuplicates: true,
  });
}

export async function addDefaultCategories() {
  const userId = await getAuthenticatedUserId();

  const existing = await db.category.findMany({
    where: { userId, isDefault: true },
    select: { name: true },
  });
  const existingNames = new Set(existing.map((c) => c.name));
  const missing = DEFAULT_CATEGORIES.filter((c) => !existingNames.has(c.name));

  if (missing.length === 0) return [];

  await db.category.createMany({
    data: missing.map((c) => ({ ...c, userId, isDefault: true })),
  });

  revalidatePath("/dashboard");
  revalidatePath("/transactions");
  return missing;
}

// ─── Recurring Transactions ───────────────────────────────────────────────────

export async function getRecurringTransactions() {
  const userId = await getAuthenticatedUserId();
  return db.recurringTransaction.findMany({
    where: { userId, isActive: true },
    orderBy: { createdAt: "asc" },
  });
}

export async function createRecurringTransaction(data: {
  name: string;
  category: string;
  amount: number;
  type: "income" | "expense";
  frequency: "daily" | "weekly" | "monthly" | "yearly";
  startDate: Date;
  endDate?: Date;
  note?: string;
}) {
  const userId = await getAuthenticatedUserId();
  recurringSchema.parse(data);

  const rec = await db.recurringTransaction.create({
    data: {
      userId,
      name: data.name,
      category: data.category,
      amount: data.amount,
      type: data.type,
      frequency: data.frequency,
      startDate: data.startDate,
      endDate: data.endDate ?? null,
      note: data.note ?? null,
    },
  });
  revalidatePath("/dashboard");
  return rec;
}

export async function updateRecurringTransaction(
  id: string,
  data: Partial<{
    name: string;
    category: string;
    amount: number;
    type: "income" | "expense";
    frequency: "daily" | "weekly" | "monthly" | "yearly";
    endDate: Date | null;
    isActive: boolean;
    note: string | null;
  }>
) {
  const userId = await getAuthenticatedUserId();
  recurringUpdateSchema.parse(data);
  const existing = await db.recurringTransaction.findFirst({ where: { id, userId } });
  if (!existing) throw new Error("Recurring transaction not found");
  const rec = await db.recurringTransaction.update({ where: { id }, data });
  revalidatePath("/dashboard");
  return rec;
}

export async function deleteRecurringTransaction(id: string) {
  const userId = await getAuthenticatedUserId();
  const existing = await db.recurringTransaction.findFirst({ where: { id, userId } });
  if (!existing) throw new Error("Not found");
  await db.recurringTransaction.delete({ where: { id } });
  revalidatePath("/dashboard");
}

export async function postRecurringTransaction(id: string) {
  const userId = await getAuthenticatedUserId();
  const rec = await db.recurringTransaction.findFirst({ where: { id, userId } });
  if (!rec) throw new Error("Not found");

  const now = new Date();
  const [tx] = await db.$transaction([
    db.transaction.create({
      data: {
        userId,
        category: rec.category,
        amount: rec.amount,
        type: rec.type,
        note: rec.note ?? `Recurring: ${rec.name}`,
        date: now,
      },
    }),
    db.recurringTransaction.update({
      where: { id },
      data: { lastRun: now },
    }),
  ]);

  revalidatePath("/dashboard");
  revalidatePath("/transactions");
  updateTag("transactions");
  return normalizeTx(tx);
}

// Creates one transaction per missed period (rule added mid-period or left
// unposted), each dated at its historical due date, then advances lastRun to
// the last backfilled date. Capped at MAX_BACKFILL per call — a rule further
// behind than that can be backfilled again. Atomic: all instances + the
// lastRun bump commit together.
export async function backfillRecurringTransaction(id: string) {
  const userId = await getAuthenticatedUserId();
  const rec = await db.recurringTransaction.findFirst({ where: { id, userId } });
  if (!rec) throw new Error("Not found");

  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const end = rec.endDate ? new Date(rec.endDate) : null;
  if (end) end.setHours(23, 59, 59, 999);

  const dueDates: Date[] = [];
  let due = getNextDueDate(rec.frequency as RecurringFrequency, rec.startDate, rec.lastRun ?? null);
  while (dueDates.length < MAX_BACKFILL && due <= today && (!end || due <= end)) {
    dueDates.push(due);
    due = getNextDueDate(rec.frequency as RecurringFrequency, due, due);
  }
  if (dueDates.length === 0) throw new Error("Nothing to backfill");

  const { txs, updated } = await db.$transaction(async (p) => {
    const txs = [];
    for (const date of dueDates) {
      txs.push(
        await p.transaction.create({
          data: {
            userId,
            category: rec.category,
            amount: rec.amount,
            type: rec.type,
            note: rec.note ?? `Recurring: ${rec.name}`,
            date,
          },
        })
      );
    }
    const updated = await p.recurringTransaction.update({
      where: { id },
      data: { lastRun: dueDates[dueDates.length - 1] },
    });
    return { txs, updated };
  });

  revalidatePath("/dashboard");
  revalidatePath("/transactions");
  updateTag("transactions");
  return { count: txs.length, recurring: updated, transactions: txs.map(normalizeTx) };
}

// ─── Budgets ──────────────────────────────────────────────────────────────────

export async function getBudgets() {
  const userId = await getAuthenticatedUserId();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = await (db.budget as any).findMany({ where: { userId }, orderBy: { name: "asc" } });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (rows as any[]).map(normalizeBudget);
}

export async function saveBudget(
  data: {
    name: string;
    amount: number;
    budgetType: "overall" | "category" | "excluded" | "label";
    category?: string | null;
    excludedCategories?: string[];
    labels?: string[];
  },
  id?: string
) {
  const userId = await getAuthenticatedUserId();
  budgetSchema.parse({ ...data, amount: Number(data.amount) });

  const payload = {
    name: data.name,
    amount: data.amount,
    budgetType: data.budgetType,
    category: data.category ?? undefined,
    excludedCategories: encodeBudgetArray(data.excludedCategories ?? []),
    labels: encodeBudgetArray(data.labels ?? []),
  };

  if (id) {
    const existing = await db.budget.findFirst({ where: { id, userId } });
    if (!existing) throw new Error("Budget not found");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db.budget as any).update({ where: { id }, data: payload });
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db.budget as any).create({ data: { userId, ...payload } });
  }
  revalidatePath("/dashboard");
}

export async function deleteBudget(id: string) {
  const userId = await getAuthenticatedUserId();
  const existing = await db.budget.findFirst({ where: { id, userId } });
  if (!existing) throw new Error("Budget not found");
  await db.budget.delete({ where: { id } });
  revalidatePath("/dashboard");
}

export async function getUsedLabels(): Promise<string[]> {
  const userId = await getAuthenticatedUserId();
  // Practical upper bound — dedupes labels from the most recent transactions
  // without scanning an unbounded history.
  const rows = await db.transaction.findMany({
    where: { userId },
    select: { labels: true },
    orderBy: { date: "desc" },
    take: 10000,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const all = rows.flatMap((r) => parseLabels(r.labels as any));
  return [...new Set(all)].sort();
}

export async function skipRecurringTransaction(id: string) {
  const userId = await getAuthenticatedUserId();
  const rec = await db.recurringTransaction.findFirst({ where: { id, userId } });
  if (!rec) throw new Error("Not found");

  const nextDue = getNextDueDate(
    rec.frequency as RecurringFrequency,
    rec.startDate,
    rec.lastRun ?? null
  );

  const updated = await db.recurringTransaction.update({
    where: { id },
    data: { lastRun: nextDue },
  });

  revalidatePath("/dashboard");
  return updated;
}

// ─── Auth & Users ─────────────────────────────────────────────────────────────

export async function changePassword(
  currentPassword: string,
  newPassword: string
): Promise<{ success: true }> {
  const userId = await getAuthenticatedUserId();
  const session = await getServerSession(authOptions);
  if (session?.user?.role === "demo") throw new Error("Demo accounts cannot change their password");

  // The current-password check below is an offline-crackable oracle — throttle it.
  const rl = rateLimit(`changepw:${userId}`, { limit: 5, windowMs: 15 * 60_000 });
  if (!rl.success) throw new Error("Too many attempts. Try again later.");

  passwordSchema.parse(newPassword);

  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("User not found");

  const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!isValid) throw new Error("Current password is incorrect");

  if (newPassword === currentPassword) throw new Error("New password must differ from your current password");

  const newHash = await bcrypt.hash(newPassword, 12);
  await db.user.update({
    where: { id: userId },
    data: { passwordHash: newHash, sessionVersion: { increment: 1 } },
  });

  return { success: true };
}

export async function createUser(data: {
  email: string;
  password: string;
  name?: string;
  role?: "user" | "admin" | "demo";
}): Promise<{ id: string; email: string }> {
  await requireAdmin();
  if (!data.email || !data.password) throw new Error("Email and password are required");
  passwordSchema.parse(data.password);
  if (data.role !== undefined) roleSchema.parse(data.role);

  const existing = await db.user.findUnique({ where: { email: data.email.toLowerCase() } });
  if (existing) throw new Error("A user with that email already exists");

  const passwordHash = await bcrypt.hash(data.password, 12);
  const user = await db.user.create({
    data: {
      email: data.email.toLowerCase(),
      name: data.name ?? "User",
      passwordHash,
      role: data.role ?? "user",
    },
  });

  // Seed default categories so the new user has a working setup immediately
  await _seedDefaultCategories(user.id);

  return { id: user.id, email: user.email };
}

export async function getSessionRole(): Promise<string> {
  const session = await getServerSession(authOptions);
  return session?.user?.role ?? "user";
}

export async function getUsers() {
  await requireAdmin();
  return db.user.findMany({
    select: { id: true, email: true, name: true, role: true, createdAt: true, updatedAt: true },
    orderBy: { createdAt: "asc" },
  });
}

export async function deleteUser(id: string): Promise<void> {
  const callerId = await requireAdmin();
  if (id === callerId) throw new Error("You cannot delete your own account");

  const target = await db.user.findUnique({ where: { id }, select: { id: true, role: true } });
  if (!target) throw new Error("Not found");

  if (target.role === "admin") {
    const adminCount = await db.user.count({ where: { role: "admin" } });
    if (adminCount <= 1) throw new Error("Cannot delete the last admin account");
  }

  // Manual cascade — schema has no @relation FKs, so Prisma won't cascade automatically.
  await db.$transaction([
    db.budget.deleteMany({ where: { userId: id } }),
    db.recurringTransaction.deleteMany({ where: { userId: id } }),
    db.category.deleteMany({ where: { userId: id } }),
    db.transaction.deleteMany({ where: { userId: id } }),
    db.user.delete({ where: { id } }),
  ]);

  revalidatePath("/settings");
}

export async function updateUser(
  id: string,
  data: { name?: string; role?: "admin" | "user" | "demo" }
): Promise<{ id: string; email: string; name: string; role: string }> {
  await requireAdmin();
  if (data.role !== undefined) roleSchema.parse(data.role);

  const target = await db.user.findUnique({ where: { id }, select: { role: true } });
  if (!target) throw new Error("Not found");
  const roleChanged = data.role !== undefined && data.role !== target.role;

  if (roleChanged && data.role !== "admin" && target.role === "admin") {
    const adminCount = await db.user.count({ where: { role: "admin" } });
    if (adminCount <= 1) throw new Error("Cannot demote the last admin account");
  }

  const updated = await db.user.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      // A role change invalidates the target's existing JWTs so the old role
      // can't be exercised until the token would naturally expire.
      ...(roleChanged && { role: data.role, sessionVersion: { increment: 1 } }),
    },
    select: { id: true, email: true, name: true, role: true },
  });
  revalidatePath("/settings");
  return updated;
}

export async function adminResetPassword(id: string, newPassword: string): Promise<{ success: true }> {
  await requireAdmin();
  passwordSchema.parse(newPassword);

  const target = await db.user.findUnique({ where: { id }, select: { id: true } });
  if (!target) throw new Error("Not found");

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await db.user.update({
    where: { id },
    data: { passwordHash, sessionVersion: { increment: 1 } },
  });
  return { success: true };
}
