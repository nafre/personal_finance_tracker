import {
  deleteQueuedOp,
  replaceTempId,
  patchTransaction,
  deleteTransactionFromIDB,
  enqueueOp,
  putTransaction,
  getTransactionFromIDB,
  getAllQueuedOps as getOps,
  updateQueuedOp,
  seedIDBFromServer,
  reconcileWithServer,
  type LocalTransaction,
} from "@/lib/idb";
import { getTransactionIds } from "@/lib/actions";

export { seedIDBFromServer };

const MAX_RETRIES = 5;

export async function drainQueue(): Promise<{ synced: number; failed: number }> {
  // Web lock serialises drains across tabs and the service worker — concurrent
  // drains can race on retry counts, temp-ID replacement, and queue deletes.
  if (typeof navigator !== "undefined" && navigator.locks) {
    const result = await navigator.locks.request(
      "expense-sync-drain",
      { ifAvailable: true },
      async (lock) => {
        if (!lock) return null; // another context is already draining
        return _drainQueue();
      }
    );
    return result ?? { synced: 0, failed: 0 };
  }
  return _drainQueue();
}

async function _drainQueue(): Promise<{ synced: number; failed: number }> {
  const ops = await getOps();
  if (ops.length === 0) return { synced: 0, failed: 0 };

  let synced = 0;
  let failed = 0;
  // Maps old tempIds to real server IDs resolved during this drain run
  const tempIdMap = new Map<string, string>();

  for (const op of ops) {
    const queueId = op.queueId!;
    // Resolve the ID: if a prior ADD in this run mapped it to a real ID, use that
    const resolvedId = tempIdMap.get(op.tempId) ?? op.tempId;

    // Drop permanently-failed ops to prevent queue deadlock
    if ((op.retryCount ?? 0) >= MAX_RETRIES) {
      console.warn("[sync] Dropping op after max retries", { op: op.op, resolvedId, retryCount: op.retryCount });
      await deleteQueuedOp(queueId);
      failed++;
      continue;
    }

    try {
      if (op.op === "add") {
        const res = await fetch("/api/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ op: "add", payload: op.payload }),
        });

        const data = await res.json();
        if (!data.success) throw new Error(data.error ?? `HTTP ${res.status}`);

        const realId: string = data.id;
        tempIdMap.set(op.tempId, realId);
        await replaceTempId(op.tempId, realId);

      } else if (op.op === "update") {
        const res = await fetch("/api/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ op: "update", id: resolvedId, payload: op.payload }),
        });

        if (res.status === 404) {
          // Server deleted this record while we were offline — discard stale local copy
          await deleteTransactionFromIDB(resolvedId);
          await deleteQueuedOp(queueId);
          synced++;
          continue;
        }

        const data = await res.json();
        if (!data.success) throw new Error(data.error ?? `HTTP ${res.status}`);

        await patchTransaction(resolvedId, { syncStatus: "synced", syncError: undefined });

      } else if (op.op === "delete") {
        const res = await fetch("/api/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ op: "delete", id: resolvedId }),
        });

        if (res.status === 404) {
          // Already deleted server-side — treat as success
          await deleteTransactionFromIDB(resolvedId);
          await deleteQueuedOp(queueId);
          synced++;
          continue;
        }

        const data = await res.json();
        if (!data.success) throw new Error(data.error ?? `HTTP ${res.status}`);

        await deleteTransactionFromIDB(resolvedId);
      }

      await deleteQueuedOp(queueId);
      synced++;
    } catch (error) {
      console.error("[sync] Failed to sync op", { op: op.op, resolvedId, error });
      await patchTransaction(resolvedId, { syncError: String(error) });
      // Increment retry count before breaking to preserve causal order
      await updateQueuedOp({ ...op, retryCount: (op.retryCount ?? 0) + 1 });
      failed++;
      break; // Stop draining to preserve causal order
    }
  }

  return { synced, failed };
}

export async function applyLocalMutation(
  op: "add" | "update" | "delete",
  data: {
    id?: string;
    userId: string;
    category?: string;
    amount?: number;
    type?: "income" | "expense";
    note?: string;
    labels?: string[];
    excludedBudgetIds?: string[];
    excludeFromStats?: boolean;
    date?: string;
  }
): Promise<{ committed: LocalTransaction | null; wasQueued: boolean }> {
  const now = new Date().toISOString();

  if (op === "add") {
    const tempId = `pending_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const localTx: LocalTransaction = {
      id: tempId,
      userId: data.userId,
      category: data.category ?? "",
      amount: data.amount ?? 0,
      type: data.type ?? "expense",
      note: data.note,
      labels: data.labels ?? [],
      excludedBudgetIds: data.excludedBudgetIds ?? [],
      excludeFromStats: data.excludeFromStats ?? false,
      date: data.date ?? now,
      syncStatus: "pending",
      createdAt: now,
    };

    await putTransaction(localTx);
    await enqueueOp({
      op: "add",
      tempId,
      payload: {
        clientId: tempId,
        category: localTx.category,
        amount: localTx.amount,
        type: localTx.type,
        note: localTx.note,
        labels: localTx.labels,
        excludedBudgetIds: localTx.excludedBudgetIds,
        excludeFromStats: localTx.excludeFromStats,
        date: localTx.date,
      },
      createdAt: now,
    });

    return { committed: localTx, wasQueued: true };
  }

  if (op === "update" && data.id) {
    const existing = await getTransactionFromIDB(data.id);
    if (!existing) return { committed: null, wasQueued: false };

    const updated: LocalTransaction = {
      ...existing,
      ...(data.category !== undefined && { category: data.category }),
      ...(data.amount !== undefined && { amount: data.amount }),
      ...(data.type !== undefined && { type: data.type }),
      ...(data.note !== undefined && { note: data.note }),
      ...(data.labels !== undefined && { labels: data.labels }),
      ...(data.excludedBudgetIds !== undefined && { excludedBudgetIds: data.excludedBudgetIds }),
      ...(data.excludeFromStats !== undefined && { excludeFromStats: data.excludeFromStats }),
      syncStatus:
        existing.syncStatus === "pending" ? "pending" : "pending-update",
    };

    await putTransaction(updated);

    if (existing.syncStatus === "synced") {
      // Synced record — enqueue an UPDATE op
      await enqueueOp({
        op: "update",
        tempId: data.id,
        payload: {
          ...(data.category !== undefined && { category: data.category }),
          ...(data.amount !== undefined && { amount: data.amount }),
          ...(data.type !== undefined && { type: data.type }),
          ...(data.note !== undefined && { note: data.note }),
          ...(data.labels !== undefined && { labels: data.labels }),
          ...(data.excludedBudgetIds !== undefined && { excludedBudgetIds: data.excludedBudgetIds }),
          ...(data.excludeFromStats !== undefined && { excludeFromStats: data.excludeFromStats }),
        },
        createdAt: now,
      });
    } else {
      // Still pending-add — update the existing ADD op's payload in-place
      const allOps = await getOps();
      const addOp = allOps.find((o) => o.op === "add" && o.tempId === data.id);
      if (addOp?.queueId !== undefined) {
        await updateQueuedOp({
          ...addOp,
          payload: {
            ...addOp.payload,
            ...(data.category !== undefined && { category: data.category }),
            ...(data.amount !== undefined && { amount: data.amount }),
            ...(data.type !== undefined && { type: data.type }),
            ...(data.note !== undefined && { note: data.note }),
            ...(data.labels !== undefined && { labels: data.labels }),
            ...(data.excludedBudgetIds !== undefined && { excludedBudgetIds: data.excludedBudgetIds }),
            ...(data.excludeFromStats !== undefined && { excludeFromStats: data.excludeFromStats }),
          },
        });
      }
    }

    return { committed: updated, wasQueued: true };
  }

  if (op === "delete" && data.id) {
    const existing = await getTransactionFromIDB(data.id);
    if (!existing) return { committed: null, wasQueued: false };

    if (existing.syncStatus === "pending") {
      // Never synced — cancel locally: remove IDB record + queue ADD entry
      await deleteTransactionFromIDB(data.id);
      const allOps = await getOps();
      for (const qOp of allOps) {
        if (qOp.op === "add" && qOp.tempId === data.id && qOp.queueId !== undefined) {
          await deleteQueuedOp(qOp.queueId);
        }
      }
    } else {
      // Already synced — mark for deletion and enqueue DELETE op
      await patchTransaction(data.id, { syncStatus: "pending-delete" });
      await enqueueOp({
        op: "delete",
        tempId: data.id,
        payload: {},
        createdAt: now,
      });
    }

    return { committed: null, wasQueued: true };
  }

  return { committed: null, wasQueued: false };
}

export async function reconcileAfterSync(userId: string): Promise<number> {
  try {
    const serverIds = await getTransactionIds();
    return await reconcileWithServer(new Set(serverIds), userId);
  } catch {
    return 0;
  }
}
