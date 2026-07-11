# 07 — Savings-Rate Trend Chart

**Analytics & insights** · Effort: **S** · Inspired by: YNAB's income vs expense report, Monarch's savings-rate widget · Backlog: **7e** · Depends on: —

## 1. Summary & inspiration

The single-number savings rate already exists (the Net stat card subtitle, `savingsRate` in `useDashboardState`). What's missing is the *trend*: a per-month line showing whether the rate is improving — a better health signal than absolute RM amounts because it normalizes for income changes. Backlog 7e scoped it as pure client-side arithmetic over the year view's existing monthly buckets.

## 2. UX design

- **Year and all-time views:** a compact line chart card ("Savings rate") below `MonthlyBarChart`, or — cheaper — a second Y-axis line *inside* `MonthlyBarChart`. Recommendation: separate small card (`data-testid="savings-rate-chart"`); mixing % and RM axes in one chart muddies both.
- Line of monthly `(income − expenses) / income`, dots per month, a dashed 0% reference line, and a dotted average line. Y-axis clamped to [-100%, 100%] with outliers annotated rather than stretching the axis.
- Tooltip: month, rate %, income, expenses (reuse the `MonthlyBarChart` tooltip styling).
- Months with zero income render as gaps (`connectNulls={false}`), not as -∞.

## 3. Data model

None.

## 4. Server layer

None. **Ledger basis** — savings rate is an accounting stat (matches the stat-card definition), so derive from `initialWealthData` (per-month income/expense, ledger basis), which both year and all-time views already fetch via `getRangeDashboardData(…, withWealthSeries: true)`.

## 5. Client layer

- New `components/charts/SavingsRateChart.tsx`, lazy-loaded (`dynamic`, `ssr: false`), Recharts `LineChart` + `ReferenceLine`, `accessibilityLayer={false}` per the Recharts-3 convention, `useChartAnimation` for animation props.
- Pure helper `computeMonthlySavingsRate(wealthData)` → `{ month, rate | null, income, expenses }[]` (null when income is 0).
- Render in `DashboardContent` only when `initialWealthData.length > 0` (i.e. year/all-time), wrapped in its own `DashboardErrorBoundary section`.

## 6. Offline considerations

Read-only, derived from server-fetched buckets. No sync impact.

## 7. Edge cases & interactions

- Zero-income months → null gap (guard division).
- Single-month history: render a single dot, hide the average line.
- Current month in the year view is partial — visually distinguish its dot (hollow/dimmed) so an in-progress month doesn't read as a crash in the rate.
- Consistency: the plotted current-month rate must equal the Net stat card's subtitle number — both must use ledger basis; add a comment cross-referencing `savingsRate` in `useDashboardState`.

## 8. Testing

- Vitest: `computeMonthlySavingsRate` — zero income, negative rate, clamping input, empty series.
- Playwright: past months are stable but the current-month dot drifts → follow the `DayOfWeekChart` precedent: mask the card in year/all-time full-page snapshots, add a dedicated presence test asserting the line renders.

## 9. Effort & risk

**S.** One pure function, one small chart, zero server work. Only risk is basis inconsistency with the stat card — fixed by deriving both from the same ledger series. Supersedes backlog 7e.
