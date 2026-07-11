import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { encodeLabels } from "@/lib/db-adapter";
import { transactionSchema } from "@/lib/validation";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.userId;
  if (!userId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  // Session version check — rejects stale JWTs after password change,
  // mirroring getAuthenticatedUserId() in lib/actions.ts
  const dbUser = await db.user.findUnique({
    where: { id: userId },
    select: { sessionVersion: true },
  });
  if (!dbUser || dbUser.sessionVersion !== (session.user.sessionVersion ?? 1)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  // Generous ceiling: a legitimate offline drain replays ops sequentially and
  // stays far below this; only scripted abuse hits it. Kept high on purpose —
  // a 429 counts as a retry failure client-side, and 5 failures drop the op.
  const rl = rateLimit(`sync:${userId}`, { limit: 300, windowMs: 60_000 });
  if (!rl.success) {
    return NextResponse.json(
      { success: false, error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } }
    );
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
      const { clientId, date } = payload as { clientId?: unknown; date?: unknown };

      if (clientId !== undefined && (typeof clientId !== "string" || clientId.length === 0 || clientId.length > 100)) {
        return NextResponse.json({ success: false, error: "Invalid clientId" }, { status: 400 });
      }
      const parsedDate = date !== undefined ? new Date(date as string) : undefined;
      if (parsedDate && isNaN(parsedDate.getTime())) {
        return NextResponse.json({ success: false, error: "Invalid date" }, { status: 400 });
      }

      // Same schema as the addTransaction server action — the offline path
      // must not be a weaker back door into the same table.
      const parsed = transactionSchema.safeParse({ ...payload, date: parsedDate });
      if (!parsed.success) {
        return NextResponse.json(
          { success: false, error: parsed.error.issues[0]?.message ?? "Invalid payload" },
          { status: 400 }
        );
      }
      const { category, amount, type, note, labels, excludedBudgetIds, excludeFromStats } = parsed.data;

      let tx;
      if (clientId) {
        tx = await db.transaction.upsert({
          where: { clientId },
          update: {},
          create: {
            userId,
            clientId,
            category,
            amount,
            type,
            note: note ?? null,
            date: parsedDate ?? new Date(),
            labels: encodeLabels(labels),
            excludedBudgetIds: encodeLabels(excludedBudgetIds),
            excludeFromStats,
          },
        });
        // clientId is globally unique, not per-user: if the upsert matched a
        // record owned by someone else, do not ack it (that would leak their
        // transaction id and silently drop this user's add).
        if (tx.userId !== userId) {
          return NextResponse.json({ success: false, error: "clientId conflict" }, { status: 409 });
        }
      } else {
        tx = await db.transaction.create({
          data: {
            userId,
            category,
            amount,
            type,
            note: note ?? null,
            date: parsedDate ?? new Date(),
            labels: encodeLabels(labels),
            excludedBudgetIds: encodeLabels(excludedBudgetIds),
            excludeFromStats,
          },
        });
      }

      return NextResponse.json({ success: true, id: tx.id });
    }

    if (op === "update") {
      if (!id) return NextResponse.json({ success: false, error: "Missing id" }, { status: 400 });

      const existing = await db.transaction.findFirst({ where: { id, userId } });
      if (!existing) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

      // Partial variant of the same schema updateTransaction uses.
      const parsed = transactionSchema.partial().safeParse(payload);
      if (!parsed.success) {
        return NextResponse.json(
          { success: false, error: parsed.error.issues[0]?.message ?? "Invalid payload" },
          { status: 400 }
        );
      }
      const v = parsed.data;
      // Key each write off presence in the RAW payload, not parsed.data:
      // Zod's .partial() still materializes .default() values for absent keys
      // (labels/excludedBudgetIds/excludeFromStats), so reading from parsed.data
      // would clobber those columns on any single-field update.
      const has = (k: string) => Object.prototype.hasOwnProperty.call(payload, k);

      await db.transaction.update({
        where: { id },
        data: {
          ...(has("category") && { category: v.category }),
          ...(has("amount") && { amount: v.amount }),
          ...(has("type") && { type: v.type }),
          ...(has("note") && { note: v.note || null }),
          ...(has("labels") && { labels: encodeLabels(v.labels!) }),
          ...(has("excludedBudgetIds") && { excludedBudgetIds: encodeLabels(v.excludedBudgetIds!) }),
          ...(has("excludeFromStats") && { excludeFromStats: v.excludeFromStats }),
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
