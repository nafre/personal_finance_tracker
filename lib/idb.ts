import { openDB, DBSchema, IDBPDatabase } from "idb";

export interface LocalTransaction {
  id: string;
  userId: string;
  category: string;
  amount: number;
  type: "income" | "expense";
  note?: string;
  labels: string[];
  excludedBudgetIds: string[];
  excludeFromStats: boolean;
  date: string; // ISO string
  syncStatus: "synced" | "pending" | "pending-update" | "pending-delete";
  syncError?: string;
  createdAt: string; // ISO string
}

export interface QueuedOp {
  queueId?: number; // set by autoIncrement on insert
  op: "add" | "update" | "delete";
  tempId: string;
  payload: Record<string, unknown>;
  createdAt: string;
  retryCount?: number; // incremented on each failed drain attempt; op dropped at MAX_RETRIES
  nextRetryAt?: number; // epoch ms — exponential-backoff gate; drains skip the queue until this passes
}

interface ExpenseTrackerDB extends DBSchema {
  transactions: {
    key: string;
    value: LocalTransaction;
    indexes: {
      "by-userId": string;
      "by-date": string;
      "by-syncStatus": string;
    };
  };
  syncQueue: {
    key: number;
    value: QueuedOp;
    indexes: {
      "by-tempId": string;
    };
  };
}

const DB_NAME = "expense-tracker-v1";
const DB_VERSION = 2;

let _dbPromise: Promise<IDBPDatabase<ExpenseTrackerDB>> | null = null;

function getDB(): Promise<IDBPDatabase<ExpenseTrackerDB>> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("IDB not available in SSR"));
  }
  if (!_dbPromise) {
    _dbPromise = openDB<ExpenseTrackerDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          const txStore = db.createObjectStore("transactions", { keyPath: "id" });
          txStore.createIndex("by-userId", "userId");
          txStore.createIndex("by-date", "date");
          txStore.createIndex("by-syncStatus", "syncStatus");

          const queueStore = db.createObjectStore("syncQueue", {
            keyPath: "queueId",
            autoIncrement: true,
          });
          queueStore.createIndex("by-tempId", "tempId");
        }
        // v2: retryCount added to QueuedOp — schema-less field, no structural change needed.
        // Existing records without retryCount are treated as retryCount=0 in drainQueue.
      },
    });
  }
  return _dbPromise;
}

export async function putTransaction(tx: LocalTransaction): Promise<void> {
  const db = await getDB();
  await db.put("transactions", tx);
}

export async function patchTransaction(
  id: string,
  patch: Partial<LocalTransaction>
): Promise<void> {
  const db = await getDB();
  const existing = await db.get("transactions", id);
  if (!existing) return;
  await db.put("transactions", { ...existing, ...patch });
}

export async function getTransactionsByMonth(
  userId: string,
  month: number,
  year: number
): Promise<LocalTransaction[]> {
  const db = await getDB();
  const start = new Date(year, month - 1, 1).toISOString();
  const end = new Date(year, month, 0, 23, 59, 59, 999).toISOString();
  const range = IDBKeyRange.bound(start, end);
  const all = await db.getAllFromIndex("transactions", "by-date", range);
  return all.reverse().filter((t) => t.userId === userId);
}

// Range variant used by the year / all-time dashboard views. `startISO`/`endISO`
// are ISO date strings; reads via the same `by-date` index as the month helper.
export async function getTransactionsInRange(
  userId: string,
  startISO: string,
  endISO: string
): Promise<LocalTransaction[]> {
  const db = await getDB();
  const range = IDBKeyRange.bound(startISO, endISO);
  const all = await db.getAllFromIndex("transactions", "by-date", range);
  return all.reverse().filter((t) => t.userId === userId);
}

export async function getTransactionFromIDB(
  id: string
): Promise<LocalTransaction | undefined> {
  const db = await getDB();
  return db.get("transactions", id);
}

export async function deleteTransactionFromIDB(id: string): Promise<void> {
  const db = await getDB();
  await db.delete("transactions", id);
}

export async function replaceTempId(
  tempId: string,
  realId: string,
  serverPatch: Partial<LocalTransaction> = {}
): Promise<void> {
  const db = await getDB();
  const txn = db.transaction(["transactions", "syncQueue"], "readwrite");

  const old = await txn.objectStore("transactions").get(tempId);
  if (old) {
    await txn.objectStore("transactions").delete(tempId);
    await txn.objectStore("transactions").put({
      ...old,
      ...serverPatch,
      id: realId,
      syncStatus: "synced",
      syncError: undefined,
    });
  }

  // Update any remaining syncQueue entries that reference the old tempId
  let cursor = await txn
    .objectStore("syncQueue")
    .index("by-tempId")
    .openCursor(IDBKeyRange.only(tempId));
  while (cursor) {
    await cursor.update({ ...cursor.value, tempId: realId });
    cursor = await cursor.continue();
  }

  await txn.done;
}

export async function enqueueOp(op: Omit<QueuedOp, "queueId">): Promise<void> {
  const db = await getDB();
  await db.add("syncQueue", op as QueuedOp);
}

export async function getAllQueuedOps(): Promise<QueuedOp[]> {
  const db = await getDB();
  // getAll returns records ordered by primary key (queueId, autoIncrement = insertion order)
  return db.getAll("syncQueue");
}

export async function deleteQueuedOp(queueId: number): Promise<void> {
  const db = await getDB();
  await db.delete("syncQueue", queueId);
}

export async function updateQueuedOp(op: QueuedOp): Promise<void> {
  const db = await getDB();
  await db.put("syncQueue", op);
}

export async function getPendingCount(): Promise<number> {
  const db = await getDB();
  return db.count("syncQueue");
}

export async function getFailedSyncCount(): Promise<number> {
  const db = await getDB();
  const statuses = ["pending", "pending-update", "pending-delete"] as const;
  let count = 0;
  for (const status of statuses) {
    const rows = await db.getAllFromIndex("transactions", "by-syncStatus", status);
    count += rows.filter((t) => t.syncError).length;
  }
  return count;
}

export async function seedIDBFromServer(
  serverTransactions: Array<{
    id: string;
    category: string;
    amount: number;
    type: string;
    note?: string | null;
    labels?: string[];
    excludedBudgetIds?: string[];
    excludeFromStats?: boolean;
    date: Date | string;
  }>,
  userId: string
): Promise<void> {
  if (typeof window === "undefined") return;
  const db = await getDB();
  const txn = db.transaction("transactions", "readwrite");
  const now = new Date().toISOString();

  for (const tx of serverTransactions) {
    const existing = await txn.store.get(tx.id);
    // Never overwrite a pending local change
    if (existing && existing.syncStatus !== "synced") continue;

    await txn.store.put({
      id: tx.id,
      userId,
      category: tx.category,
      amount: tx.amount,
      type: tx.type as "income" | "expense",
      note: tx.note ?? undefined,
      labels: tx.labels ?? [],
      excludedBudgetIds: tx.excludedBudgetIds ?? [],
      excludeFromStats: tx.excludeFromStats ?? false,
      date:
        typeof tx.date === "string" ? tx.date : new Date(tx.date).toISOString(),
      syncStatus: "synced",
      createdAt: now,
    });
  }

  await txn.done;
}

// Wipes both stores. Called on sign-out so financial data doesn't linger in
// IndexedDB on a shared device. Any still-pending offline ops are discarded —
// sign-out is an explicit choice to leave, not a moment to sync.
export async function clearAllLocalData(): Promise<void> {
  if (typeof window === "undefined") return;
  const db = await getDB();
  const txn = db.transaction(["transactions", "syncQueue"], "readwrite");
  await Promise.all([
    txn.objectStore("transactions").clear(),
    txn.objectStore("syncQueue").clear(),
  ]);
  await txn.done;
}

export async function reconcileWithServer(
  serverIds: Set<string>,
  userId: string
): Promise<number> {
  if (typeof window === "undefined") return 0;
  const db = await getDB();
  const txn = db.transaction("transactions", "readwrite");
  const all = await txn.store.index("by-userId").getAll(IDBKeyRange.only(userId));
  let deleted = 0;
  for (const record of all) {
    if (record.syncStatus === "synced" && !serverIds.has(record.id)) {
      await txn.store.delete(record.id);
      deleted++;
    }
  }
  await txn.done;
  return deleted;
}
