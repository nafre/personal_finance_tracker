# 22 — Duplicate Detection

**Data & automation** · Effort: **S** · Inspired by: Monarch's duplicate review, bank-app double-charge alerts · Backlog: **1h** · Depends on: —

## 1. Summary & inspiration

Two flavors of duplicate: the fat-finger (submitted `food 20` twice in a row — backlog 1h's 60-second window) and the honest re-entry (logged lunch at the table, logged it again at night). A lightweight at-entry warning catches the first; a small review surface catches the second. Import-time dedup is separately handled in feature 18.

## 2. UX design

- **At entry (backlog 1h):** in `ExpenseInput.handleSubmit`, before committing, check the recent list for a same `(amount, category)` transaction created within the last 60 seconds → inline amber confirm strip replaces the input row: *"Looks like a duplicate of the RM20 Food you just added — add anyway?"* [Add anyway] [Cancel]. One tap either way; never blocks more than once per submission.
- **Same-day softer check:** same `(amount, category)` already exists **today** (any age) → don't interrupt; show a passive amber dot on the submit button with a tooltip. Interruption budget matters — the 60s case interrupts, the same-day case only hints.
- **Review surface:** on `/transactions`, when the loaded list contains same-`(date, amount, category)` groups, show a dismissible banner "2 possible duplicate pairs" that toggles a filtered view of just those groups (client-side over loaded rows). No dedicated page.

## 3. Data model

None. (No "not a duplicate" persistence in v1 — dismissals are session-local. If the banner nags, add `dismissedDupGroups` to localStorage keyed by group hash.)

## 4. Server layer

None. All checks run over data already on the client:

- Quick-add: `useDashboardState`'s `mergedTransactions` (dashboard) — pass a thin `recentForDupCheck` (last ~20 rows: id, amount, category, createdAt) down to `ExpenseInput`. On `/transactions`, the loaded SWR rows serve the same role.
- The review grouping runs over loaded pages only — pragmatic; deep-history duplicates are feature 18's dedup or a non-goal.

## 5. Client layer

- Pure `lib/duplicates.ts`: `findRecentDuplicate(draft, recent, windowMs)` and `groupPossibleDuplicates(txs)` (key: `date|amount|category`).
- `components/ExpenseInput.tsx`: confirm-strip state (mirrors the inline two-step confirm convention from `TransactionList` deletes — same visual family); the pending draft is held, not lost, on [Cancel].
- `app/(dashboard)/transactions/page.tsx`: banner + filter toggle state.
- The confirm must also gate the **offline** path (`applyLocalMutation`) — the check is client-side, so it works identically offline; pending rows (temp IDs) count as "recent".

## 6. Offline considerations

Fully offline-capable — checks run against merged local state including pending items. A duplicate queued offline then synced is deduplicated *at the server* only by `clientId` (retry-dedup), not by content — content-level dedup stays a client-side advisory by design (server content-matching would false-positive on legitimate identical purchases).

## 7. Edge cases & interactions

- Legitimate rapid repeats (two RM2 parking tickets): the [Add anyway] path must be frictionless — one tap, focus returns to input.
- Template instant-add (feature 20): deliberately **not** exempt — same rules.
- Recurring backfill: creates many same-amount rows on different dates — grouping keys on date, so no false positives; still exclude `pending-*`→ no, temp IDs are fine since key ignores id.
- Note differences: ignored in the key (notes vary between duplicate entries in practice); shown in the review UI so the human decides.
- Income: apply the same checks (double-logged salary is the costliest duplicate).

## 8. Testing

- Vitest: `lib/duplicates.test.ts` — window boundary, key grouping, pending-row inclusion, income.
- Playwright: functional (non-snapshot) test — add same transaction twice quickly, assert the confirm strip appears, [Add anyway] commits. Banner: seed a duplicate pair fixture, assert banner presence. Avoid snapshotting transient states.

## 9. Effort & risk

**S.** Zero server work, two pure functions, one confirm strip. Tuning note: if the same-day hint proves noisy for habitual identical purchases (daily coffee), scope it to amounts ≥ RM50. Supersedes backlog 1h (extends it with the same-day hint + review grouping).
