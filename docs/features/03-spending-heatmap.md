# 03 — Spending Heatmap Calendar

**Analytics & insights** · Effort: **S** · Inspired by: GitHub's contribution graph, Spendee's calendar heat view · Backlog: **4d** · Depends on: —

## 1. Summary & inspiration

A GitHub-style intensity grid: one cell per day, color intensity = spend. It compresses a whole year of habits into one glance (paydays, weekend spikes, no-spend streaks) and pairs naturally with the existing `DayOfWeekChart` (which answers "which weekday"; the heatmap answers "which actual days"). Backlog 4d scoped it as a pure visualization.

## 2. UX design

- **Year and all-time views** (month view has too little area to be interesting): a card below `DayOfWeekChart`, `data-testid="heatmap-chart"`.
- Layout: 53 columns × 7 rows (weeks × weekdays), month labels along the top, like GitHub. All-time view shows the last 12 months (scrolling years of cells isn't worth it).
- Intensity scale: 5 buckets from `bg-slate-800` (zero) through brand-tinted steps to full `brand`; bucket thresholds from quantiles of the year's nonzero days (fixed thresholds make normal months look flat after one expensive day).
- Hover/tap tooltip: date + `formatCurrency(total)` + transaction count; click → `/transactions?from=&to=` for that day.
- A small "no-spend days: N" stat in the card header — a positive-reinforcement touch borrowed from habit trackers.
- Legend row: "less ▢▢▢▢▢ more".

## 3. Data model

None.

## 4. Server layer

The year view currently fetches **monthly** buckets (`getRangeDashboardData` with monthly granularity), so daily totals need one extra query:

- Add `getDailySpendSeries(startISO, endISO)` to `lib/actions.ts`: wraps the existing `getDailyRows(userId, start, end)` from `lib/db-adapter.ts` (which already handles both dialects and the `excludeFromStats` filter) and returns `{ date: string, total: number }[]` for expenses only.
- Call it from `app/(dashboard)/dashboard/page.tsx` in parallel with the existing fetches **only** when `period` is year/all-time, passed down as `initialHeatmapData` (mirror the `initialWealthData` pattern: empty array in month view).

## 5. Client layer

- New `components/charts/HeatmapChart.tsx`, lazy-loaded (`dynamic`, `ssr: false`) like every other chart. Not Recharts — a plain CSS grid of `<button>` cells is smaller, sharper, and keyboard-accessible.
- Pure helper `buildHeatmapCells(days, rangeStart, rangeEnd)` → 2D week/weekday matrix with quantile bucket per cell; put it in the component file or `lib/utils.ts` if reused.
- Use `useChartAnimation`/`useReducedMotion` conventions for any fade-in.

## 6. Offline considerations

Read-only, server-fetched series; a pending offline transaction won't appear until sync + refresh. Acceptable — the heatmap is a year-scale view, not a live counter.

## 7. Edge cases & interactions

- Chart basis: pattern stat → respects `excludeFromStats` (free via `getDailyRows`).
- Timezone: `getDailyRows` already handles per-dialect date bucketing (see the SQLite `unixepoch` gotcha in memory/CLAUDE.md) — reuse it, never re-derive day keys client-side from UTC timestamps.
- Sparse history (app used 2 months): render the full 12-month grid with empty leading cells, not a truncated grid.
- Future days in the current year: render as blank (not zero-intensity) so streak reading isn't distorted.

## 8. Testing

- Vitest: `buildHeatmapCells` — quantile bucketing, empty input, leap-day, week alignment (grid starts Monday to match `DayOfWeekChart`'s Mon–Sun order).
- Playwright: like `DayOfWeekChart`, the current year's grid gains cells daily → **mask** `[data-testid="heatmap-chart"]` in year/all-time full-page snapshots and add a dedicated presence test (assert 7 rows render). Add to `e2e/dashboard.spec.ts`.

## 9. Effort & risk

**S.** One bounded query, one pure layout function, one CSS grid. Main risk is date-bucket drift between dialects — avoided entirely by reusing `getDailyRows`. Supersedes backlog 4d.
