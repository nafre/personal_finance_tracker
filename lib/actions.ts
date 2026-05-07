"use server";

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getNextDueDate, type RecurringFrequency } from "@/lib/utils";
import bcrypt from "bcryptjs";

// SQLite stores labels as a JSON string; PostgreSQL uses a native string array.
const IS_SQLITE = (process.env.DATABASE_URL ?? "").startsWith("file:");

function parseLabels(val: string | string[]): string[] {
  if (Array.isArray(val)) return val;
  try { return JSON.parse(val); } catch { return []; }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function encodeLabels(labels: string[]): any {
  return IS_SQLITE ? JSON.stringify(labels) : labels;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeTx(tx: any) {
  return { ...tx, labels: parseLabels(tx.labels) };
}

// ─── Auth helper ──────────────────────────────────────────────────────────────

async function getAuthenticatedUserId(): Promise<string> {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new Error("Unauthorized");
  const userId = session.user.userId;
  if (!userId) throw new Error("Unauthorized");
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
}) {
  const userId = await getAuthenticatedUserId();

  const tx = await db.transaction.create({
    data: {
      userId,
      category: data.category,
      amount: data.amount,
      type: data.type,
      note: data.note ?? null,
      date: data.date ?? new Date(),
      labels: encodeLabels(data.labels ?? []),
    },
  });

  revalidatePath("/dashboard");
  revalidatePath("/transactions");
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
  }
) {
  const userId = await getAuthenticatedUserId();

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
    },
  });

  revalidatePath("/dashboard");
  revalidatePath("/transactions");
  return normalizeTx(tx);
}

export async function deleteTransaction(id: string) {
  const userId = await getAuthenticatedUserId();

  const existing = await db.transaction.findFirst({ where: { id, userId } });
  if (!existing) throw new Error("Transaction not found");

  await db.transaction.delete({ where: { id } });

  revalidatePath("/dashboard");
  revalidatePath("/transactions");
}

export async function getTransactionIds(): Promise<string[]> {
  const userId = await getAuthenticatedUserId();
  const rows = await db.transaction.findMany({
    where: { userId },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

// ─── Dashboard data ───────────────────────────────────────────────────────────

export async function getDashboardData(month: number, year: number) {
  const userId = await getAuthenticatedUserId();

  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0, 23, 59, 59, 999); // last ms of month
  const dateFilter = { gte: start, lte: end };

  // Run aggregation queries + a bounded recent-transactions query in parallel.
  const [transactionsRaw, totalsByType, categoryBreakdown, dailyRows] = await Promise.all([
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
      where: { userId, type: "expense", date: dateFilter },
      _sum: { amount: true },
      orderBy: { _sum: { amount: "desc" } },
    }),
    IS_SQLITE
      ? db.$queryRaw<Array<{ day: string; type: string; total: number }>>`
          SELECT strftime('%Y-%m-%d', date) AS day, type, SUM(amount) AS total
          FROM transactions
          WHERE userId = ${userId} AND date >= ${start} AND date <= ${end}
          GROUP BY day, type
        `
      : db.$queryRaw<Array<{ day: Date; type: string; total: number | bigint }>>`
          SELECT date_trunc('day', date) AS day, type, SUM(amount) AS total
          FROM transactions
          WHERE "userId" = ${userId} AND date >= ${start} AND date <= ${end}
          GROUP BY day, type
        `,
  ]);

  const transactions = transactionsRaw.map(normalizeTx);

  // Totals
  let totalIncome = 0;
  let totalExpenses = 0;
  for (const row of totalsByType) {
    const sum = row._sum.amount ?? 0;
    if (row.type === "income") totalIncome = sum;
    else if (row.type === "expense") totalExpenses = sum;
  }

  // Category breakdown (already sorted desc by query)
  const categoryData = categoryBreakdown.map((row) => ({
    name: row.category,
    value: Math.round((row._sum.amount ?? 0) * 100) / 100,
  }));

  // Daily aggregation — group by ISO YYYY-MM-DD then format for display
  const dailyMap = new Map<string, { income: number; expense: number }>();
  for (const row of dailyRows) {
    const key =
      typeof row.day === "string"
        ? row.day // SQLite: already YYYY-MM-DD
        : (() => {
            // Postgres: Date object — format in UTC to avoid TZ drift
            const d = new Date(row.day);
            return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
          })();
    const existing = dailyMap.get(key) ?? { income: 0, expense: 0 };
    const total = Number(row.total);
    if (row.type === "income") existing.income += total;
    else existing.expense += total;
    dailyMap.set(key, existing);
  }

  const allDays = getDaysInMonth(year, month);
  const dailyData = allDays.map((day) => {
    const isoKey = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const val = dailyMap.get(isoKey) ?? { income: 0, expense: 0 };
    const dateLabel = new Date(year, month - 1, day).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    return { date: dateLabel, day, ...val };
  });

  return {
    transactions,
    totalIncome,
    totalExpenses,
    netBalance: totalIncome - totalExpenses,
    categoryData,
    dailyData,
    topCategory: categoryData[0] ?? null,
  };
}

function getDaysInMonth(year: number, month: number): number[] {
  const days = new Date(year, month, 0).getDate();
  return Array.from({ length: days }, (_, i) => i + 1);
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
    const start = cursorIdx >= 0 ? cursorIdx + 1 : 0;
    const page = rows.slice(start, start + limit + 1);
    const nextCursor = page.length > limit ? page[limit - 1].id : null;
    const finalRows = page.slice(0, limit);
    const totalIncome = rows.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0);
    const totalExpenses = rows.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0);
    return { transactions: finalRows, nextCursor, totalCount: rows.length, totalIncome, totalExpenses };
  }

  const pgWhere = {
    ...baseWhere,
    ...(filters.label ? { labels: { has: filters.label } } : {}),
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

export async function getCategories() {
  const userId = await getAuthenticatedUserId();
  return db.category.findMany({
    where: { userId },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
  });
}

export async function addCategory(data: {
  name: string;
  icon?: string;
  color?: string;
}) {
  const userId = await getAuthenticatedUserId();

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

export async function deleteCategory(id: string) {
  const userId = await getAuthenticatedUserId();

  const existing = await db.category.findFirst({ where: { id, userId } });
  if (!existing) throw new Error("Category not found");
  if (existing.isDefault) throw new Error("Cannot delete default categories");

  await db.category.delete({ where: { id } });
  revalidatePath("/dashboard");
  revalidatePath("/transactions");
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
  return normalizeTx(tx);
}

// ─── Budgets ──────────────────────────────────────────────────────────────────

export async function getBudgets() {
  const userId = await getAuthenticatedUserId();
  return db.budget.findMany({ where: { userId }, orderBy: { category: "asc" } });
}

export async function upsertBudget(data: { category: string; amount: number }) {
  const userId = await getAuthenticatedUserId();
  await db.budget.upsert({
    where: { userId_category: { userId, category: data.category } },
    create: { userId, category: data.category, amount: data.amount },
    update: { amount: data.amount },
  });
  revalidatePath("/dashboard");
}

export async function deleteBudget(id: string) {
  const userId = await getAuthenticatedUserId();
  const existing = await db.budget.findFirst({ where: { id, userId } });
  if (!existing) throw new Error("Budget not found");
  await db.budget.delete({ where: { id } });
  revalidatePath("/dashboard");
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

export async function changePassword(
  currentPassword: string,
  newPassword: string
): Promise<{ success: true }> {
  const userId = await getAuthenticatedUserId();

  const envHash = process.env.ADMIN_PASSWORD_HASH;
  if (!envHash) throw new Error("Server configuration error: password hash not set");

  const settings = await db.userSettings.findUnique({ where: { userId } });
  const currentHash = settings?.passwordHash ?? envHash;

  const isValid = await bcrypt.compare(currentPassword, currentHash);
  if (!isValid) throw new Error("Current password is incorrect");

  if (newPassword.length < 8) throw new Error("New password must be at least 8 characters");
  if (newPassword === currentPassword) throw new Error("New password must differ from your current password");

  const newHash = await bcrypt.hash(newPassword, 12);

  await db.userSettings.upsert({
    where: { userId },
    create: { userId, passwordHash: newHash },
    update: { passwordHash: newHash },
  });

  return { success: true };
}
