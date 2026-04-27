const CACHE_NAME = "expense-tracker-v1";
const DB_NAME = "expense-tracker-v1";
const SHELL_ASSETS = ["/dashboard", "/transactions", "/manifest.json"];
const STATIC_PREFIX = "/_next/static/";
const ICONS_PREFIX = "/icons/";

// ── Install: cache shell assets ───────────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_ASSETS).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: take control & prune old caches ─────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

// ── Fetch: cache-first for statics, network-first for pages ───────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin GETs
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  // Skip API routes — always hit the network
  if (url.pathname.startsWith("/api/")) return;

  // Cache-first: Next.js static chunks + icons
  if (url.pathname.startsWith(STATIC_PREFIX) || url.pathname.startsWith(ICONS_PREFIX)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((res) => {
          if (res.ok) {
            caches.open(CACHE_NAME).then((c) => c.put(request, res.clone()));
          }
          return res;
        });
      })
    );
    return;
  }

  // Network-first for page navigations: fall back to cache when offline
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            caches.open(CACHE_NAME).then((c) => c.put(request, res.clone()));
          }
          return res;
        })
        .catch(() => caches.match(request).then((cached) => cached ?? Response.error()))
    );
  }
});

// ── BackgroundSync: drain queue when browser has connectivity ─────────────────
self.addEventListener("sync", (event) => {
  if (event.tag === "expense-sync") {
    event.waitUntil(syncQueueFromSW());
  }
});

async function syncQueueFromSW() {
  const ops = await readQueueFromIDB();
  if (ops.length === 0) return;

  const tempIdMap = new Map();

  for (const op of ops) {
    const resolvedId = tempIdMap.get(op.tempId) ?? op.tempId;
    try {
      let body;
      if (op.op === "add") {
        body = { op: "add", payload: op.payload };
      } else if (op.op === "update") {
        body = { op: "update", id: resolvedId, payload: op.payload };
      } else {
        body = { op: "delete", id: resolvedId };
      }

      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(body),
      });

      if (!res.ok) continue;
      const data = await res.json();
      if (!data.success) continue;

      if (op.op === "add" && data.id) {
        tempIdMap.set(op.tempId, data.id);
        await replaceTempIdInIDB(op.tempId, data.id);
      } else if (op.op === "update") {
        await patchTransactionInIDB(resolvedId, { syncStatus: "synced" });
      } else if (op.op === "delete") {
        await deleteTransactionInIDB(resolvedId);
      }

      await deleteQueuedOpInIDB(op.queueId);
    } catch {
      break; // preserve causal ordering on failure
    }
  }
}

// ── Raw IDB helpers (no idb library in SW context) ───────────────────────────

function openIDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    // If the DB doesn't exist yet (page never loaded), just fail gracefully
    req.onupgradeneeded = () => {
      reject(new Error("IDB not initialized by page yet"));
      req.transaction.abort();
    };
  });
}

function readQueueFromIDB() {
  return new Promise(async (resolve) => {
    let db;
    try { db = await openIDB(); } catch { resolve([]); return; }
    const txn = db.transaction("syncQueue", "readonly");
    const req = txn.objectStore("syncQueue").getAll();
    req.onsuccess = () => resolve(req.result ?? []);
    req.onerror = () => resolve([]);
  });
}

function deleteQueuedOpInIDB(queueId) {
  return new Promise(async (resolve) => {
    let db;
    try { db = await openIDB(); } catch { resolve(); return; }
    const txn = db.transaction("syncQueue", "readwrite");
    txn.objectStore("syncQueue").delete(queueId);
    txn.oncomplete = resolve;
    txn.onerror = resolve;
  });
}

function replaceTempIdInIDB(tempId, realId) {
  return new Promise(async (resolve) => {
    let db;
    try { db = await openIDB(); } catch { resolve(); return; }
    const txn = db.transaction(["transactions", "syncQueue"], "readwrite");
    const txStore = txn.objectStore("transactions");

    const getReq = txStore.get(tempId);
    getReq.onsuccess = () => {
      const old = getReq.result;
      if (old) {
        txStore.delete(tempId);
        txStore.put({ ...old, id: realId, syncStatus: "synced", syncError: undefined });
      }
      // Update syncQueue entries referencing old tempId
      const idx = txn.objectStore("syncQueue").index("by-tempId");
      const curReq = idx.openCursor(IDBKeyRange.only(tempId));
      curReq.onsuccess = () => {
        const cursor = curReq.result;
        if (cursor) {
          cursor.update({ ...cursor.value, tempId: realId });
          cursor.continue();
        }
      };
    };

    txn.oncomplete = resolve;
    txn.onerror = resolve;
  });
}

function patchTransactionInIDB(id, patch) {
  return new Promise(async (resolve) => {
    let db;
    try { db = await openIDB(); } catch { resolve(); return; }
    const txn = db.transaction("transactions", "readwrite");
    const store = txn.objectStore("transactions");
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      if (getReq.result) {
        store.put({ ...getReq.result, ...patch });
      }
    };
    txn.oncomplete = resolve;
    txn.onerror = resolve;
  });
}

function deleteTransactionInIDB(id) {
  return new Promise(async (resolve) => {
    let db;
    try { db = await openIDB(); } catch { resolve(); return; }
    const txn = db.transaction("transactions", "readwrite");
    txn.objectStore("transactions").delete(id);
    txn.oncomplete = resolve;
    txn.onerror = resolve;
  });
}
