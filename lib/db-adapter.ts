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

export async function getDailyRows(
  userId: string,
  start: Date,
  end: Date
): Promise<Array<{ day: string | Date; type: string; total: number | bigint }>> {
  if (IS_SQLITE) {
    return db.$queryRaw<Array<{ day: string; type: string; total: number }>>`
      SELECT strftime('%Y-%m-%d', date) AS day, type, SUM(amount) AS total
      FROM transactions
      WHERE userId = ${userId} AND date >= ${start} AND date <= ${end}
      GROUP BY day, type
    `;
  }
  return db.$queryRaw<Array<{ day: Date; type: string; total: number | bigint }>>`
    SELECT date_trunc('day', date) AS day, type, SUM(amount) AS total
    FROM transactions
    WHERE "userId" = ${userId} AND date >= ${start} AND date <= ${end}
    GROUP BY day, type
  `;
}
