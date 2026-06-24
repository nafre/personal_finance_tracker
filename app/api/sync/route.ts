import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { encodeLabels } from "@/lib/db-adapter";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.userId;
  if (!userId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: { op: string; id?: string; payload?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  const { op, id, payload = {} } = body;

  try {
    if (op === "add") {
      const { clientId, category, amount, type, note, labels, excludedBudgetIds, excludeFromStats, date } = payload as {
        clientId?: string;
        category: string;
        amount: number;
        type: string;
        note?: string;
        labels?: string[];
        excludedBudgetIds?: string[];
        excludeFromStats?: boolean;
        date?: string;
      };

      if (!category || amount == null || !type) {
        return NextResponse.json({ success: false, error: "Missing required fields" }, { status: 400 });
      }
      if (typeof amount !== "number" || !isFinite(amount) || amount <= 0) {
        return NextResponse.json({ success: false, error: "amount must be a positive number" }, { status: 400 });
      }
      if (type !== "income" && type !== "expense") {
        return NextResponse.json({ success: false, error: "type must be income or expense" }, { status: 400 });
      }
      if (date !== undefined && isNaN(new Date(date as string).getTime())) {
        return NextResponse.json({ success: false, error: "Invalid date" }, { status: 400 });
      }

      let tx;
      if (clientId) {
        tx = await db.transaction.upsert({
          where: { clientId },
          update: {},
          create: {
            userId,
            clientId,
            category,
            amount: Number(amount),
            type,
            note: note ?? null,
            date: date ? new Date(date) : new Date(),
            labels: encodeLabels(labels ?? []),
            excludedBudgetIds: encodeLabels(excludedBudgetIds ?? []),
            excludeFromStats: excludeFromStats ?? false,
          },
        });
      } else {
        tx = await db.transaction.create({
          data: {
            userId,
            category,
            amount: Number(amount),
            type,
            note: note ?? null,
            date: date ? new Date(date) : new Date(),
            labels: encodeLabels(labels ?? []),
            excludedBudgetIds: encodeLabels(excludedBudgetIds ?? []),
            excludeFromStats: excludeFromStats ?? false,
          },
        });
      }

      return NextResponse.json({ success: true, id: tx.id });
    }

    if (op === "update") {
      if (!id) return NextResponse.json({ success: false, error: "Missing id" }, { status: 400 });

      const existing = await db.transaction.findFirst({ where: { id, userId } });
      if (!existing) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

      const { category, amount, type, note, labels, excludedBudgetIds, excludeFromStats } = payload as {
        category?: string;
        amount?: number;
        type?: string;
        note?: string;
        labels?: string[];
        excludedBudgetIds?: string[];
        excludeFromStats?: boolean;
      };

      await db.transaction.update({
        where: { id },
        data: {
          ...(category !== undefined && { category }),
          ...(amount !== undefined && { amount: Number(amount) }),
          ...(type !== undefined && { type }),
          ...(note !== undefined && { note: note || null }),
          ...(labels !== undefined && { labels: encodeLabels(labels) }),
          ...(excludedBudgetIds !== undefined && { excludedBudgetIds: encodeLabels(excludedBudgetIds) }),
          ...(excludeFromStats !== undefined && { excludeFromStats }),
        },
      });

      return NextResponse.json({ success: true });
    }

    if (op === "delete") {
      if (!id) return NextResponse.json({ success: false, error: "Missing id" }, { status: 400 });

      const existing = await db.transaction.findFirst({ where: { id, userId } });
      if (!existing) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

      await db.transaction.delete({ where: { id } });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: false, error: "Invalid op" }, { status: 400 });
  } catch (error) {
    console.error("[sync] Unhandled error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
