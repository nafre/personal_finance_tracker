import { query, toPgTimestamp, USER_ID, type Granularity, type Range } from "./db.js";

// All amounts are Malaysian Ringgit (MYR / "RM"), stored positive with the
// direction held in `type` ("income" | "expense").

function bounds(range: Range): [string, string] {
  return [toPgTimestamp(range.start), toPgTimestamp(range.end)];
}

function round(n: number, dp = 2): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

// ─── 1. Financial overview ──────────────────────────────────────────────────
export async function financialOverview(range: Range) {
  const [s, e] = bounds(range);

  const typeRows = await query<{ type: string; total: number; cnt: number }>(
    `SELECT type, SUM(amount)::float8 AS total, COUNT(*)::int AS cnt
       FROM transactions
      WHERE "userId" = $1 AND date >= $2::timestamp AND date < $3::timestamp
      GROUP BY type`,
    [USER_ID, s, e]
  );

  let income = 0;
  let expenses = 0;
  let count = 0;
  for (const r of typeRows) {
    if (r.type === "income") income = r.total;
    else if (r.type === "expense") expenses = r.total;
    count += r.cnt;
  }

  const topRows = await query<{ category: string; total: number }>(
    `SELECT category, SUM(amount)::float8 AS total
       FROM transactions
      WHERE "userId" = $1 AND type = 'expense' AND "excludeFromStats" = false
        AND date >= $2::timestamp AND date < $3::timestamp
      GROUP BY category
      ORDER BY total DESC
      LIMIT 1`,
    [USER_ID, s, e]
  );

  const net = income - expenses;
  return {
    period: range.label,
    currency: "MYR",
    totalIncome: round(income),
    totalExpenses: round(expenses),
    netBalance: round(net),
    savingsRatePct: income > 0 ? round((net / income) * 100, 1) : null,
    transactionCount: count,
    topExpenseCategory: topRows[0]
      ? { category: topRows[0].category, total: round(topRows[0].total) }
      : null,
  };
}

// ─── 2. Spending by category ────────────────────────────────────────────────
export async function spendingByCategory(range: Range) {
  const [s, e] = bounds(range);
  const rows = await query<{ category: string; total: number; cnt: number }>(
    `SELECT category, SUM(amount)::float8 AS total, COUNT(*)::int AS cnt
       FROM transactions
      WHERE "userId" = $1 AND type = 'expense' AND "excludeFromStats" = false
        AND date >= $2::timestamp AND date < $3::timestamp
      GROUP BY category
      ORDER BY total DESC`,
    [USER_ID, s, e]
  );

  const totalExpenses = rows.reduce((sum, r) => sum + r.total, 0);
  return {
    period: range.label,
    currency: "MYR",
    totalExpenses: round(totalExpenses),
    categories: rows.map((r) => ({
      category: r.category,
      total: round(r.total),
      count: r.cnt,
      sharePct: totalExpenses > 0 ? round((r.total / totalExpenses) * 100, 1) : 0,
    })),
  };
}

// ─── 3. Spending trend ──────────────────────────────────────────────────────
export async function spendingTrend(range: Range, granularity?: Granularity) {
  const [s, e] = bounds(range);
  const gran = granularity ?? range.granularity;
  const fmt = gran === "month" ? "YYYY-MM" : "YYYY-MM-DD";

  const rows = await query<{ bucket: string; type: string; total: number }>(
    `SELECT to_char(date_trunc($4, date), $5) AS bucket, type, SUM(amount)::float8 AS total
       FROM transactions
      WHERE "userId" = $1 AND date >= $2::timestamp AND date < $3::timestamp
        AND "excludeFromStats" = false
      GROUP BY 1, type
      ORDER BY 1`,
    [USER_ID, s, e, gran, fmt]
  );

  const buckets = new Map<string, { income: number; expense: number }>();
  for (const r of rows) {
    const b = buckets.get(r.bucket) ?? { income: 0, expense: 0 };
    if (r.type === "income") b.income += r.total;
    else if (r.type === "expense") b.expense += r.total;
    buckets.set(r.bucket, b);
  }

  return {
    period: range.label,
    currency: "MYR",
    granularity: gran,
    points: [...buckets.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([bucket, v]) => ({
        bucket,
        income: round(v.income),
        expense: round(v.expense),
        net: round(v.income - v.expense),
      })),
  };
}

// ─── 4. Recent transactions (line-item detail) ──────────────────────────────
export async function listRecentTransactions(opts: {
  range: Range;
  category?: string;
  label?: string;
  limit: number;
}) {
  const [s, e] = bounds(opts.range);
  const params: unknown[] = [USER_ID, s, e];
  let sql =
    `SELECT id,
            to_char(date, 'YYYY-MM-DD"T"HH24:MI:SS') || 'Z' AS date,
            amount::float8 AS amount, type, category, note, labels
       FROM transactions
      WHERE "userId" = $1 AND date >= $2::timestamp AND date < $3::timestamp`;

  if (opts.category) {
    params.push(opts.category);
    sql += ` AND category = $${params.length}`;
  }
  if (opts.label) {
    params.push(opts.label);
    sql += ` AND $${params.length} = ANY(labels)`;
  }
  params.push(opts.limit);
  sql += ` ORDER BY date DESC LIMIT $${params.length}`;

  const rows = await query<{
    id: string;
    date: string;
    amount: number;
    type: string;
    category: string;
    note: string | null;
    labels: string[];
  }>(sql, params);

  return {
    period: opts.range.label,
    currency: "MYR",
    count: rows.length,
    transactions: rows.map((r) => ({
      date: r.date,
      amount: round(r.amount),
      type: r.type,
      category: r.category,
      note: r.note ?? undefined,
      labels: r.labels?.length ? r.labels : undefined,
    })),
  };
}

// ─── 5. Budget status ───────────────────────────────────────────────────────
// Mirrors computeBudgetSpent() in hooks/useDashboardState.ts. Budgets are
// monthly, so this is scoped to one calendar month. Note: budget spend does
// NOT honour excludeFromStats — only the per-budget excludedBudgetIds.
interface BudgetRow {
  id: string;
  name: string;
  amount: number;
  budgetType: string;
  category: string | null;
  excludedCategories: string[];
  labels: string[];
}
interface TxRow {
  amount: number;
  category: string;
  labels: string[];
  excludedBudgetIds: string[];
}

function budgetSpent(b: BudgetRow, txns: TxRow[]): number {
  return txns
    .filter((t) => {
      if (t.excludedBudgetIds?.includes(b.id)) return false;
      switch (b.budgetType) {
        case "overall":
          return true;
        case "category":
          return t.category === b.category;
        case "excluded":
          return !b.excludedCategories.includes(t.category);
        case "label":
          return b.labels.some((l) => t.labels?.includes(l));
        default:
          return false;
      }
    })
    .reduce((sum, t) => sum + t.amount, 0);
}

export async function budgetsStatus(range: Range) {
  const [s, e] = bounds(range);

  const budgets = await query<BudgetRow>(
    `SELECT id, name, amount::float8 AS amount, "budgetType",
            category, "excludedCategories", labels
       FROM budgets
      WHERE "userId" = $1
      ORDER BY name`,
    [USER_ID]
  );

  const txns = await query<TxRow>(
    `SELECT amount::float8 AS amount, category, labels, "excludedBudgetIds"
       FROM transactions
      WHERE "userId" = $1 AND type = 'expense'
        AND date >= $2::timestamp AND date < $3::timestamp`,
    [USER_ID, s, e]
  );

  return {
    period: range.label,
    currency: "MYR",
    budgets: budgets.map((b) => {
      const spent = budgetSpent(b, txns);
      return {
        name: b.name,
        type: b.budgetType,
        limit: round(b.amount),
        spent: round(spent),
        remaining: round(b.amount - spent),
        usedPct: b.amount > 0 ? round((spent / b.amount) * 100, 1) : null,
      };
    }),
  };
}

// ─── 6. Recurring commitments ───────────────────────────────────────────────
// Ports getNextDueDate / getRecurringStatus / toMonthlyAmount from lib/utils.ts
// (UTC-based "today" to match the Vercel-hosted app).
type Frequency = "daily" | "weekly" | "monthly" | "yearly";

function toMonthlyAmount(freq: Frequency, amount: number): number {
  switch (freq) {
    case "daily":
      return amount * (365 / 12);
    case "weekly":
      return amount * (52 / 12);
    case "monthly":
      return amount;
    case "yearly":
      return amount / 12;
  }
}

function nextDueDate(freq: Frequency, startDate: Date, lastRun: Date | null): Date {
  if (!lastRun) return new Date(startDate);
  const b = new Date(lastRun);
  if (freq === "daily") b.setUTCDate(b.getUTCDate() + 1);
  else if (freq === "weekly") b.setUTCDate(b.getUTCDate() + 7);
  else if (freq === "monthly") b.setUTCMonth(b.getUTCMonth() + 1);
  else if (freq === "yearly") b.setUTCFullYear(b.getUTCFullYear() + 1);
  return b;
}

function hasEnded(nextDue: Date, endDate: Date | null): boolean {
  if (!endDate) return false;
  const due = new Date(nextDue);
  due.setUTCHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setUTCHours(0, 0, 0, 0);
  return due > end;
}

export async function recurringCommitments() {
  const rows = await query<{
    name: string;
    category: string;
    amount: number;
    type: string;
    frequency: Frequency;
    isActive: boolean;
    startDate: string;
    endDate: string | null;
    lastRun: string | null;
  }>(
    `SELECT name, category, amount::float8 AS amount, type, frequency, "isActive",
            to_char("startDate", 'YYYY-MM-DD"T"HH24:MI:SS') || 'Z' AS "startDate",
            CASE WHEN "endDate" IS NULL THEN NULL
                 ELSE to_char("endDate", 'YYYY-MM-DD"T"HH24:MI:SS') || 'Z' END AS "endDate",
            CASE WHEN "lastRun" IS NULL THEN NULL
                 ELSE to_char("lastRun", 'YYYY-MM-DD"T"HH24:MI:SS') || 'Z' END AS "lastRun"
       FROM recurring_transactions
      WHERE "userId" = $1
      ORDER BY name`,
    [USER_ID]
  );

  let fixedMonthlyExpense = 0;
  let recurringMonthlyIncome = 0;
  const items: Array<{
    name: string;
    category: string;
    type: string;
    frequency: Frequency;
    amount: number;
    monthlyAmount: number;
  }> = [];

  for (const r of rows) {
    const due = nextDueDate(r.frequency, new Date(r.startDate), r.lastRun ? new Date(r.lastRun) : null);
    if (hasEnded(due, r.endDate ? new Date(r.endDate) : null)) continue;
    const monthly = toMonthlyAmount(r.frequency, r.amount);
    if (r.type === "expense") fixedMonthlyExpense += monthly;
    else if (r.type === "income") recurringMonthlyIncome += monthly;
    items.push({
      name: r.name,
      category: r.category,
      type: r.type,
      frequency: r.frequency,
      amount: round(r.amount),
      monthlyAmount: round(monthly),
    });
  }

  return {
    currency: "MYR",
    fixedMonthlyExpense: round(fixedMonthlyExpense),
    recurringMonthlyIncome: round(recurringMonthlyIncome),
    netMonthlyCommitment: round(recurringMonthlyIncome - fixedMonthlyExpense),
    items,
  };
}
