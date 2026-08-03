import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getTransactions } from "@/lib/actions";
import { rateLimit } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Exports scan up to 10k rows — cap how fast they can be hammered.
  const rl = rateLimit(`export:${session.user.userId ?? "anon"}`, { limit: 20, windowMs: 60_000 });
  if (!rl.success) {
    return new Response("Too many requests", {
      status: 429,
      headers: { "Retry-After": String(rl.retryAfterSec) },
    });
  }

  const p = req.nextUrl.searchParams;
  const now = new Date();
  const month = p.get("month") ? parseInt(p.get("month")!) : now.getMonth() + 1;
  const year  = p.get("year")  ? parseInt(p.get("year")!)  : now.getFullYear();
  if (
    !Number.isInteger(month) || month < 1 || month > 12 ||
    !Number.isInteger(year) || year < 1970 || year > 9999
  ) {
    return new Response("Invalid month/year", { status: 400 });
  }
  const category = p.get("category") ?? undefined;
  const label    = p.get("label")    ?? undefined;
  const q        = p.get("q")        ?? undefined;
  const type     = p.get("type")     ?? undefined;
  if (type !== undefined && type !== "income" && type !== "expense") {
    return new Response("Invalid type", { status: 400 });
  }
  const amountMin = p.get("min") ? Number(p.get("min")) : undefined;
  const amountMax = p.get("max") ? Number(p.get("max")) : undefined;
  if (
    (amountMin !== undefined && !Number.isFinite(amountMin)) ||
    (amountMax !== undefined && !Number.isFinite(amountMax))
  ) {
    return new Response("Invalid min/max amount", { status: 400 });
  }
  // Same semantics as the transactions page: both bounds are local-calendar
  // days (a bare "yyyy-MM-dd" parses as UTC), `to` inclusive to end-of-day
  const from = p.get("from") ? new Date(p.get("from")! + "T00:00:00") : undefined;
  const to   = p.get("to")   ? new Date(p.get("to")! + "T23:59:59.999") : undefined;
  if ((from && isNaN(from.getTime())) || (to && isNaN(to.getTime()))) {
    return new Response("Invalid from/to date", { status: 400 });
  }

  let transactions;
  try {
    ({ transactions } = await getTransactions({
      month,
      year,
      category,
      label,
      q,
      type,
      amountMin,
      amountMax,
      from,
      to,
      limit: 10000,
    }));
  } catch (e) {
    const message = e instanceof Error ? e.message : "";
    return message === "Unauthorized"
      ? new Response("Unauthorized", { status: 401 })
      : new Response("Export failed", { status: 500 });
  }

  // Double up embedded quotes so commas/quotes in any field can't break the
  // row, and neutralize spreadsheet formula injection: Excel/Sheets execute
  // cells starting with = + - @ (or tab/CR) as formulas, so prefix those with
  // a literal apostrophe.
  const esc = (s: string) => {
    const quoted = s.replace(/"/g, '""');
    return /^[=+\-@\t\r]/.test(quoted) ? `'${quoted}` : quoted;
  };
  const rows = transactions.map((tx) => {
    const date     = new Date(tx.date).toISOString().split("T")[0];
    const category = esc(tx.category);
    const note     = esc(tx.note ?? "");
    const labels   = esc((tx.labels ?? []).join(";"));
    return `${date},"${category}",${tx.type},${tx.amount.toFixed(2)},"${note}","${labels}"`;
  });

  const csv = ["Date,Category,Type,Amount (RM),Note,Labels", ...rows].join("\n");

  const isoDay = (d: Date) => d.toISOString().split("T")[0];
  const filename = from || to
    ? `expenses-${from ? isoDay(from) : "start"}-to-${to ? isoDay(to) : "end"}.csv`
    : `expenses-${year}-${String(month).padStart(2, "0")}.csv`;
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename=${filename}`,
    },
  });
}
