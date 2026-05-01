# Improvements Backlog

Ideas that were scoped but not implemented in the current session. Each entry has an effort estimate (S/M/L) and a suggested file to start from.

---

## UX / Features

### 1d — CSV Export (S, medium)
Add a "Download CSV" button on `/transactions` that streams the current filter result.
- Start: `app/(dashboard)/transactions/page.tsx` — add a button that calls a new `exportTransactions()` server action.
- Action returns a CSV string; trigger download via `Blob` + `URL.createObjectURL`.

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

### 1i — Mobile Polish (S, medium)
- Make the top-category card visible on mobile (currently `hidden sm:flex` in `DashboardContent.tsx:452`).
- Month selector at 390px — switch to a compact dropdown or swipe gesture.

### 1j — Recurring Upgrades (M, medium)
- "Backfill" button to create past instances when adding a rule mid-period.
- Duplicate-rule action.
- "Due this week" summary card on dashboard.
- Start: `components/recurring/RecurringList.tsx`, `components/recurring/RecurringRow.tsx`, `lib/actions.ts`.

---

## Performance

### 2d — Memoize Hot Paths in DashboardContent (S, medium)
`components/DashboardContent.tsx` (596+ lines) recomputes `dueCount`, `fixedAvailableCash`, `recentCategories` on every render.
- Wrap in `useMemo`. Also wrap `TransactionRow` in `React.memo`.

### 2e — `getTransactionIds` Select-Only (S, low)
`lib/actions.ts:getTransactionIds` fetches full rows to extract IDs. Use `select: { id: true }`.

### 2f — Lazy-Load Recharts on Idle (S, medium)
`SpendingPieChart` is not dynamically imported — it ships Recharts (~300KB) on the critical path.
- Wrap in `dynamic({ ssr: false })` like `TrendChart`. Add a skeleton placeholder.

---

## Reliability

### 3b — Service Worker Retry/Backoff (S, medium)
`public/sw.js:syncQueueFromSW` has no backoff. Network glitch = permanent miss for that sync cycle.
- Add exponential backoff (1s → 2s → 4s) with a max attempt count before marking as failed.

### 3c — Error Boundaries (S, medium)
`DashboardContent` has no error boundary — an IDB seed failure crashes the whole page.
- Add a `components/ErrorBoundary.tsx` (class component) and wrap dashboard sections.

### 3d — Toast Notifications (S, medium)
No global toast system. Mutation failures are silent.
- Add `sonner` (0.7KB) or build a minimal `ToastContext` with a queue and auto-dismiss.

---

## Insights & Analytics

### 4a — Year View + 12-Month Trend (M, medium)
A `?view=year` mode on the dashboard with a 12-month bar chart of income/expense.
- Extend `getDashboardData` to accept `view: "month" | "year"`, or add a separate `getYearData(year)` action.

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

### 5a — Split DashboardContent (M, medium)
`components/DashboardContent.tsx` is 600+ lines. Extract:
- `hooks/useDashboardState.ts` — state + mutation handlers
- `hooks/useIDBSync.ts` — IDB seeding + pending merge logic
- Keep the component as a thin layout shell.

### 5b — Centralize IS_SQLITE Branch (S, low)
`lib/actions.ts` has the SQLite guard inlined in multiple queries. Extract a `labelsQuery(label)` helper returning the right Prisma fragment.

### 5c — Unit Tests (L, medium)
`lib/parser.ts`, `lib/utils.ts` (`getNextDueDate`, `getRecurringStatus`), and `lib/sync.ts` are untested but regression-prone.
- Add Vitest and write tests for these pure functions.

---

## Security & Hygiene

### 6a — Rate-Limit `/api/sync` (S, medium)
The `/api/sync` endpoint accepts writes with only a session check. Add a simple per-session rate limit.
- Use `@upstash/ratelimit` (free tier) or a tiny in-memory token bucket.

### 6b — Sentry Error Reporting (S, medium)
No production error visibility. Sentry's free tier covers a single-user app.
- `npm install @sentry/nextjs`, add `sentry.client.config.ts` and `sentry.server.config.ts`.

### 6c — Backup / Export (S, low)
Monthly "Download backup JSON" button in settings (or a scheduled email).
- Server action `exportAllData()` that returns JSON of all transactions, categories, recurring rules.
