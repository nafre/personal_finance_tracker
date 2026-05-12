import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getTransactions } from "@/lib/actions";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const p = req.nextUrl.searchParams;
  const month = parseInt(p.get("month") ?? String(new Date().getMonth() + 1));
  const year  = parseInt(p.get("year")  ?? String(new Date().getFullYear()));
  const category = p.get("category") ?? undefined;
  const label    = p.get("label")    ?? undefined;
  const q        = p.get("q")        ?? undefined;

  const { transactions } = await getTransactions({
    month,
    year,
    category,
    label,
    q,
    limit: 10000,
  });

  const rows = transactions.map((tx) => {
    const date   = new Date(tx.date).toISOString().split("T")[0];
    const note   = (tx.note ?? "").replace(/"/g, '""');
    const labels = (tx.labels ?? []).join(";");
    return `${date},"${tx.category}",${tx.type},${tx.amount.toFixed(2)},"${note}","${labels}"`;
  });

  const csv = ["Date,Category,Type,Amount (RM),Note,Labels", ...rows].join("\n");

  const monthPadded = String(month).padStart(2, "0");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename=expenses-${year}-${monthPadded}.csv`,
    },
  });
}
