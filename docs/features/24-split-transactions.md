# 24 — Split Transactions

**Data & automation** · Effort: **L** · Inspired by: YNAB's split transactions, Spendee's split · Backlog: — · Depends on: —

## 1. Summary & inspiration

The supermarket run is never one category: RM180 at the hypermarket is groceries + household + a toy. Splits let one real-world payment carry multiple category lines. YNAB models this as parent + sub-lines; the lightweight adaptation here: **splits are ordinary sibling transactions sharing a `splitGroupId`** — no parent row, no new aggregation semantics, every existing chart/budget/filter works untouched because each line is just a transaction.

## 2. UX design

- **Creating:** "Split" action in `TransactionList`'s edit form (expenses only) opens a split editor: the original amount at top, line rows below (category via `CategoryCombobox`, amount, optional note), a live remainder indicator ("RM12.00 unassigned" — must reach RM0.00 to save). Start with 2 lines prefilled (original category + blank).
- **Display:** split lines render as normal rows with a small ⑂ badge; tapping the badge highlights/filters the sibling lines. The group shares date and the original note as a prefix.
- **Editing:** each line edits independently (it's a transaction); the badge menu offers "Unsplit" (merge lines back into one transaction summing the amounts, two-step confirm).
- Quick-add split syntax: out of scope v1 (parser stays simple); splits are an edit-time operation.

## 3. Data model

Both schemas:

```prisma
model Transaction {
  ...
  splitGroupId String?   // shared by sibling lines; null = not split

  @@index([userId, splitGroupId])
}
```

Scalar string — no db-adapter work beyond adding the field to `normalizeTx` passthrough and `LocalTransaction` in `lib/idb.ts` (IDB mirror must carry it or edits would strip it on write-through).

## 4. Server layer

- `splitTransaction(id, lines: { category, amount, note? }[])` in `lib/actions.ts`:
  - Zod: 2–10 lines, positive amounts, **sum must equal the original amount** (server-enforced with an epsilon of 0.005 for float dust; better: validate in integer cents).
  - `$transaction`: delete (or repurpose as line 1) the original, `createMany` lines copying `date`, `type`, `labels`, `excludedBudgetIds`, `excludeFromStats`, new shared `splitGroupId` (cuid).
- `unsplitTransactions(groupId)`: `$transaction` — fetch group, create one merged transaction (sum amounts, first line's category, joined notes), delete lines.
- `transactionSchema` untouched (lines are plain transactions); new `splitSchema`.
- CSV export: add a `Split Group` column? No — keep export stable; lines export as normal rows (their true accounting shape).

## 5. Client layer

- New `components/SplitEditor.tsx` (dialog via `useDialogBehavior`), launched from the edit form.
- `components/TransactionList.tsx`: ⑂ badge when `splitGroupId` present; badge menu (highlight siblings — client-side filter over loaded rows; Unsplit).
- Optimistic handling: splitting replaces 1 row with N — reuse `handleReplace`'s machinery in `useDashboardState` (it exists for temp-ID swaps); simplest correct path is server round-trip + `router.refresh()`/SWR `mutate()` rather than optimistic splitting (splits are rare, latency is acceptable).
- `types/index.ts`: `Transaction` gains `splitGroupId?: string`.

## 6. Offline considerations

**Online-only in v1.** A split is a multi-row atomic op — it doesn't fit the single-op queue (same reasoning as bulk edit). Disable the Split action offline. Individual line edits afterward remain fully offline-capable (they're ordinary transactions).

## 7. Edge cases & interactions

- Budgets: lines carry their own categories → `computeBudgetSpent` just works; per-line `excludedBudgetIds` editable independently (copied at split time).
- Deleting one line of a group: allowed (returns/adjustments are real); if the group drops to 1 line, clear its `splitGroupId` (server-side sweep in `deleteTransaction` when the deleted row had a group).
- Rounding: RM180 into 3 lines — the editor auto-assigns the remainder cent to the last line; the server epsilon is a backstop, not the mechanism.
- Duplicate detection (feature 22): same-amount lines in one group share a date — exclude same-`splitGroupId` rows from dup grouping.
- Recurring posts: no split support on rules (v1).
- Pending/offline-created rows: Split disabled until synced (needs a real server ID).

## 8. Testing

- Vitest: sum-validation math (cents epsilon), remainder auto-assignment, unsplit merge composition.
- Playwright: split editor dialog snapshot; a split group's rows with ⑂ badges in the list snapshot (fixture group); functional split→unsplit round-trip assertion.

## 9. Effort & risk

**L.** The sibling-rows design dodges the hard part (parent/child aggregation) — the cost is atomic multi-row actions and careful group-integrity sweeps. Cents-based validation is strongly recommended; float-sum equality is where this feature would otherwise rot.
