// @vitest-environment jsdom
import "fake-indexeddb/auto";
import FDBFactory from "fake-indexeddb/lib/FDBFactory";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LocalTransaction } from "./idb";

// lib/sync.ts imports getTransactionIds from @/lib/actions, which pulls in Prisma and
// next/cache — none of that may load in the test process, so the whole module is mocked.
vi.mock("@/lib/actions", () => ({
  getTransactionIds: vi.fn(),
}));

function jsonResponse(body: unknown, status = 200): Response {
  return { status, json: async () => body } as Response;
}

function syncedTx(overrides: Partial<LocalTransaction> = {}): LocalTransaction {
  return {
    id: "tx1",
    userId: "u1",
    category: "Food",
    amount: 20,
    type: "expense",
    labels: [],
    excludedBudgetIds: [],
    excludeFromStats: false,
    date: "2026-01-01T00:00:00.000Z",
    syncStatus: "synced",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

let sync: typeof import("./sync");
let idb: typeof import("./idb");
let actions: typeof import("@/lib/actions");
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  // lib/idb.ts caches its DB connection in a module-level singleton, so a fresh
  // IndexedDB backend alone isn't enough — the module itself must be re-imported.
  vi.resetModules();
  vi.stubGlobal("indexedDB", new FDBFactory());
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);

  sync = await import("./sync");
  idb = await import("./idb");
  actions = await import("@/lib/actions");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("applyLocalMutation", () => {
  it("add: writes a pending record and enqueues a matching add op", async () => {
    const result = await sync.applyLocalMutation("add", {
      userId: "u1",
      category: "Food",
      amount: 20,
      note: "lunch",
      labels: ["date"],
    });

    expect(result.wasQueued).toBe(true);
    const tempId = result.committed!.id;
    expect(tempId).toMatch(/^pending_/);

    const stored = await idb.getTransactionFromIDB(tempId);
    expect(stored?.syncStatus).toBe("pending");
    expect(stored?.category).toBe("Food");

    const ops = await idb.getAllQueuedOps();
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({
      op: "add",
      tempId,
      payload: expect.objectContaining({ category: "Food", amount: 20 }),
    });
  });

  it("update: on a synced record, flips it to pending-update and enqueues an update op with only the changed fields", async () => {
    await idb.putTransaction(syncedTx());

    const result = await sync.applyLocalMutation("update", { id: "tx1", userId: "u1", amount: 25 });
    expect(result.committed?.syncStatus).toBe("pending-update");

    const stored = await idb.getTransactionFromIDB("tx1");
    expect(stored?.syncStatus).toBe("pending-update");
    expect(stored?.amount).toBe(25);

    const ops = await idb.getAllQueuedOps();
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ op: "update", tempId: "tx1", payload: { amount: 25 } });
  });

  it("update: on a still-pending record, patches the queued add op in place instead of adding a second op", async () => {
    const added = await sync.applyLocalMutation("add", { userId: "u1", category: "Food", amount: 20 });
    const tempId = added.committed!.id;

    await sync.applyLocalMutation("update", { id: tempId, userId: "u1", amount: 99 });

    const ops = await idb.getAllQueuedOps();
    expect(ops).toHaveLength(1);
    expect(ops[0].op).toBe("add");
    expect(ops[0].payload.amount).toBe(99);

    const stored = await idb.getTransactionFromIDB(tempId);
    expect(stored?.amount).toBe(99);
    expect(stored?.syncStatus).toBe("pending");
  });

  it("delete: on a never-synced record, removes it locally and cancels its queued add op", async () => {
    const added = await sync.applyLocalMutation("add", { userId: "u1", category: "Food", amount: 20 });
    const tempId = added.committed!.id;

    await sync.applyLocalMutation("delete", { id: tempId, userId: "u1" });

    expect(await idb.getTransactionFromIDB(tempId)).toBeUndefined();
    expect(await idb.getAllQueuedOps()).toHaveLength(0);
  });

  it("delete: on a synced record, marks pending-delete and enqueues a delete op", async () => {
    await idb.putTransaction(syncedTx());

    await sync.applyLocalMutation("delete", { id: "tx1", userId: "u1" });

    const stored = await idb.getTransactionFromIDB("tx1");
    expect(stored?.syncStatus).toBe("pending-delete");

    const ops = await idb.getAllQueuedOps();
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ op: "delete", tempId: "tx1" });
  });
});

describe("drainQueue", () => {
  it("syncs a queued add and replaces the temp id with the server id", async () => {
    const added = await sync.applyLocalMutation("add", { userId: "u1", category: "Food", amount: 20 });
    const tempId = added.committed!.id;
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true, id: "real-1" }));

    const result = await sync.drainQueue();

    expect(result).toEqual({ synced: 1, failed: 0 });
    expect(await idb.getTransactionFromIDB(tempId)).toBeUndefined();
    const real = await idb.getTransactionFromIDB("real-1");
    expect(real?.syncStatus).toBe("synced");
    expect(await idb.getAllQueuedOps()).toHaveLength(0);
  });

  it("syncs a queued update", async () => {
    await idb.putTransaction(syncedTx());
    await sync.applyLocalMutation("update", { id: "tx1", userId: "u1", amount: 30 });
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true }));

    const result = await sync.drainQueue();

    expect(result).toEqual({ synced: 1, failed: 0 });
    const stored = await idb.getTransactionFromIDB("tx1");
    expect(stored?.syncStatus).toBe("synced");
    expect(stored?.syncError).toBeUndefined();
  });

  it("syncs a queued delete", async () => {
    await idb.putTransaction(syncedTx());
    await sync.applyLocalMutation("delete", { id: "tx1", userId: "u1" });
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true }));

    const result = await sync.drainQueue();

    expect(result).toEqual({ synced: 1, failed: 0 });
    expect(await idb.getTransactionFromIDB("tx1")).toBeUndefined();
  });

  it("treats a 404 on update as success (server already dropped the record)", async () => {
    await idb.putTransaction(syncedTx());
    await sync.applyLocalMutation("update", { id: "tx1", userId: "u1", amount: 30 });
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 404));

    const result = await sync.drainQueue();

    expect(result).toEqual({ synced: 1, failed: 0 });
    expect(await idb.getTransactionFromIDB("tx1")).toBeUndefined();
    expect(await idb.getAllQueuedOps()).toHaveLength(0);
  });

  it("treats a 404 on delete as success (already deleted server-side)", async () => {
    await idb.putTransaction(syncedTx());
    await sync.applyLocalMutation("delete", { id: "tx1", userId: "u1" });
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 404));

    const result = await sync.drainQueue();

    expect(result).toEqual({ synced: 1, failed: 0 });
    expect(await idb.getAllQueuedOps()).toHaveLength(0);
  });

  it("on failure, increments retryCount, sets a backoff window, and stops draining to preserve causal order", async () => {
    const first = await sync.applyLocalMutation("add", { userId: "u1", category: "Food", amount: 10 });
    await sync.applyLocalMutation("add", { userId: "u1", category: "Coffee", amount: 5 });
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: false, error: "boom" }));

    const before = Date.now();
    const result = await sync.drainQueue();

    expect(result).toEqual({ synced: 0, failed: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1); // the second queued op was never attempted

    const ops = await idb.getAllQueuedOps();
    expect(ops).toHaveLength(2); // both remain queued
    expect(ops[0].retryCount).toBe(1);
    // BASE_RETRY_DELAY_MS in lib/sync.ts is 30s; first retry has no prior backoff multiplier.
    expect(ops[0].nextRetryAt).toBeGreaterThanOrEqual(before + 30_000);

    const failedTx = await idb.getTransactionFromIDB(first.committed!.id);
    expect(failedTx?.syncError).toContain("boom");
  });

  it("drops an op once it has hit MAX_RETRIES, without attempting a fetch", async () => {
    // MAX_RETRIES in lib/sync.ts is 5.
    await idb.enqueueOp({
      op: "add",
      tempId: "pending_x",
      payload: {},
      createdAt: new Date().toISOString(),
      retryCount: 5,
    });

    const result = await sync.drainQueue();

    expect(result).toEqual({ synced: 0, failed: 1 });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await idb.getAllQueuedOps()).toHaveLength(0);
  });

  it("leaves an op inside its backoff window untouched unless force is passed", async () => {
    const future = Date.now() + 60_000;
    await idb.enqueueOp({
      op: "add",
      tempId: "pending_y",
      payload: { category: "X", amount: 1 },
      createdAt: new Date().toISOString(),
      retryCount: 1,
      nextRetryAt: future,
    });

    const gated = await sync.drainQueue();
    expect(gated).toEqual({ synced: 0, failed: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await idb.getAllQueuedOps()).toHaveLength(1);

    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true, id: "real-y" }));
    const forced = await sync.drainQueue({ force: true });
    expect(forced).toEqual({ synced: 1, failed: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("reconcileAfterSync", () => {
  it("purges local synced records that no longer exist on the server", async () => {
    await idb.putTransaction(syncedTx({ id: "tx1" }));
    await idb.putTransaction(syncedTx({ id: "tx2" }));
    vi.mocked(actions.getTransactionIds).mockResolvedValueOnce(["tx1"]);

    const purged = await sync.reconcileAfterSync("u1");

    expect(purged).toBe(1);
    expect(await idb.getTransactionFromIDB("tx1")).toBeDefined();
    expect(await idb.getTransactionFromIDB("tx2")).toBeUndefined();
  });

  it("returns 0 when the server lookup throws", async () => {
    vi.mocked(actions.getTransactionIds).mockRejectedValueOnce(new Error("network down"));

    await expect(sync.reconcileAfterSync("u1")).resolves.toBe(0);
  });
});
