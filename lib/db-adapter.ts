import { db } from "@/lib/db";

export const IS_SQLITE = (process.env.DATABASE_URL ?? "").startsWith("file:");

export function parseLabels(val: string | string[]): string[] {
  if (Array.isArray(val)) return val;
  try { return JSON.parse(val); } catch { return []; }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function encodeLabels(labels: string[]): any {
  return IS_SQLITE ? JSON.stringify(labels) : labels;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeTx(tx: any) {
  return {
    ...tx,
    labels: parseLabels(tx.labels),
    excludedBudgetIds: parseLabels(tx.excludedBudgetIds ?? []),
    excludeFromStats: Boolean(tx.excludeFromStats ?? false),
  };
}

export function parseBudgetArray(val: string | string[]): string[] {
  if (Array.isArray(val)) return val;
  try { return JSON.parse(val); } catch { return []; }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function encodeBudgetArray(arr: string[]): any {
  return IS_SQLITE ? JSON.stringify(arr) : arr;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeBudget(b: any) {
  return {
    ...b,
    excludedCategories: parseBudgetArray(b.excludedCategories ?? []),
    labels: parseBudgetArray(b.labels ?? []),
  };
}

export function getLabelFilter(label?: string): Record<string, unknown> {
  if (!label) return {};
  if (IS_SQLITE) return {}; // SQLite: caller must do JS-side filtering
  return { labels: { has: label } };
}

// Normalizes a search token that looks like an amount ("45", "rm45", "1,200.50")
// to a positive number, or null when it isn't numeric.
export function parseAmountQuery(q: string): number | null {
  const cleaned = q.trim().replace(/^rm\s*/i, "").replace(/,/g, "");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Multi-field search clause for `q`: note/category substring (case-insensitive),
// exact label match (labels are short tags — substring matching isn't expressible
// on a string[] column), and exact amount when the query parses as a number.
// SQLite: returns {} and the caller filters in JS via matchesSearch (labels are
// JSON strings there) — same escape hatch as getLabelFilter.
export function getSearchFilter(q?: string): Record<string, unknown> {
  if (!q) return {};
  if (IS_SQLITE) return {};
  const amount = parseAmountQuery(q);
  return {
    OR: [
      { note: { contains: q, mode: "insensitive" } },
      { category: { contains: q, mode: "insensitive" } },
      { labels: { has: q } },
      ...(amount !== null ? [{ amount }] : []),
    ],
  };
}

// JS-side predicate mirroring getSearchFilter, for the SQLite path (runs on
// normalized transactions).
export function matchesSearch(
  tx: { note?: string | null; category: string; labels: string[]; amount: number },
  q: string
): boolean {
  const needle = q.toLowerCase();
  const amount = parseAmountQuery(q);
  return (
    (tx.note ?? "").toLowerCase().includes(needle) ||
    tx.category.toLowerCase().includes(needle) ||
    tx.labels.some((l) => l.toLowerCase() === needle) ||
    (amount !== null && tx.amount === amount)
  );
}

export type TrendGranularity = "day" | "month";

// Aggregated income/expense totals bucketed by day or by month, depending on
// `granularity`. The `day` field holds the bucket key: an ISO date/month string
// on SQLite, or a truncated Date on Postgres. Excludes `excludeFromStats` rows
// (chart basis) unless `includeOffChart` is set — the ledger-basis variant used
// by the wealth curve, where cumulative net balance must reflect every
// transaction.
export async function getTrendRows(
  userId: string,
  start: Date,
  end: Date,
  granularity: TrendGranularity = "day",
  includeOffChart = false
): Promise<Array<{ day: string | Date; type: string; total: number | bigint }>> {
  // Bound as 1/0 so the same template works on both dialects: when 1, the
  // excludeFromStats predicate is short-circuited away.
  const all = includeOffChart ? 1 : 0;
  if (granularity === "month") {
    if (IS_SQLITE) {
      // SQLite stores DateTime as integer epoch-ms, so convert to seconds and
      // use the 'unixepoch' modifier before strftime can format it.
      return db.$queryRaw<Array<{ day: string; type: string; total: number }>>`
        SELECT strftime('%Y-%m', date / 1000, 'unixepoch') AS day, type, SUM(amount) AS total
        FROM transactions
        WHERE userId = ${userId} AND date >= ${start} AND date <= ${end}
          AND (${all} = 1 OR excludeFromStats = 0)
        GROUP BY day, type
      `;
    }
    return db.$queryRaw<Array<{ day: Date; type: string; total: number | bigint }>>`
      SELECT date_trunc('month', date) AS day, type, SUM(amount) AS total
      FROM transactions
      WHERE "userId" = ${userId} AND date >= ${start} AND date <= ${end}
        AND (${all} = 1 OR "excludeFromStats" = false)
      GROUP BY day, type
    `;
  }

  if (IS_SQLITE) {
    // See note above re: integer epoch-ms storage.
    return db.$queryRaw<Array<{ day: string; type: string; total: number }>>`
      SELECT strftime('%Y-%m-%d', date / 1000, 'unixepoch') AS day, type, SUM(amount) AS total
      FROM transactions
      WHERE userId = ${userId} AND date >= ${start} AND date <= ${end}
        AND (${all} = 1 OR excludeFromStats = 0)
      GROUP BY day, type
    `;
  }
  return db.$queryRaw<Array<{ day: Date; type: string; total: number | bigint }>>`
    SELECT date_trunc('day', date) AS day, type, SUM(amount) AS total
    FROM transactions
    WHERE "userId" = ${userId} AND date >= ${start} AND date <= ${end}
      AND (${all} = 1 OR "excludeFromStats" = false)
    GROUP BY day, type
  `;
}

// Backward-compatible daily wrapper.
export function getDailyRows(userId: string, start: Date, end: Date) {
  return getTrendRows(userId, start, end, "day");
}
