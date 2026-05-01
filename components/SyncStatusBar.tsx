"use client";

import { useEffect, useRef, useState } from "react";
import { useSyncContext } from "@/context/SyncProvider";

export function SyncStatusBar() {
  const { isOnline, pendingCount, failedCount, isSyncing, syncNow } = useSyncContext();
  const [showSynced, setShowSynced] = useState(false);
  const prevPendingRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (prevPendingRef.current > 0 && pendingCount === 0 && !isSyncing && isOnline) {
      setShowSynced(true);
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setShowSynced(false), 2500);
    }
    prevPendingRef.current = pendingCount;
  }, [pendingCount, isSyncing, isOnline]);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  if (!isOnline) {
    return (
      <div className="flex items-center gap-2.5 text-xs bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 text-amber-400">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0 animate-pulse" />
        <span>Offline — changes will sync when reconnected</span>
        {pendingCount > 0 && (
          <span className="ml-auto font-semibold tabular-nums">{pendingCount} pending</span>
        )}
      </div>
    );
  }

  if (isSyncing) {
    return (
      <div className="flex items-center gap-2.5 text-xs bg-indigo-500/10 border border-indigo-500/20 rounded-lg px-3 py-2 text-indigo-400">
        <svg className="animate-spin h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <span>Syncing changes…</span>
      </div>
    );
  }

  if (failedCount > 0) {
    return (
      <div data-testid="sync-status-error" className="flex items-center gap-2.5 text-xs bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2 text-rose-400">
        <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 15.75h.007v.008H12v-.008z" />
        </svg>
        <span>
          <span className="font-semibold tabular-nums">{failedCount}</span>{" "}
          {failedCount === 1 ? "change" : "changes"} failed to sync
        </span>
        <button
          onClick={syncNow}
          className="ml-auto font-medium text-rose-300 hover:text-rose-100 underline underline-offset-2 transition-colors cursor-pointer"
        >
          Retry
        </button>
      </div>
    );
  }

  if (pendingCount > 0) {
    return (
      <div className="flex items-center gap-2.5 text-xs bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 text-amber-400">
        <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 15.75h.007v.008H12v-.008z" />
        </svg>
        <span>
          <span className="font-semibold tabular-nums">{pendingCount}</span>{" "}
          unsynced {pendingCount === 1 ? "change" : "changes"}
        </span>
        <button
          onClick={syncNow}
          className="ml-auto font-medium text-amber-300 hover:text-amber-100 underline underline-offset-2 transition-colors cursor-pointer"
        >
          Sync now
        </button>
      </div>
    );
  }

  if (showSynced) {
    return (
      <div className="flex items-center gap-2.5 text-xs bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2 text-emerald-400">
        <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
        <span>All changes saved</span>
      </div>
    );
  }

  return null;
}
