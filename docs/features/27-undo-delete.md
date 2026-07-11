# 27 — Undo Delete

**Data & automation** · Effort: **S** · Inspired by: Gmail's undo send, Monarch's undo toasts · Backlog: **1f** · Depends on: —

## 1. Summary & inspiration

The two-step inline confirm already prevents most accidents, but a post-hoc undo is still the softer net — and it lets the confirm eventually relax to a single tap + undo (the modern pattern: act immediately, offer reversal). Backlog 1f scoped it: stash the deleted record, show a 5s toast with Undo, only commit the server delete after the window (or restore on undo).

## 2. UX design

- Delete a row → row disappears immediately (optimistic, as today) → toast: *"Transaction deleted — Undo"* (5s, the ToastContext default).
- Tap Undo → row reappears in place (state restore), toast swaps to "Restored".
- Window expires → the real deletion proceeds. Navigating away within the window: let the timer run (the closure holds everything it needs); a hard reload within the window loses the undo but the delete still commits via the pending timer being lost → **choose the other design** (see below).

**Two viable designs; pick delete-then-restore:**
1. *Deferred delete* (backlog 1f's sketch): server delete fires only after 5s. Risk: reload/close within the window silently cancels the delete — the row "comes back" later. Confusing.
2. **Delete-then-restore (recommended):** commit the server delete immediately (exactly today's flow), stash the full record client-side, and Undo re-creates it via `addTransaction` (with original date/labels/flags). Deterministic under reload; the only cost is the restored row getting a new ID — harmless, nothing references transaction IDs externally (except `excludedBudgetIds` lives *on* the transaction, so it survives; attachments in feature 25 would not — noted there).

## 3. Data model

None.

## 4. Server layer

None — `deleteTransaction` and `addTransaction` already exist. Verify `addTransaction`/`transactionSchema` accept an explicit past `date`, `labels`, `excludedBudgetIds`, and `excludeFromStats` (the restore must be lossless; if any field can't round-trip through the public action, extend the schema rather than adding a bespoke restore action).

## 5. Client layer

- **ToastContext extension** (the reusable half of this feature, also wanted by backlog 3g's "Refresh" toast): `showToast(message, type, action?: { label, onClick })` — button renders inline, `role` semantics preserved. One-time change to `context/ToastContext.tsx`.
- `components/TransactionList.tsx` (`handleDelete`): after server delete succeeds, `showToast("Transaction deleted", "info", { label: "Undo", onClick: restore })` where `restore` calls the existing `handleRestore`-style path plus `addTransaction` with the stashed record, then write-through `putTransaction` to IDB (the mirror convention).
- Same wiring on the transactions page's `handleDelete` (it has its own).
- Offline path: the delete goes through `applyLocalMutation("delete")` — Undo instead cancels/compensates via `applyLocalMutation("add")` with the stashed data; `lib/sync.ts` already handles the never-synced-delete cancellation case (covered in its unit tests), so an offline delete+undo of a pending row nets out in the queue.

## 6. Offline considerations

Works in both modes with the same UX: online = delete+re-add; offline = queued delete + queued add (or queue cancellation for never-synced rows, which `applyLocalMutation` already implements).

## 7. Edge cases & interactions

- Undo after the toast auto-dismisses: gone — 5s is the contract (matching ToastContext's dismiss).
- Delete → Undo → Delete rapid cycles: each cycle is independent (new stash); no shared refs.
- Stat cards/budgets: the existing optimistic delete/add handlers in `useDashboardState` fire symmetrically — totals round-trip correctly, including the `excludeFromStats` basis split.
- Recurring-list deletes (`RecurringList.handleRestored` exists for *failures*): out of scope — rules deletion keeps two-step confirm only.
- Restored row sorts by original `date` — lands back in its old position, not at top.
- Max 3 toasts: consecutive deletes queue fine; each toast holds its own stash.

## 8. Testing

- Vitest: extend `lib/sync.test.ts` if the offline compensation touches queue logic (likely no new code — assert existing behavior covers add-after-delete ordering).
- Playwright: functional test — delete, click Undo in the toast, assert the row returns with identical fields; snapshot of the toast-with-action styling (one-off, stable).

## 9. Effort & risk

**S.** The ToastContext action button is the only shared-surface change (and it's on the backlog twice already). Delete-then-restore sidesteps every timer/reload trap in the deferred design. Supersedes backlog 1f.
