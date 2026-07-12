// Client-side duplicate detection (feature 22). Two checks with different
// interruption budgets: a 60s same-(amount, category) window that interrupts
// with a confirm strip, and a passive same-day hint. Content-level dedup stays
// a client advisory by design — the server only dedups offline retries by
// clientId, since identical legitimate purchases are common.

export interface DraftEntry {
  amount: number;
  category: string;
}

export interface RecentTransactionLike {
  amount: number;
  category: string;
  date: Date | string;
}

interface RecentAdd {
  amount: number;
  category: string;
  at: number; // epoch ms
}

export const RECENT_WINDOW_MS = 60_000;

// Module-level registry of adds committed this session. Loaded transaction
// lists can't power the 60s check — `createdAt` isn't part of the client
// Transaction shape (and `date` is the user-chosen date, not entry time) —
// so quick-add records every commit here instead. Survives component
// unmounts (e.g. QuickAddSheet closing).
let recentAdds: RecentAdd[] = [];

export function recordAdd(entry: { amount: number; category: string; at?: number }): void {
  const at = entry.at ?? Date.now();
  // Drop entries that can no longer match before appending, keeping the list tiny.
  recentAdds = recentAdds.filter((e) => at - e.at < RECENT_WINDOW_MS);
  recentAdds.push({ amount: entry.amount, category: entry.category, at });
}

export function clearRecentAdds(): void {
  recentAdds = [];
}

function sameKey(a: DraftEntry, b: DraftEntry): boolean {
  return a.amount === b.amount && a.category.toLowerCase() === b.category.toLowerCase();
}

/** The fat-finger check: same (amount, category) committed within the window. */
export function findRecentDuplicate(
  draft: DraftEntry,
  now: number = Date.now(),
  windowMs: number = RECENT_WINDOW_MS
): RecentAdd | null {
  for (let i = recentAdds.length - 1; i >= 0; i--) {
    const e = recentAdds[i];
    if (now - e.at < windowMs && sameKey(draft, e)) return e;
  }
  return null;
}

/** The softer check: same (amount, category) already exists on today's local calendar day. */
export function hasSameDayDuplicate(
  draft: DraftEntry,
  recent: RecentTransactionLike[],
  today: Date = new Date()
): boolean {
  return recent.some((tx) => {
    if (!sameKey(draft, tx)) return false;
    const d = new Date(tx.date);
    return (
      d.getFullYear() === today.getFullYear() &&
      d.getMonth() === today.getMonth() &&
      d.getDate() === today.getDate()
    );
  });
}

export interface DuplicateGroup<T> {
  key: string;
  transactions: T[];
}

/** Review-surface grouping: same (local calendar day, amount, category) — notes
    vary between honest re-entries, so they're ignored in the key (and shown in
    the UI for the human to judge). Temp/pending ids are fine: the key ignores id. */
export function groupPossibleDuplicates<T extends RecentTransactionLike>(
  txs: T[]
): DuplicateGroup<T>[] {
  const groups = new Map<string, T[]>();
  for (const tx of txs) {
    const d = new Date(tx.date);
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const key = `${day}|${tx.amount}|${tx.category.toLowerCase()}`;
    const group = groups.get(key);
    if (group) group.push(tx);
    else groups.set(key, [tx]);
  }
  return Array.from(groups.entries())
    .filter(([, list]) => list.length > 1)
    .map(([key, transactions]) => ({ key, transactions }));
}
