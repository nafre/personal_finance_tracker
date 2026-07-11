# 09 — Year-over-Year Comparison

**Analytics & insights** · Effort: **S** · Inspired by: Lunch Money's YoY charts, Copilot's "vs last year" · Backlog: **7h** · Depends on: 2+ years of data (defer until true)

## 1. Summary & inspiration

MoM deltas (already on stat cards) miss seasonality — December always looks alarming vs November. The YoY view answers "am I ahead of or behind *last year at this point*?". Backlog 7h scoped cumulative per-year lines overlaid Jan→Dec; this plan adds the cheap companion: YoY delta badges in the year view's stat context.

## 2. UX design

Two pieces, both **all-time view** (and year view when a previous year exists):

1. **Overlay chart:** cumulative expense per year plotted Jan→Dec as one line per year — current year in full `brand`, previous years progressively dimmed slate. Tooltip pinned to a month shows each year's cumulative figure. `data-testid="yoy-chart"`.
2. **YoY badge:** in the year view, stat cards gain a second, smaller delta ("vs 2025: +8%") beside the existing MoM-style badge — only when the same month-span of the previous year has data.

## 3. Data model

None.

## 4. Server layer

Almost none. The all-time view already fetches monthly buckets for the entire history (`initialWealthData` ledger series and the chart-basis monthly series). Pivoting `{ year → cumulative month series }` is pure client-side arithmetic.

The **year view** fetches only the selected year, so YoY badges there need the previous year's totals: extend the dashboard server page to also call `getRangeDashboardData(prevYearStart, prevYearEnd, "month")` when `period=year` — mirroring exactly how month view already fetches `prevMonth` data — passed as `prevYearTotals`.

## 5. Client layer

- New `components/charts/YearOverYearChart.tsx`, lazy-loaded, Recharts `LineChart`, `accessibilityLayer={false}`, `useChartAnimation`.
- Pure helper `pivotByYear(monthlyBuckets)` → `{ year, points: { month, cumulative }[] }[]`; current year's line stops at the current month (like `PaceChart` stops at today).
- Render on all-time view below `WealthCurve`, only when ≥ 2 distinct years exist (otherwise render nothing — no empty-state card, per the "defer until data exists" note).
- `StatCard` already supports a delta badge; adding a second compact badge is a small prop extension (`secondaryDelta?`).

## 6. Offline considerations

Read-only, server-fetched buckets. None.

## 7. Edge cases & interactions

- **Basis:** cumulative *spending* comparison is a pattern stat → chart basis (the `dailyData` monthly series), consistent with `MonthlyBarChart`'s expense bars. (The wealth curve remains the ledger-basis view.)
- Partial first year (started tracking in July): that year's line starts at its first month with data; label it "(from Jul)" in the legend to prevent false "spent so little in 2025" reads.
- More than 4 years: cap visible lines at the 3 most recent + "earlier" hidden by default (legend toggles).
- YoY badge when last year's same-span is zero: hide instead of "∞%" (same guard pattern the MoM badges need).

## 8. Testing

- Vitest: `pivotByYear` — partial years, current-year truncation, single-year (returns data but component hides).
- Playwright: current-year line drifts monthly → mask `[data-testid="yoy-chart"]` in the all-time full-page snapshot + dedicated presence test. Stat-card badge covered by existing year-view snapshots (re-baseline).

## 9. Effort & risk

**S.** Pure pivot + one chart. The only judgment call is basis (chart) and the partial-year legend labeling. Supersedes backlog 7h — including its advice: **don't build until a second year of data exists**; the component hiding below 2 years makes it safe to ship dormant alongside other chart work.
