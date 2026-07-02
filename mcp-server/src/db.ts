import pg from "pg";

// ─── Connection ─────────────────────────────────────────────────────────────
// Read-only pool. Prefer a dedicated read-only role (DATABASE_READONLY_URL);
// fall back to the app's pooled URL so the server still works in a pinch.
const connectionString =
  process.env.DATABASE_READONLY_URL || process.env.POSTGRES_PRISMA_URL;

if (!connectionString) {
  throw new Error(
    "No database URL set. Provide DATABASE_READONLY_URL (preferred) or POSTGRES_PRISMA_URL."
  );
}

export const pool = new pg.Pool({ connectionString, max: 3 });

// The single user whose data this server exposes (matches APP_USER_ID).
export const USER_ID = process.env.EXPENSE_USER_ID || "default-user";

export async function query<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = []
): Promise<T[]> {
  const res = await pool.query(text, params);
  return res.rows as T[];
}

// ─── Timezone-safe boundaries ───────────────────────────────────────────────
// The main app runs on Vercel (process TZ = UTC), so its month/year boundaries
// are UTC midnights (`new Date(year, month-1, 1)` === UTC midnight there) and
// the `date` column stores UTC wall-clock instants (Prisma writes UTC). To make
// these numbers match the dashboard exactly — regardless of THIS process's TZ or
// pgbouncer session settings — we:
//   1. build all boundaries in UTC (Date.UTC), and
//   2. compare as offset-free `timestamp` literals (UTC wall-clock strings),
//      so Postgres never applies a timezone conversion.
export function toPgTimestamp(d: Date): string {
  // "2026-06-01T00:00:00.000Z" -> "2026-06-01 00:00:00.000"
  return d.toISOString().replace("T", " ").replace("Z", "");
}

export type Granularity = "day" | "month";

export interface Range {
  start: Date;
  end: Date; // exclusive upper bound
  label: string;
  granularity: Granularity;
}

export type PeriodKeyword =
  | "this_month"
  | "last_month"
  | "this_year"
  | "last_year"
  | "all_time"
  | "custom";

function monthLabel(year: number, monthIdx: number): string {
  return new Date(Date.UTC(year, monthIdx, 1)).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function resolvePeriod(
  period: PeriodKeyword,
  from?: string,
  to?: string
): Range {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const u = (yy: number, mm: number, dd = 1) => new Date(Date.UTC(yy, mm, dd));

  switch (period) {
    case "this_month":
      return { start: u(y, m), end: u(y, m + 1), label: monthLabel(y, m), granularity: "day" };
    case "last_month":
      return { start: u(y, m - 1), end: u(y, m), label: monthLabel(y, m - 1), granularity: "day" };
    case "this_year":
      return { start: u(y, 0), end: u(y + 1, 0), label: `${y}`, granularity: "month" };
    case "last_year":
      return { start: u(y - 1, 0), end: u(y, 0), label: `${y - 1}`, granularity: "month" };
    case "all_time":
      return { start: u(2000, 0), end: u(y, m + 1), label: "All time", granularity: "month" };
    case "custom": {
      if (!from) throw new Error("custom period requires 'from' (YYYY-MM-DD)");
      const start = new Date(`${from}T00:00:00Z`);
      // `to` is inclusive of that whole day -> exclusive bound is next midnight.
      const end = to
        ? new Date(new Date(`${to}T00:00:00Z`).getTime() + 86_400_000)
        : u(y, m + 1);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        throw new Error("Invalid 'from'/'to' date; expected YYYY-MM-DD");
      }
      const spanDays = (end.getTime() - start.getTime()) / 86_400_000;
      return {
        start,
        end,
        label: `${from} → ${to ?? "now"}`,
        granularity: spanDays > 62 ? "month" : "day",
      };
    }
    default:
      throw new Error(`Unknown period: ${period}`);
  }
}

// Range for a specific calendar month (used by budgets, which are monthly).
export function monthRange(month: number, year: number): Range {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return { start, end, label: monthLabel(year, month - 1), granularity: "day" };
}
