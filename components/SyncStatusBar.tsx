"use client";

import { useSyncContext } from "@/context/SyncProvider";

export function SyncStatusBar() {
  const { isOnline, pendingCount, isSyncing } = useSyncContext();

  if (isOnline && !isSyncing) return null;

  if (isSyncing) {
    return (
      <div className="flex items-center gap-2 text-xs bg-indigo-500/10 border border-indigo-500/20 rounded-lg px-3 py-2 text-indigo-400">
        <svg className="animate-spin h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <span>Syncing changes…</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-xs bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 text-amber-400">
      <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 5.636a9 9 0 11-12.728 0" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v4" />
      </svg>
      <span>Offline — changes will sync when reconnected</span>
      {pendingCount > 0 && (
        <span className="font-semibold ml-auto">
          {pendingCount} pending
        </span>
      )}
    </div>
  );
}
