# 23 — Bulk Select & Bulk Edit

**Data & automation** · Effort: **M** · Inspired by: Lunch Money's bulk editing, Gmail-style selection · Backlog: **1e** · Depends on: — (pairs with 18/19 cleanup workflows)

## 1. Summary & inspiration

Post-import cleanup and recategorization are batch jobs: "select these 14, set category Transport, add #trip". Backlog 1e scoped multi-select + bulk delete + optional bulk label; this plan adds recategorize (the highest-value bulk op) and scopes it to the `/transactions` page only (the dashboard's recent list stays simple).

## 2. UX design

- A **Select** toggle button in the transactions filter bar. Active state: rows gain leading checkboxes, tap-anywhere-on-row toggles selection (mobile-friendly), header gains "Select all loaded (N)".
- A sticky **bulk action bar** slides up from the bottom (above the mobile nav, like the toast container): "N selected · [Set category] [Add label] [Off-chart] [Delete]".
  - **Set category** → `CategoryCombobox` in a small popover.
  - **Add label** → text input with existing-label suggestions (`getUsedLabels`).
  - **Off-chart** → toggle on/off for all selected.
  - **Delete** → two-step confirm in the bar itself ("Delete 14? [Confirm]"), never native `confirm()`.
- Progress: bar shows a spinner + disables during the batch; summary toast after ("14 updated"). Selection clears on success.

## 3. Data model

None.

## 4. Server layer

New batch actions in `lib/actions.ts` (all Zod-validated, ownership-checked, `ids` capped at 200):

- `deleteTransactions(ids: string[])` — backlog 1e's shape: `deleteMany({ where: { id: { in: ids }, userId } })` in a `$transaction`; return deleted count.
- `updateTransactionsBulk(ids, patch)` — patch limited to `{ category? , addLabels?, excludeFromStats? }`:
  - `category`/`excludeFromStats`: single `updateMany`.
  - `addLabels`: needs per-row merge (array union) — Postgres can `updateMany` per distinct label-set, but the simple correct path is a `$transaction` of per-row updates reading current `labels` first (`parseLabels`/`encodeLabels` for SQLite). 200-row cap keeps it sane.
- Both revalidate `/dashboard` + `/transactions`.

## 5. Client layer

- `app/(dashboard)/transactions/page.tsx`: selection state (`Set<string>`), select-mode flag, bulk bar; SWR `mutate()` after batch success (its existing post-mutation pattern).
- `components/TransactionList.tsx`: `selectable`/`selectedIds`/`onToggleSelect` props (backlog 1e's suggested prop); checkbox column; row `onClick` routes to toggle when selecting. In select mode, suppress inline edit/delete affordances.
- New `components/BulkActionBar.tsx` — fixed bottom, safe-area padding, `role="toolbar"`.
- **IDB write-through:** the online mutation convention (fixed backlog 3f) requires mirroring: after server success, loop `deleteTransactionFromIDB(id)` / `patchTransaction(id, patch)` for each affected row so other pages can't resurrect stale copies.

## 6. Offline considerations

**Online-only.** The sync queue is single-op ordered with per-op retry/backoff — batch semantics (partial failure, ordering vs subsequent single ops) don't fit it. Disable the Select toggle when `!isOnline` with a tooltip; document as a known limitation.

## 7. Edge cases & interactions

- Selection across pagination: "select all **loaded**" only — never a server-side "select all matching filter" in v1 (that's a mass-destruction footgun; the 200 cap enforces the philosophy).
- Pending (`pending_*`) rows: exclude from selection (they're not server rows yet); grey their checkbox with a tooltip.
- Bulk category change vs rules/budgets: aggregates shift — server revalidation handles the dashboard; SWR mutate handles the list.
- Bulk delete + undo (feature 27): v1 bulk delete is **not** undoable (state in the confirm copy); revisit after 27 lands if demanded.
- Row memoization: `TransactionRow` is `React.memo` — selection props must be stable (`useCallback`, pass `isSelected` boolean not the Set) to avoid N-row re-renders per toggle.
- Demo role: allowed (it's their demo data), same as single mutations.

## 8. Testing

- Vitest: none (no new pure logic beyond trivial set ops).
- Playwright: select-mode snapshot (checkboxes + bulk bar) in `e2e/transactions.spec.ts` at three viewports; functional test — select 2, set category, assert rows update and selection clears.

## 9. Effort & risk

**M.** Server actions are simple; the client selection state and memo-safe row wiring is the careful part. The 200 cap and loaded-rows-only scoping keep the blast radius honest. Supersedes backlog 1e (adds recategorize/label/off-chart to its delete).
