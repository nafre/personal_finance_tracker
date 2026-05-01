"use server";

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getNextDueDate, type RecurringFrequency } from "@/lib/utils";

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

  const transactions = (
    await db.transaction.findMany({
      where: {
        userId,
        date: { gte: start, lte: end },
      },
      orderBy: { date: "desc" },
    })
  ).map(normalizeTx);

  // Aggregate
  let totalIncome = 0;
  let totalExpenses = 0;
  const categoryMap = new Map<string, number>();
  const dailyMap = new Map<string, { income: number; expense: number }>();

  for (const tx of transactions) {
    if (tx.type === "income") {
      totalIncome += tx.amount;
    } else {
      totalExpenses += tx.amount;

      // Category breakdown (expenses only)
      categoryMap.set(
        tx.category,
        (categoryMap.get(tx.category) ?? 0) + tx.amount
      );
    }

    // Daily trend
    const day = new Date(tx.date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    const existing = dailyMap.get(day) ?? { income: 0, expense: 0 };
    if (tx.type === "income") {
      existing.income += tx.amount;
    } else {
      existing.expense += tx.amount;
    }
    dailyMap.set(day, existing);
  }

  // Sort daily data chronologically
  const allDays = getDaysInMonth(year, month);
  const dailyData = allDays.map((day) => {
    const key = new Date(year, month - 1, day).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    const val = dailyMap.get(key) ?? { income: 0, expense: 0 };
    return { date: key, day, ...val };
  });

  // Category breakdown sorted by amount desc
  const categoryData = Array.from(categoryMap.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }));

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
}) {
  const userId = await getAuthenticatedUserId();

  const start = new Date(filters.year, filters.month - 1, 1);
  const end = new Date(filters.year, filters.month, 0, 23, 59, 59, 999);

  // SQLite has no native array `has` filter — fetch then filter in JS.
  if (IS_SQLITE && filters.label) {
    const rows = await db.transaction.findMany({
      where: {
        userId,
        date: { gte: start, lte: end },
        ...(filters.category ? { category: filters.category } : {}),
      },
      orderBy: { date: "desc" },
    });
    return rows
      .map(normalizeTx)
      .filter((tx) => tx.labels.includes(filters.label!));
  }

  const transactions = await db.transaction.findMany({
    where: {
      userId,
      date: { gte: start, lte: end },
      ...(filters.category ? { category: filters.category } : {}),
      ...(filters.label ? { labels: { has: filters.label } } : {}),
    },
    orderBy: { date: "desc" },
  });

  return transactions.map(normalizeTx);
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

  revalidatePath("/");
  return category;
}

export async function deleteCategory(id: string) {
  const userId = await getAuthenticatedUserId();

  const existing = await db.category.findFirst({ where: { id, userId } });
  if (!existing) throw new Error("Category not found");
  if (existing.isDefault) throw new Error("Cannot delete default categories");

  await db.category.delete({ where: { id } });
  revalidatePath("/");
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
    type: string;
    frequency: string;
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
