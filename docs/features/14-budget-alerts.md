# 14 — Budget Threshold Alerts

**Budgeting & goals** · Effort: **S** · Inspired by: Mint's budget alerts, PocketGuard's overspend warnings · Backlog: — · Depends on: — (foundation for 30 Web Push)

## 1. Summary & inspiration

The classic: warn at 80%, alert at 100%. Budget spend is already computed live on the client (`computeBudgetSpent` in `useDashboardState`, optimistically patched on every add), so in-app alerts are nearly free — the interesting part is firing them at the *moment of crossing*, i.e. right after the add that tips the budget over.

## 2. UX design

Three layers, cheapest first:

1. **Passive:** `BudgetProgress` bar color already implies state; add an explicit ⚠ icon + "82% used" chip at ≥ 80% and a rose "over budget" chip at ≥ 100% (partially exists via the over-budget line — unify).
2. **Active in-app:** when a transaction add/update **crosses** a threshold, fire a toast: *"Food budget: 85% used (RM45 left)"* (warning style) / *"Groceries budget exceeded by RM12"* (error style). Uses the existing `useToast()`; fires from the optimistic handlers so it works offline too.
3. **Quick-add preflight (borrowed from PocketGuard):** while typing `food 50`, if committing would cross 100%, show an inline amber hint under the input — informational, never blocking.

Per-budget opt-out and threshold customization: skip in v1; fixed 80/100 thresholds, global "Budget alerts" toggle in Settings → Account (localStorage).

## 3. Data model

None in v1. (Feature 30 adds an `alertsSentAt` de-dup mechanism for push; in-app toasts need no persistence — crossing detection is inherently once-per-crossing.)

## 4. Server layer

None. All computation is client-side on already-present data. (This is also why it must be rebuilt server-side for push in feature 30 — note the shared threshold constants should live in `lib/budget-math.ts` so both sides agree.)

## 5. Client layer

- `hooks/useDashboardState.ts`: in `handleAdd`/`handleUpdate`, compare each affected budget's spent/limit ratio before vs after the mutation; on crossing 0.8 or 1.0 upward, `showToast(...)`. Helper `detectBudgetCrossings(before, after, budgets)` in `lib/budget-math.ts` (pure).
- Rollover interaction: use the *effective* limit (base + carryIn) once feature 12 lands — another reason the math lives in one module.
- `components/budgets/BudgetProgress.tsx`: threshold chips.
- `components/ExpenseInput.tsx`: preflight hint — parse the draft (`parseExpenseInput` is pure and already imported), simulate against current budget state passed down as a light `budgetHints` prop (id, name, spent, limit, matching rule). Debounce with the existing input-change handling.
- Settings toggle: read via a tiny `useLocalStorageFlag` hook; when off, suppress toasts + preflight (passive chips stay).

## 6. Offline considerations

Fully offline-capable by construction: crossings are detected in the optimistic handlers, which run identically for queued offline mutations.

## 7. Edge cases & interactions

- Only fire on **upward** crossings (deleting a transaction that drops a budget below 80% shouldn't toast "back under budget" — actually, a success-style toast here is a nice touch; optional, default off).
- Multiple budgets crossed by one transaction (overall + category): cap at 2 toasts (ToastContext max is 3; leave headroom).
- `excludedBudgetIds` on the transaction: already respected by `computeBudgetSpent` — crossings inherit it.
- Bulk operations (import, backfill): suppress per-transaction toasts; show one summary toast ("2 budgets now over").
- Preflight with unparseable/partial input: no hint (parser returns null).
- Past-month views: no alerts (mutations are hidden there anyway).

## 8. Testing

- Vitest: `detectBudgetCrossings` — upward/downward, exact-threshold, multi-budget, excluded-transaction cases.
- Playwright: threshold chips change `BudgetProgress` rendering → re-baseline budget snapshots with an over-80% fixture. Toasts are transient — assert via a functional (non-snapshot) check if covered at all.

## 9. Effort & risk

**S.** Pure client logic over existing state. The one architectural decision that matters: put thresholds and crossing detection in `lib/budget-math.ts` now, because feature 30 (push) re-runs the same logic server-side and the two must never disagree.
