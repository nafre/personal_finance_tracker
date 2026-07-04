"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { getPendingCount, getFailedSyncCount } from "@/lib/idb";
import { drainQueue, reconcileAfterSync } from "@/lib/sync";

interface SyncContextValue {
  isOnline: boolean;
  pendingCount: number;
  failedCount: number;
  isSyncing: boolean;
  /** Bumped each time a reconcile purges stale IDB records — consumers that
   *  merge IDB data into React state re-read when it changes. */
  reconcileCount: number;
  syncNow: () => Promise<void>;
  refreshPendingCount: () => Promise<void>;
  userId: string;
}

const SyncContext = createContext<SyncContextValue>({
  isOnline: true,
  pendingCount: 0,
  failedCount: 0,
  isSyncing: false,
  reconcileCount: 0,
  syncNow: async () => {},
  refreshPendingCount: async () => {},
  userId: "",
});

export function useSyncContext(): SyncContextValue {
  return useContext(SyncContext);
}

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const userId = session?.user?.userId ?? "";
  const router = useRouter();

  const [isOnline, setIsOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [reconcileCount, setReconcileCount] = useState(0);

  // useRef mutex so rapid calls (e.g. two "online" events) can't start parallel drains
  const isSyncingRef = useRef(false);
  // Track if we went offline so we know to sync when we come back
  const wentOfflineRef = useRef(false);

  const refreshPendingCount = useCallback(async () => {
    try {
      const [count, failed] = await Promise.all([getPendingCount(), getFailedSyncCount()]);
      setPendingCount(count);
      setFailedCount(failed);

      // Ask the SW to register a BackgroundSync tag for when the tab is closed
      if (count > 0 && typeof navigator !== "undefined" && "serviceWorker" in navigator) {
        navigator.serviceWorker.ready
          .then((reg) => {
            if ("sync" in reg) {
              (reg.sync as { register: (tag: string) => Promise<void> })
                .register("expense-sync")
                .catch(() => {});
            }
          })
          .catch(() => {});
      }
    } catch {
      // IDB not yet ready or SSR — ignore
    }
  }, []);

  const syncNow = useCallback(async () => {
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;
    setIsSyncing(true);
    try {
      const { synced } = await drainQueue();
      let reconciled = 0;
      if (userId) {
        reconciled = await reconcileAfterSync(userId);
      }
      if (reconciled > 0) {
        setReconcileCount((c) => c + 1);
      }
      if (synced > 0 || reconciled > 0) {
        router.refresh();
      }
    } finally {
      isSyncingRef.current = false;
      setIsSyncing(false);
      await refreshPendingCount();
    }
  }, [router, refreshPendingCount, userId]);

  // Sync real online status after hydration
  useEffect(() => {
    setIsOnline(navigator.onLine);
  }, []);

  // Online / offline listeners
  useEffect(() => {
    function handleOnline() {
      setIsOnline(true);
      if (wentOfflineRef.current) {
        wentOfflineRef.current = false;
        // Slight delay so the connection is stable before syncing
        setTimeout(syncNow, 500);
      }
    }
    function handleOffline() {
      setIsOnline(false);
      wentOfflineRef.current = true;
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [syncNow]);

  // Register service worker on mount
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js")
      .catch(() => {});
  }, []);

  // Seed initial pending count on mount
  useEffect(() => {
    refreshPendingCount();
  }, [refreshPendingCount]);

  // On first load while online: reconcile IDB to catch deletions from other devices/sessions
  useEffect(() => {
    if (!userId) return;
    if (typeof navigator !== "undefined" && navigator.onLine) {
      void reconcileAfterSync(userId).then((deleted) => {
        // Signal consumers that captured IDB rows into state before this
        // reconcile finished (e.g. the dashboard's pending merge) to re-read.
        if (deleted > 0) setReconcileCount((c) => c + 1);
      });
    }
  }, [userId]);

  return (
    <SyncContext.Provider
      value={{ isOnline, pendingCount, failedCount, isSyncing, reconcileCount, syncNow, refreshPendingCount, userId }}
    >
      {children}
    </SyncContext.Provider>
  );
}
