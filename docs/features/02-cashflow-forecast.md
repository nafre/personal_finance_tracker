# 02 — Cash-Flow Forecast & Runway

**Analytics & insights** · Effort: **M** · Inspired by: Copilot's forecast, PocketGuard's "In My Pocket" · Backlog: **4b** · Depends on: —

## 1. Summary & inspiration

Copilot projects where the month will land ("on track to spend RM3,400"); PocketGuard nets out upcoming bills. This app has both inputs already on the client: current burn rate (`dailyData`) and scheduled commitments (`initialRecurring` with `toMonthlyAmount`/`countRemainingPayments` in `lib/utils.ts`). Backlog item 4b scoped exactly this: a `ForecastCard` consuming `dailyData` + `initialRecurring`.

## 2. UX design

- **Month view:** a `ForecastCard` next to (or under) `SpendingInsights`:
  - Headline: *"Projected month-end spend: RM X"* with a delta vs last month's total (`prevTotalExpenses`) and vs the month cap if an `overall`/`excluded` budget exists (same cap-resolution rule as `PaceChart`).
  - Breakdown lines: spent so far · projected variable spend for remaining days · recurring still due this month (income and expense separately).
  - Confidence hint: early in the month (< 5 days elapsed) show "low confidence — early in the month".
- **All-time view:** a "runway" line on/near `WealthCurve`: *"At your 3-month average net burn, current balance lasts ~N months"* (only when average net is negative; when positive, show average monthly surplus instead).
- Forecast is inherently today-anchored → render only on the **current** month (hidden when `readOnlyMonth`), matching quick-add's behavior.

## 3. Data model

None.

## 4. Server layer

None. All inputs are already in `DashboardContent`'s props. The all-time runway uses `initialWealthData` (ledger-basis monthly buckets), which the all-time view already fetches via `getRangeDashboardData(…, withWealthSeries: true)`.

## 5. Client layer

- New `components/ForecastCard.tsx` (plain component, no chart lib needed; optionally a tiny projected-line extension to `PaceChart` later).
- New pure module `lib/forecast.ts` (keeps it unit-testable, like `lib/parser.ts`):
  - `projectMonthEnd({ dailyData, recurring, today, daysInMonth })` → `{ spentSoFar, projectedVariable, recurringDueExpense, recurringDueIncome, projectedTotal }`. Variable projection = median daily *non-recurring* spend of elapsed days × remaining days (median resists single-purchase spikes better than mean; use trailing 14 days when available).
  - `computeRunway(wealthData)` → `{ avgMonthlyNet, months | null }` over the trailing 3 full months.
- Wire into `useDashboardState`: a `forecast` memo recomputed when `dailyData`/`initialRecurring` change, so optimistic adds move the projection instantly.
- Wrap in `DashboardErrorBoundary section="forecast"` like the other sections.

## 6. Offline considerations

Read-only. Pending transactions are already merged into the optimistic `dailyData` patches, so offline adds update the projection.

## 7. Edge cases & interactions

- **Basis:** projection of *spending patterns* → chart basis (`dailyData` is already `excludeFromStats`-filtered). Runway is an *accounting* number → ledger basis (`initialWealthData`). State this in the card's tooltip copy to avoid "numbers don't match" confusion.
- Recurring due amounts must not be double-counted: a rule already posted this period (`isPostedThisPeriod`) is inside `spentSoFar`, not "still due".
- Day 1 of the month: zero elapsed days → skip the variable projection (show recurring-only floor).
- No recurring rules / no budgets: card degrades to burn-rate-only projection with no cap comparison.
- Fewer than 3 months of history: hide runway rather than extrapolating noise.

## 8. Testing

- Vitest: new `lib/forecast.test.ts` — median vs mean behavior, posted-recurring exclusion, day-1 guard, runway with negative/positive/short history. Pure functions, node environment, `vi.setSystemTime()`.
- Playwright: the card's numbers change daily (today-anchored), so mask the whole `[data-testid="forecast-card"]` in the month full-page snapshot — exactly the `PaceChart` precedent — and add a presence-only assertion test.

## 9. Effort & risk

**M.** Math is simple; the risk is misleading numbers (double-counted recurring, spike-skewed projections). The `lib/forecast.ts` split with thorough unit tests is the mitigation. Supersedes backlog 4b.
