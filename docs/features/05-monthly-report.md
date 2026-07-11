# 05 — Monthly Report / "Month in Review"

**Analytics & insights** · Effort: **M** · Inspired by: Copilot's monthly review, Spotify Wrapped-style summaries · Backlog: — · Depends on: —

## 1. Summary & inspiration

Copilot's most-loved feature is the monthly review: once a month closes, a narrative summary — totals, biggest movers, records, streaks — that you actually read, unlike a dashboard you glance at. This app already renders past months read-only; a report page is the natural "closing ceremony" for them and reuses almost every existing aggregate.

## 2. UX design

- Route: `/reports/[year]/[month]` (e.g. `/reports/2026/6`). Entry points: a "Month report →" button next to the "Past month · view only" badge on read-only months, and on the dashboard for ~3 days after a month rolls over ("Your June report is ready").
- Vertical scroll of full-width **section cards** (deliberately more editorial than the dashboard):
  1. **Headline:** "June 2026 — you spent RM X, earned RM Y, saved Z%." with MoM delta.
  2. **Biggest movers:** top 3 categories by absolute RM change vs previous month (up and down).
  3. **Records:** largest single expense, most expensive day, longest no-spend streak.
  4. **Category donut** (reuse `SpendingPieChart`) + top-5 list (reuse `SpendingInsights` bar styling).
  5. **Budget outcomes:** each budget with final spent/limit and over/under badge.
  6. **Recurring recap:** what posted, total fixed costs, share of spend.
  7. **Footer:** links to the dashboard month view and `/transactions?month=&year=`.
- Only available for **closed** months (current month redirects to the dashboard).
- No sharing/export in v1 (self-contained; a print stylesheet is a cheap bonus — `@media print` hiding nav).

## 3. Data model

None. Reports are computed on demand — no snapshot table. (If report generation ever feels slow, add caching via `unstable_cache` keyed on month — but a single user's month is a few hundred rows; compute is trivial.)

## 4. Server layer

New `getMonthlyReport(month, year)` in `lib/actions.ts`:

- Validate month/year; reject the current/future month.
- Reuse `getDashboardData(month, year)` and `getDashboardData(prevMonth, prevYear)` (via `getPrevMonth`) rather than new queries — they already return totals, `categoryData`, `dailyData`, transactions.
- Compute report-only aggregates in TS from those results: movers (join current/prev `categoryData` by name), records (max over transactions/dailyData), no-spend streak (scan `dailyData`).
- Budgets: reuse `getBudgets()` + the same client-side spend rule — extract `computeBudgetSpent` from `hooks/useDashboardState.ts` into a pure shared module (`lib/budget-math.ts`) so server and client use one implementation.

Page: server component `app/(dashboard)/reports/[year]/[month]/page.tsx`; content is static per closed month, so it can be fully server-rendered with a thin client wrapper only for the lazy-loaded donut.

## 5. Client layer

- `components/report/ReportContent.tsx` + small section components; reuse `StatCard`, `SpendingPieChart`, `BudgetProgress`, `formatCurrency`, `getMonthName`.
- `data-testid="month-report"` on the root; `tabular-nums` on all amounts (masking convention).

## 6. Offline considerations

Server-rendered, online-only. Closed months have no pending mutations by definition (offline adds are dated *today*), so no IDB merge is needed.

## 7. Edge cases & interactions

- **Basis split:** headline income/expense/savings = ledger basis (matches stat cards); donut/movers/streak = chart basis (matches charts). Add a footnote when the two diverge ("RM N excluded from charts this month").
- First month of data: no previous month → hide movers/deltas, don't render "∞%".
- Months with zero transactions: friendly empty state.
- Budget set *after* that month: budgets are global (not historical) — same caveat the dashboard accepts today; note it in the budget section copy ("current budget definitions applied retroactively").
- Demo role: fine to view (read-only feature).

## 8. Testing

- Vitest: movers/records/streak computations — extract to `lib/report-math.ts` (pure) and test edge cases (ties, single-day month of data, all-zero days).
- Playwright: new `e2e/report.spec.ts` on a fixed past month — fully stable data, so a full-page snapshot at three viewports with `amountMasks(page)` works without masks.

## 9. Effort & risk

**M.** No new queries, no schema — the work is editorial layout plus careful reuse. The `computeBudgetSpent` extraction is the only refactor touching existing code; keep it byte-equivalent (move + import, covered by existing behavior).
