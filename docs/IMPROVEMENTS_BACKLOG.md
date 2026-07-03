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

### 1g — Visual Category Picker in Quick-Add (M, medium)
Surface `Category.icon` and `Category.color` as a horizontal chip row above `ExpenseInput`.
- Start: `components/ExpenseInput.tsx` — add a horizontally-scrollable row of category chips, click to pre-fill the category token.
- Fetch categories on mount (or accept as prop from parent).

### 1h — Duplicate Detection (S, medium)
On add, check if a transaction with the same amount + category was created in the last 60 seconds and show an inline "looks like a duplicate" confirm.
- Start: `components/ExpenseInput.tsx` — in `handleSubmit`, check the most recent transactions list before calling `addTransaction`.

### 1i — Mobile Polish (S, medium) — PARTIALLY DONE
- Make the top-category card visible on mobile (currently `hidden sm:flex` in `DashboardContent.tsx`) — still open.
- ~~Month selector at 390px~~ DONE (Jul 2026 UI polish pass): no longer wraps; chevron icons, 44px arrow targets, `whitespace-nowrap` toggle. See `docs/UI_POLISH_JUL2026.md` for the full pass (icons, touch targets, dialog a11y, filter bar, safe areas).

### 1j — Recurring Upgrades (M, medium)
- "Backfill" button to create past instances when adding a rule mid-period.
- Duplicate-rule action.
- "Due this week" summary card on dashboard.
- Start: `components/recurring/RecurringList.tsx`, `components/recurring/RecurringRow.tsx`, `lib/actions.ts`.

---

## Performance

### 2d — Memoize Remaining Hot Paths (S, medium)
Dashboard state was extracted to `hooks/useDashboardState.ts`. Some derived values (`recentCategories`) could still benefit from `useMemo`. Also consider wrapping `TransactionRow` in `React.memo`.
- Start: `hooks/useDashboardState.ts`.
- From the Jul 2026 review: `TransactionRow` renders in a list but isn't memoized, and `TransactionList`'s `handleDelete`/`handleUpdate`/`handleRestore` are recreated every render — wrap the row in `React.memo` **and** the handlers in `useCallback` together, or the memo is defeated by changing prop references. Start: `components/TransactionList.tsx`.

### 2g — Batch Prop-Sync Effects in useDashboardState (S, low)
Six separate `useEffect` blocks each sync one `initial*` prop into state (`setTransactions(initialTransactions)` etc.), so a single server refresh triggers multiple render cycles. Merge into one effect (or derive state during render where possible).
- Start: `hooks/useDashboardState.ts` (~lines 87–92).

### 2h — Consolidate initialRecurring Loops (S, low)
Three separate `useMemo` blocks (`dueCount`, `fixedAvailableCash`, `fixedMonthlyExpense`) each iterate `initialRecurring`. Compute all three in one pass returning an object.
- Start: `hooks/useDashboardState.ts` (~lines 98–130).

### 2i — Bound getUsedLabels() (S, medium)
`getUsedLabels()` fetches **every** transaction (`select: { labels: true }`, no `take`) just to dedupe label strings — O(n) memory with transaction count. Add a `take` bound (e.g. 10,000 most recent) or a grouped/raw query.
- Start: `lib/actions.ts` `getUsedLabels`.

### 2j — Bound SQLite Label-Filter Path in getTransactions (S, low — dev-only)
When `IS_SQLITE` and a label filter is active, `getTransactions` fetches **all** matching rows then filters in JS with no limit (the Postgres path filters and paginates in SQL). Fetch in bounded chunks or cap the scan.
- Start: `lib/actions.ts` (SQLite branch of `getTransactions`), `lib/db-adapter.ts` `getLabelFilter`.

### ~~2e — `getTransactionIds` Select-Only~~ DONE
`lib/actions.ts:getTransactionIds` now uses `select: { id: true }` — only IDs are fetched.

### 2f — Lazy-Load SpendingPieChart (S, medium)
`SpendingPieChart` is not dynamically imported — if re-introduced on the dashboard it would ship Recharts (~300KB) on the critical path.
- Wrap in `dynamic({ ssr: false })` like `TrendChart` and `BudgetManager`. Add a skeleton placeholder.

---

## Reliability

### 3b — Service Worker Retry/Backoff (S, medium) — PARTIALLY DONE
As of Jul 2026 the SW sync handler increments `retryCount`, stops on first failure (preserving causal order), and drops ops after `MAX_RETRIES = 5` — matching `lib/sync.ts`. Still open: exponential backoff between attempts (currently retries happen whenever the next sync event fires).
- Start: `public/sw.js` `drainQueueFromSW`.

### 3e — Pagination Dedup in loadMore (S, low)
The transactions page's `loadMore()` appends the next cursor page without checking for IDs already in the list — if data changes server-side between pages, rows can duplicate. Filter appended results against existing IDs.
- Start: `app/(dashboard)/transactions/page.tsx` `loadMore`.

### 3c — Error Boundaries (S, medium)
`DashboardErrorBoundary` exists at `components/DashboardErrorBoundary.tsx` but coverage is partial — an IDB seed failure could still crash individual sections.
- Wrap each dashboard section (charts, recurring, budgets) in its own boundary.

### 3d — Toast Notifications (S, medium)
No global toast system. Mutation failures are silent (except inline form errors).
- Add `sonner` (tiny) or build a minimal `ToastContext` with a queue and auto-dismiss.

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
