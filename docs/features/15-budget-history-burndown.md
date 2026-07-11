# 15 — Budget History & Burndown

**Budgeting & goals** · Effort: **M** · Inspired by: YNAB's budget reports, Actual's spent-over-time view · Backlog: **7i** · Depends on: — (synergy with 12 rollover)

## 1. Summary & inspiration

Two complements to the static progress bar: the **burndown** (how the month's budget was consumed day by day — "70% used" vs "used it all in the first ten days" are different stories, per backlog 7i) and the **history** (did I hold this budget the last 6 months?). YNAB shows both; together they turn budgets from a gauge into a habit tracker.

## 2. UX design

- **Burndown sparkline** inside each `BudgetProgress`: a tiny (~40px tall) area line of cumulative spend through the month against a faint even-pace diagonal to the limit. Current month: line stops at today (like `PaceChart`). No axes, no tooltip on the sparkline itself.
- **History strip:** tapping a budget card expands a 6-month mini-bar row — one bar per month, height = spent/limit, emerald under / rose over, with the month initial under each. Tooltip per bar: "May: RM480 / RM500".
- Both render inside the existing budget section on the dashboard; past-month views show that month's burndown (historically correct and stable — good for e2e).

## 3. Data model

None if feature 12 (rollover) hasn't shipped; with 12, the `BudgetPeriod` snapshot table provides history for free and should be preferred. This plan covers the standalone path (compute-on-read) and notes the upgrade.

## 4. Server layer

- **Burndown:** needs the viewed month's transactions with dates — already available client-side (`mergedTransactions` on the dashboard carries the month's rows). No server change.
- **History:** needs 6 months of per-budget spend. Add `getBudgetHistory(budgetId, months = 6)` to `lib/actions.ts`: fetch 6 months of expenses (`select: { amount, category, labels, excludedBudgetIds, excludeFromStats, date }`, indexed on `[userId, date]`, bounded), bucket by month, and run the shared `computeBudgetSpent` (from `lib/budget-math.ts` — the extraction features 05/12/14 also require) per bucket. Return `{ month, year, spent, limit }[]` (limit = current amount; with feature 12, historical `baseAmount` from `BudgetPeriod`).
- Fetch lazily on expand (server action call from the client, SWR-cached by budgetId), **not** on dashboard load — history is a drill-in.

## 5. Client layer

- `components/budgets/BudgetProgress.tsx`: accepts a `dailySpend: { day, cumulative }[]` prop for the sparkline; render with a plain SVG polyline (a Recharts instance per budget card is overkill and heavy — the charts are lazy-loaded for a reason).
- `hooks/useDashboardState.ts`: extend the existing `budgetSpending` memo to also produce per-budget daily cumulative series — same loop as `computeBudgetSpent` with a date bucket (backlog 7i's exact suggestion). Optimistic adds update it automatically.
- New `components/budgets/BudgetHistoryStrip.tsx`: expand-on-tap, `useSWR` keyed `["budget-history", id]`, skeleton while loading.

## 6. Offline considerations

Burndown: derived from merged (incl. pending) transactions — works offline. History: online fetch; show a quiet "unavailable offline" note if the SWR call fails while offline.

## 7. Edge cases & interactions

- Budgets created mid-history: history bars before `createdAt` render as empty slots, not zeros ("no budget yet").
- Budget amount edited: without feature 12, all history bars scale against the *current* limit (caveat in tooltip); with 12, use snapshots.
- Basis: budget spend rules (incl. `excludedBudgetIds`) are whatever `computeBudgetSpent` does today — the shared module keeps burndown, history, and the bar consistent by construction.
- Label budgets on SQLite: history query needs JS-side label filtering via `parseLabels` (same as everywhere).
- Many budgets: history fetches only on expand, so N budgets ≠ N queries on load.

## 8. Testing

- Vitest: daily-cumulative bucketing (month boundary, empty days), history bucketing in `lib/budget-math.test.ts`.
- Playwright: sparkline changes budget-card snapshots → re-baseline; current-month sparkline drifts daily → ensure the month full-page test's existing masks cover the budget section or add the card to the mask list; add a fixed-past-month dedicated snapshot (stable burndown). History strip: expand + snapshot with `amountMasks`.

## 9. Effort & risk

**M.** The sparkline is small; the history action is one bounded query + shared math. Snapshot churn is the practical annoyance — budget cards appear in existing dashboard snapshots, so this re-baselines several files. Supersedes backlog 7i.
