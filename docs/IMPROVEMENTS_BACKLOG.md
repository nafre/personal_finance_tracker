# Improvements Backlog

Ideas that were scoped but not fully implemented. Each open item has an effort estimate (S/M/L) and a suggested file to start from. Items marked **DONE** have since been implemented.

---

## UX / Features

### ~~1d — CSV Export~~ DONE
Implemented as `GET /api/export` — see `app/api/export/route.ts`. The transactions page has an **Export CSV ↓** button in the filter bar.

### 1e — Bulk Select + Bulk Delete (M, medium)
Add multi-select checkboxes to `TransactionList`, a "Delete selected" action, and optionally "Add label to selected".
- Start: `components/TransactionList.tsx` — add a `selectable` prop and checkbox column.
- Add `deleteTransactions(ids: string[])` server action to `lib/actions.ts`.

### 1f — Undo for Delete (S, medium)
5-second toast with "Undo" that re-inserts the deleted record before the server confirms deletion.
- Start: `components/TransactionList.tsx` `handleDelete` — stash the deleted record in a ref, show toast, cancel deletion on undo.
- Works without a new library: a simple `<div>` toast in the component tree.

### ~~1g — Visual Category Picker in Quick-Add~~ DONE
Implemented as a unified chip row in `ExpenseInput` (icon + colour tint, recently-used first, then all categories). Categories are fetched server-side on the dashboard page and passed down as `CategoryOption[]`; the transactions page reuses its existing on-mount fetch.

### 1h — Duplicate Detection (S, medium)
On add, check if a transaction with the same amount + category was created in the last 60 seconds and show an inline "looks like a duplicate" confirm.
- Start: `components/ExpenseInput.tsx` — in `handleSubmit`, check the most recent transactions list before calling `addTransaction`.

### ~~1i — Mobile Polish~~ DONE
- ~~Top-category label on mobile~~ DONE: the "Top spend" header label now renders at all widths (wraps below the month selector at 390px).
- ~~Month selector at 390px~~ DONE (Jul 2026 UI polish pass): no longer wraps; chevron icons, 44px arrow targets, `whitespace-nowrap` toggle. See `docs/UI_POLISH_JUL2026.md` for the full pass (icons, touch targets, dialog a11y, filter bar, safe areas).

### 1k — Transaction Templates / Favorites (M, high)
One-tap re-add for complete frequent transactions (category + amount + note + labels) — goes beyond the recently-used *category* chips, which still require typing the amount.
- Phase 1 (derived, no schema change): compute the top repeated `(category, amount, note)` tuples from recent transactions (client-side, `hooks/useDashboardState.ts`) and render a template chip row in `ExpenseInput`; tapping pre-fills the input text so the user can confirm/tweak before submit.
- Phase 2 (optional): explicit "Save as template" action on a `TransactionList` row — needs a small `Template` model (or pinned flag) + CRUD in `lib/actions.ts`.
- The add path must stay offline-aware: reuse the existing submit flow (`applyLocalMutation` when offline).
- Start: `components/ExpenseInput.tsx`, `hooks/useDashboardState.ts`.

### 1j — Recurring Upgrades (M, medium)
- "Backfill" button to create past instances when adding a rule mid-period.
- Duplicate-rule action.
- "Due this week" summary card on dashboard.
- Start: `components/recurring/RecurringList.tsx`, `components/recurring/RecurringRow.tsx`, `lib/actions.ts`.

---

## Performance

### ~~2d — Memoize Remaining Hot Paths~~ DONE
`TransactionRow` is wrapped in `React.memo` and `TransactionList`'s `handleDelete`/`handleUpdate`/`handleRestore` in `useCallback`. On the dashboard side, `recentTransactions` and a `budgetOptions` id/name list are memoized in `useDashboardState`, and `DashboardContent` reuses the stable `handleTransactionPosted` for `onRestore` — so row memoization holds at both call sites. (`recentCategories` was already memoized.)

### ~~2g — Batch Prop-Sync Effects in useDashboardState~~ DONE
The six prop-sync effects are merged into a single `useEffect` — one batched re-render per server refresh.

### ~~2h — Consolidate initialRecurring Loops~~ DONE
`dueCount`, `fixedAvailableCash`, and `fixedMonthlyExpense` are computed in one `useMemo` pass (due date + status evaluated once per rule).

### ~~2i — Bound getUsedLabels()~~ DONE
`getUsedLabels()` now scans only the 10,000 most recent transactions (`orderBy date desc, take: 10000`), matching the `getTransactionIds` bounded-query precedent.

### 2j — Bound SQLite Label-Filter Path in getTransactions (S, low — dev-only)
When `IS_SQLITE` and a label filter is active, `getTransactions` fetches **all** matching rows then filters in JS with no limit (the Postgres path filters and paginates in SQL). Fetch in bounded chunks or cap the scan.
- Start: `lib/actions.ts` (SQLite branch of `getTransactions`), `lib/db-adapter.ts` `getLabelFilter`.

### ~~2e — `getTransactionIds` Select-Only~~ DONE
`lib/actions.ts:getTransactionIds` now uses `select: { id: true }` — only IDs are fetched.

### ~~2f — Lazy-Load SpendingPieChart~~ DONE (removed as dead code)
`SpendingPieChart` was imported nowhere (the dashboard's category breakdown is `SpendingInsights`, no Recharts), so the component was deleted instead of lazy-wrapped. If a pie chart is ever re-introduced, follow the `dynamic(... , { ssr: false })` pattern used by `TrendChart`.

---

## Reliability

### ~~3b — Service Worker Retry/Backoff~~ DONE
Failed ops now carry `nextRetryAt` (exponential: 30s → 1m → 2m → 4m → 8m, base kept in sync between `lib/sync.ts` and `public/sw.js`). Drains stop at an op still inside its backoff window (causal order preserved); the SW rejects the sync event when ops remain so the browser reschedules with its own backoff. User-initiated syncs (`syncNow({ force: true })` — SyncStatusBar buttons, reconnect flush) bypass the window.

### 3e — Pagination Dedup in loadMore (S, low)
The transactions page's `loadMore()` appends the next cursor page without checking for IDs already in the list — if data changes server-side between pages, rows can duplicate. Filter appended results against existing IDs.
- Start: `app/(dashboard)/transactions/page.tsx` `loadMore`.

### ~~3c — Error Boundaries~~ DONE
`DashboardErrorBoundary` now takes an optional `section` prop rendering a compact card fallback with "Try again"; `DashboardContent` wraps each section (quick add, recurring, spending insights, trend chart, monthly chart, budgets, recent transactions) in its own boundary. The page-level boundary remains as the outer catch-all.

### ~~3d — Toast Notifications~~ DONE
Minimal `context/ToastContext.tsx` (no new dependency): `useToast().showToast(message, type)` with queue (max 3), 5s auto-dismiss, manual dismiss, `role="alert"` for errors. Mounted in `Providers`. Used for the failures that were invisible before: background add failure after `QuickAddSheet` closes (`ExpenseInput`), delete-failed-restored (`TransactionList`), recurring delete failure (`RecurringList`).

### ~~3f — Stale IDB Ghost After Cross-Page Delete~~ DONE
Fixed in two halves: (1) `TransactionList`'s online edit/delete now write through to the IDB mirror (`patchTransaction` with the server-canonical record / `deleteTransactionFromIDB` after server success), so cross-page mutations can no longer orphan mirror records; (2) `SyncProvider` exposes `reconcileCount`, bumped whenever `reconcileAfterSync` purges stale records — the dashboard's pending-load effect depends on it, so ghosts captured into React state before a reconcile finished are dropped without a reload.

---

## Insights & Analytics

### ~~4a — Year View + 12-Month Trend~~ DONE
Implemented as the Year / All-time dashboard views (`?period=` param, monthly trend granularity). See `app/(dashboard)/dashboard/page.tsx` and the "Dashboard — year view" e2e tests.

### 4b — Forecast / Runway (M, medium)
Use recurring rules + average daily spend to project end-of-month net balance.
- Add a `ForecastCard` component in `components/` that consumes `dailyData` + `initialRecurring`.

### 4c — Category Drilldown Page (M, medium)
Click a pie slice → `/transactions?category=X` works today but a dedicated drilldown with a 30-day sparkline is better.
- Add `app/(dashboard)/categories/[name]/page.tsx`.

### 4d — Spending Heatmap (S, low)
Daily intensity grid (GitHub contribution-style) for the year.
- Pure visualization component consuming a `getDailySpend(year)` action.

---

## Code Quality

### ~~5a — Split DashboardContent~~ DONE
State and handlers were extracted to `hooks/useDashboardState.ts`. `DashboardContent` is now a thin layout shell.

### ~~5b — Centralize IS_SQLITE Branch~~ DONE
Dialect abstraction lives in `lib/db-adapter.ts`: `IS_SQLITE`, `parseLabels`, `encodeLabels`, `normalizeTx`, `getLabelFilter`, `getDailyRows`. `lib/actions.ts` imports from there.

### 5c — Unit Tests (L, medium)
`lib/parser.ts`, `lib/utils.ts` (`getNextDueDate`, `getRecurringStatus`), and `lib/sync.ts` are untested but regression-prone.
- Add Vitest and write tests for these pure functions.

### 5d — Major Dependency Upgrades (L, low urgency — tackle one at a time)
From the Jul 2026 review. Each is its own project; **do not bundle**:
- **Prisma 6 → 7** — biggest risk (query API changes); mcp-server can stay on its own deps.
- **React 18 → 19** — 18 is still LTS; note the codebase deliberately avoids `startTransition(async fn)` because of React 18 behavior — revisit that note when upgrading.
- **Tailwind 3 → 4** — architectural changes; verify custom utility classes in `app/globals.css`.
- **Recharts 2 → 3** — chart API breaking changes; re-baseline visual snapshots after.
- **TypeScript 5.6 → 6.0** — lowest risk, mostly stricter checks.

### 5e — Align mcp-server zod Version (S, low)

`mcp-server/package.json` pins `zod ^3.x` while the main app uses `^4.x`. Harmless while the two share no code, but a footgun if validation logic is ever shared. Bump mcp-server to zod 4 and adjust any v3-only API usage.
- Start: `mcp-server/package.json`.

---

## Security & Hygiene

### 6a — Rate-Limit `/api/sync` and `/api/export` (S, medium)
`/api/sync` accepts writes and `/api/export` serves up to 10,000-row CSVs with only a session check. Add a simple per-session rate limit covering both.
- Use `@upstash/ratelimit` (free tier) or a tiny in-memory token bucket.
- Note: as of Jul 2026, `/api/sync` now also validates `sessionVersion` (stale-JWT rejection), matching server actions.

### 6d — Validate `/api/export` Query Params (S, low)
`month`/`year` come from `parseInt` with no NaN guard, and the `getTransactions` call has no try/catch — malformed params produce silent NaN filters or an unhandled 500. Validate params (reject or default on NaN) and wrap the fetch with an error response.
- Start: `app/api/export/route.ts`.

### 6b — Sentry Error Reporting (S, medium)
No production error visibility. Sentry's free tier covers a single-user app.
- `npm install @sentry/nextjs`, add `sentry.client.config.ts` and `sentry.server.config.ts`.

### 6c — Backup / Export (S, low)
Monthly "Download backup JSON" button in settings (or a scheduled email).
- Server action `exportAllData()` that returns JSON of all transactions, categories, and recurring rules.

---

## Visualizations

New charts scoped in Jul 2026. Each is tagged with the view it belongs to (month / year / all-time / general). All must respect the `excludeFromStats: false` filter — deriving from the already-filtered `dailyData`/`categoryData` gets this for free.

### ~~7a — Cumulative Spend Pace Line~~ DONE — month view
`components/charts/PaceChart.tsx` (lazy-loaded): cumulative spend vs last month's curve (muted) vs a straight even-pace line to the month's spending cap, with an "RM X ahead of / under pace" badge. The cap prefers an `overall` budget, falling back to an `excluded`-type budget's amount (overall-minus-categories is still a month-wide cap); `category`/`label` budgets never draw the line. Spend is chart-basis (excludeFromStats filtered), consistent with `SpendingInsights`' burn rate. No extra fetch was needed — the prev-month `getDashboardData` call already returned `dailyData`; it's now passed down as the `prevDailyData` prop. In the current month the spend line stops at today. Snapshot note: the current-month plot changes daily, so the month full-page e2e test masks the whole card and the dedicated test uses a fixed past month.

### 7b — Category Month-over-Month Comparison (S, high) — month view
Horizontal paired/diverging bars per category: this month vs last, delta labelled ("Food +RM120"). The stat cards' MoM delta covers only the total — this shows which category moved.
- Cheapest win: `prevCategoryData` is **already passed as a prop** to `DashboardContent` and only used for the top-level delta today.
- Start: toggle inside `components/SpendingInsights.tsx` (no new data fetch).

### 7c — Cash-Flow Waterfall (M, medium) — month view
Income on the left, stepping down through top expense categories, ending at the month's balance — the month's story as one narrative. Recharts has no native waterfall; use the stacked-bar-with-transparent-base trick.
- Data: `categoryData` + income total, already in props.
- Start: new `components/charts/WaterfallChart.tsx`.

### 7d — Stacked Monthly Bars by Category (M, medium) — year view
Twelve bars stacked by top-5 categories + "Other", consistent colours across months. Shows composition drift ("subscriptions doubled since March"), which the year trend line hides.
- Needs a per-month `groupBy(["category"])` in the year branch of `_fetchDashboardData` with the `excludeFromStats: false` filter.
- Start: `lib/actions.ts`, new `components/charts/StackedMonthlyChart.tsx`.

### 7e — Savings Rate Trend (S, medium) — year view
Line of `(income − expenses) / income` per month with a 0% reference line. The rate tracks financial health better than absolute numbers; no current view computes it.
- Pure client-side arithmetic over the year view's existing monthly totals. Could render as a sparkline inside the balance stat card instead of a full chart.
- Start: `hooks/useDashboardState.ts` (or the year-view equivalent), `components/StatCard.tsx`.

### 7f — Fixed vs Variable Split (M, medium) — year view
Stacked area per month: spend from recurring rules (rent, subscriptions) vs everything else — shows what portion of spending is actually controllable. Approximation is fine: sum `toMonthlyAmount()` over active rules as the fixed band, or match transactions to rules by category + amount tolerance.
- Start: `lib/utils.ts` (`toMonthlyAmount` already exported), new chart component.

### ~~7g — Cumulative Net Balance "Wealth Curve"~~ DONE — all-time view
`components/charts/WealthCurve.tsx` (lazy-loaded): running net balance over the all-time monthly buckets, rendered as the hero chart directly below the stat cards in `?period=all`. Headline figure is derived from the plotted (chart-basis) data so it always matches the curve's endpoint; a dashed zero reference line appears if the balance ever goes negative.

### 7h — Year-over-Year Overlay (M, low — until 2+ years of data) — all-time view
Cumulative spend per year plotted Jan→Dec as overlaid lines (current year brighter). Catches seasonal comparisons ("am I spending more than last year at this point?") that MoM deltas miss.
- Same monthly data, pivoted by year client-side. Defer until a second year of data exists.

### 7i — Budget Burndown Mini-Chart (S, medium) — cross-view
Small sparkline of remaining budget through the period inside each `BudgetProgress`. The bar says "70% used"; the burndown says "used it all in the first ten days."
- Budget spend is already computed client-side in `computeBudgetSpent` — derive the daily series with the same loop plus a date bucket.
- Start: `hooks/useDashboardState.ts`, `components/budgets/BudgetProgress.tsx`.

### 7j — Day-of-Week Spending Profile (S, low) — general
Seven bars: average spend Mon–Sun over the selected period. Surfaces habits invisible in a list ("weekends cost 2×"). Weak on a single month's sample — fit it to year/all-time views or `SpendingInsights` with a ≥3-month window.
- Client-side from transaction dates.

### ~~7k — Category Pie Chart~~ DONE — month view
Rebuilt as `components/charts/SpendingPieChart.tsx` (lazy-loaded, `ssr: false`): donut of top-6 categories + "Other", each category's stored colour (fallback `stringToColor`), HTML centre label with the chart-basis total (maskable via `amountMasks`). Slice **and** legend click (keyboard-accessible buttons) → `/transactions?month=&year=&category=X`. Rendered beside `PaceChart` in a second month-view charts row.
