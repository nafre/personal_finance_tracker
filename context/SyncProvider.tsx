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
import { getPendingCount } from "@/lib/idb";
import { drainQueue, reconcileAfterSync } from "@/lib/sync";

interface SyncContextValue {
  isOnline: boolean;
  pendingCount: number;
  isSyncing: boolean;
  syncNow: () => Promise<void>;
  refreshPendingCount: () => Promise<void>;
  userId: string;
}

const SyncContext = createContext<SyncContextValue>({
  isOnline: true,
  pendingCount: 0,
  isSyncing: false,
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

  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);

  // Track if we went offline so we know to sync when we come back
  const wentOfflineRef = useRef(false);

  const refreshPendingCount = useCallback(async () => {
    try {
      const count = await getPendingCount();
      setPendingCount(count);

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
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      const { synced } = await drainQueue();
      let reconciled = 0;
      if (userId) {
        reconciled = await reconcileAfterSync(userId);
      }
      if (synced > 0 || reconciled > 0) {
        router.refresh();
      }
    } finally {
      setIsSyncing(false);
      await refreshPendingCount();
    }
  }, [isSyncing, router, refreshPendingCount, userId]);

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
      void reconcileAfterSync(userId);
    }
  }, [userId]);

  return (
    <SyncContext.Provider
      value={{ isOnline, pendingCount, isSyncing, syncNow, refreshPendingCount, userId }}
    >
      {children}
    </SyncContext.Provider>
  );
}
