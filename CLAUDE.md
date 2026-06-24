# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start dev server (via scripts/dev.mjs)
npm run build        # prisma generate + next build (also the type-check gate — there is no separate lint step)
npm run db:push      # Push Prisma schema to DB (no migration history)
npm run db:migrate   # Deploy pending migrations
npm run db:studio    # Open Prisma Studio
npm run db:seed      # Seed with tsx prisma/seed.ts
npm run test:ui      # Run visual regression tests (Playwright)
npm run test:ui:update  # Regenerate snapshot baselines after intentional design changes
npm run test:ui:report  # Open the HTML test report

# SQLite local dev (no Supabase credentials needed — set DATABASE_URL=file:./dev.db)
npm run db:dev:generate  # Generate Prisma client for SQLite schema
npm run db:dev:push      # Push SQLite schema to dev.db
npm run db:dev:studio    # Open Prisma Studio for SQLite DB
npm run db:dev:seed      # Seed SQLite DB
```

## Playwright MCP — Live Browser Debugging

The project ships a `.mcp.json` that registers the `@playwright/mcp` server. When the MCP is active, Claude can control a real browser directly to debug UI issues without writing a test first:

- **Navigate** to any page (`browser_navigate`)
- **Screenshot** the current state (`browser_screenshot`)
- **Click / fill / hover** on elements (`browser_click`, `browser_fill`, `browser_hover`)
- **Evaluate JS** in the page context (`browser_evaluate`)

The dev server must be running (`npm run dev`) before using these tools. The MCP opens its own browser instance separate from the Playwright test runner.

**When to use MCP vs test runner:**
| Situation | Tool |
|-----------|------|
| Diagnosing an existing visual bug | MCP (fast, interactive) |
| Verifying a fix didn't regress anything | `npm run test:ui` |
| Recording a new baseline after a design change | `npm run test:ui:update` |

## UI Testing — MANDATORY WORKFLOW

**After every UI change, Claude MUST:**

1. Run `npm run test:ui` to verify no layout regressions.
2. If tests fail because the change was *intentional*, run `npm run test:ui:update` to regenerate baselines, then commit the updated snapshots alongside the code change.
3. If tests fail because of an *unintended* regression, fix the code before reporting the task complete.

**When adding a new component or page, Claude MUST:**

- Add a visual regression test to the relevant spec file in `e2e/`.
- Screenshot the component at its natural size with `toHaveScreenshot`.
- Add a `data-testid` attribute to the root element of any new significant layout container (card, section, page-level wrapper) so tests can target it precisely.
- Use `amountMasks(page)` (from `e2e/helpers.ts`) whenever the component displays currency values.

### Test structure

| File | What it covers |
|------|----------------|
| `e2e/login.spec.ts` | Login layout, error state |
| `e2e/dashboard.spec.ts` | Full page, stat cards, quick-add, transaction list, recurring section, navigation |
| `e2e/transactions.spec.ts` | Full page, filter bar, summary strip, transaction list, category filter |
| `e2e/settings.spec.ts` | Settings page: categories tab, account tab, users tab (admin) |

Tests run at three viewports: **mobile (390px)**, **tablet (768px)**, **desktop (1280px)**.

### Snapshot stability

Snapshots live in `e2e/snapshots/<project>/<spec>/<test>.png` and are committed to git.

- **Currency amounts** are masked via `.tabular-nums` — they never break the snapshot.
- **Dates and category names** appear in snapshots. Update baselines with `npm run test:ui:update` if data changes substantially.

### One-time setup required

Add to `.env.local` (same credentials used to log in to the app):
```
TEST_EMAIL=<same value as ADMIN_EMAIL>
TEST_PASSWORD=<your plaintext login password>
```

Then generate initial snapshots: `npm run test:ui:update`

## Environment

Copy `.env.example` to `.env.local`. Required variables:

| Variable | Purpose |
|----------|---------|
| `POSTGRES_PRISMA_URL` | Pooled connection (pgbouncer) — Supabase-Vercel integration |
| `POSTGRES_URL_NON_POOLING` | Direct connection — used by `db:push` / `db:migrate` |
| `NEXTAUTH_SECRET` | Random secret for JWT signing (`openssl rand -base64 32`) |
| `NEXTAUTH_URL` | App base URL (e.g. `http://localhost:3000`) |
| `ADMIN_EMAIL` | Login email for the single app user |
| `ADMIN_PASSWORD_HASH` | Initial bcryptjs password hash (bootstrap only — overridden by DB once changed via Settings → Account) |
| `APP_USER_ID` | Stable user ID written to the DB at first sign-in |
| `DATABASE_URL` | **SQLite only** — set to `file:./dev.db` to skip Supabase entirely |

When `DATABASE_URL` is set, all `POSTGRES_*` variables are ignored and the app uses SQLite via `prisma/schema.sqlite.prisma`.

## Architecture

**Stack:** Next.js 16 App Router · React 18 · Prisma 6 (PostgreSQL/Supabase or SQLite) · NextAuth v4 · SWR 2 · Recharts · Tailwind CSS · IndexedDB (`idb@8`) · `bcryptjs` (password hashing) · `zod` (input validation) · `clsx` + `tailwind-merge` (`cn()` helper)

### Data flow

All mutations go through `lib/actions.ts` (`"use server"` file). Every transaction mutation calls `revalidatePath("/dashboard")` and `revalidatePath("/transactions")` — **not** `revalidatePath("/")`, because the root page is just a redirect and revalidating it triggers an unwanted navigation cycle.

The dashboard uses a **hybrid render pattern**:
1. `app/(dashboard)/dashboard/page.tsx` is a server component — reads `?month=&year=` search params (defaults to current month), then fetches `getDashboardData(month, year)`, `getDashboardData(prevMonth, prevYear)`, and `getRecurringTransactions()` in parallel, passing results as `initial*` props.
2. `DashboardContent` is a thin client orchestrator — it calls `useDashboardState(props)` and renders pure JSX. All state, effects, memos, and mutation handlers live in `hooks/useDashboardState.ts`.
3. After a mutation completes, the handlers in `useDashboardState` update all affected state slices (`transactions`, `totalIncome`, `totalExpenses`, `categoryData`, `dailyData`) so the UI reflects changes without waiting for a server re-render.

Props passed to `DashboardContent`: `initialTransactions`, `initialTotalIncome`, `initialTotalExpenses`, `initialCategoryData`, `initialDailyData`, `initialTopCategory`, `initialRecurring`, `initialBudgets`, `month`, `year`, `prevTotalExpenses`, `prevTotalIncome`, `prevCategoryData`.

The transactions page (`/transactions`) is a **fully client-side** page. It fetches data via the `getTransactions` server action through **SWR**, keyed by a serialized filter object (`month`, `year`, `category`, `label`, `q`, `from`, `to`) — re-visiting a previously-seen filter returns cached data instantly while revalidating in the background. Cursor-based "Load more" pagination appends pages outside SWR; categories and budgets are fetched once on mount. A drop in `pendingCount` (sync completed) triggers a silent `mutate()` to clear "Pending" badges.

**Important React 18 note:** Do not use `startTransition(async fn)` for server actions — React 18 does not properly track async transitions. Use plain `async/await` with a `useState` loading flag instead.

### Offline-first & background sync

The app is offline-capable. Mutations made without network connectivity are queued to IndexedDB and flushed when connectivity is restored.

**Layers:**

1. **`lib/idb.ts`** — singleton IndexedDB wrapper (`idb` library). Two stores (DB version 2):
   - `transactions` — local mirror of server records plus pending items. Each record has `syncStatus: "synced" | "pending" | "pending-update" | "pending-delete"`.
   - `syncQueue` — ordered queue of pending mutations (`op: "add" | "update" | "delete"`, autoIncrement `queueId` preserves causal order). Each entry has an optional `retryCount` for failure tracking.
   - Never pass a DB handle around — all exported functions lazy-open the singleton internally.

2. **`lib/sync.ts`** — pure client-side logic (no React):
   - `applyLocalMutation(op, data)` — writes to IDB + enqueues when offline. For `add`, generates a `pending_${timestamp}_${random}` temp ID. For pending-adds that are subsequently edited, updates the queue entry in-place rather than adding a second UPDATE op.
   - `drainQueue()` — processes `syncQueue` in insertion order, POST-ing each op to `/api/sync`. Drops ops that have hit `MAX_RETRIES = 5`. On `add` success, calls `replaceTempId` to swap the temp ID for the real server ID (atomic IDB transaction that also remaps any subsequent queue entries referencing the old temp ID). Stops on first failure to preserve ordering.
   - `seedIDBFromServer(transactions, userId)` — upserts server data into IDB as `synced`; never overwrites pending records.
   - `reconcileAfterSync(userId)` — calls `getTransactionIds()` (server action) then `reconcileWithServer()` (IDB) to delete any local IDB records whose IDs no longer exist on the server. Called by `SyncProvider` on first load when online.

3. **`app/api/sync/route.ts`** — `POST /api/sync`. REST endpoint used by the service worker (which cannot call server actions). Accepts `{ op, id?, payload? }`, validates session cookie, applies the same ownership checks as `lib/actions.ts`. Returns `{ success: true, id? }`. For `add` ops uses upsert on `clientId` (the temp ID) to safely deduplicate retries.

4. **`context/SyncProvider.tsx`** — React context wrapping the whole app (inside `SessionProvider`). Exposes `{ isOnline, pendingCount, failedCount, isSyncing, syncNow, refreshPendingCount, userId }` (`failedCount` = local records carrying a `syncError`). Registers `/sw.js`, listens for `online`/`offline` events, auto-calls `syncNow()` on reconnect. Registers the `"expense-sync"` BackgroundSync tag whenever `pendingCount > 0`.

5. **`public/sw.js`** — service worker (plain JS, no bundler):
   - Cache-first for `/_next/static/**` and `/icons/**`.
   - Network-first with cache fallback for page navigations.
   - `sync` event handler (`"expense-sync"`) drains `syncQueue` from IDB via raw cursor API and POSTs each op to `/api/sync`.

**Offline mutation flow:**

```text
User adds "food 20" offline
  → ExpenseInput checks isOnline === false
  → applyLocalMutation("add", {...}) → tempId = "pending_…"
  → IDB transactions: { id: tempId, syncStatus: "pending" }
  → IDB syncQueue:    { queueId: 1, op: "add", tempId, payload }
  → onAdd({ id: tempId, isPending: true }) → amber "Pending" badge in UI

Page reload (still offline)
  → DashboardContent useEffect reads IDB → pending item still visible ✓

Network reconnects
  → SyncProvider: isOnline = true → syncNow()
  → drainQueue → POST /api/sync { op: "add" } → { success: true, id: "cuid…" }
  → replaceTempId(tempId, realId) — atomic IDB: delete old key, insert new
  → router.refresh() → server re-fetches → pending badge disappears ✓

App closed during sync
  → SW fires "expense-sync" BackgroundSync → drains queue via /api/sync ✓
```

**Component responsibilities with offline:**

- `ExpenseInput` — checks `isOnline`; offline path calls `applyLocalMutation`, online path calls `addTransaction` + writes through to IDB (`putTransaction`).
- `TransactionList` — `handleSave` and `handleDelete` check `isOnline`; offline routes to `applyLocalMutation`.
- `DashboardContent` — seeds IDB on mount (`seedIDBFromServer`), loads pending items from IDB into `pendingTransactions` state (refreshed when `pendingCount` changes), merges with server list (deduped by ID), adds pending income/expense deltas to stat cards.
- `SyncStatusBar` — amber banner when offline, indigo spinner when syncing; rendered at the top of the dashboard.

### SQLite mode

When `DATABASE_URL=file:./dev.db` is set, the app targets `prisma/schema.sqlite.prisma` instead of the PostgreSQL schema. SQLite does not support native array columns, so array fields (`labels`, `excludedBudgetIds`, and Budget's `excludedCategories`/`labels`) are stored as JSON strings. All DB-dialect branching is centralised in `lib/db-adapter.ts`: `IS_SQLITE`, `parseLabels`/`encodeLabels` (transaction arrays), `parseBudgetArray`/`encodeBudgetArray` + `normalizeBudget` (budget arrays), `normalizeTx` (parses `labels`/`excludedBudgetIds` and coerces `excludeFromStats` to a boolean), `getLabelFilter` (returns empty for SQLite — callers do JS-side filtering), and `getDailyRows` (different raw SQL per dialect; always filters out `excludeFromStats` rows). `lib/actions.ts` imports from `lib/db-adapter.ts` rather than inlining these helpers. Note: `excludeFromStats` is a real `Boolean` column (not a JSON array), so it is filterable directly in SQL on both dialects.

### Currency

All amounts are displayed in Malaysian Ringgit. `formatCurrency(amount)` in `lib/utils.ts` outputs `RM1,234.56` using the `ms-MY` locale. The `currency` parameter was removed — everything is MYR. The parser already strips the `rm` prefix from input tokens.

### Key files

| File | Role |
|------|------|
| `types/index.ts` | Shared TypeScript interfaces: `Transaction`, `CategoryData`, `DailyData`, `RecurringTransaction`, `Budget`, `CategoryOption`. Import from here — do not redeclare locally. |
| `lib/actions.ts` | All server actions (CRUD + data fetch). Single source of truth for DB access. All mutations are Zod-validated via `lib/validation.ts`. Exports: `addTransaction`, `updateTransaction`, `deleteTransaction`, `getTransactionIds`, `getDashboardData`, `getTransactions`, `getCategories`, `addCategory`, `updateCategory`, `deleteCategory`, `addDefaultCategories`, `getRecurringTransactions`, `createRecurringTransaction`, `updateRecurringTransaction`, `deleteRecurringTransaction`, `postRecurringTransaction`, `skipRecurringTransaction`, `getBudgets`, `upsertBudget`, `deleteBudget`, `changePassword`, `createUser`, `getSessionRole`, `getUsers`, `deleteUser`, `updateUser`, `adminResetPassword`. |
| `lib/db-adapter.ts` | DB-dialect abstraction: `IS_SQLITE`, `parseLabels`, `encodeLabels`, `parseBudgetArray`, `encodeBudgetArray`, `normalizeTx` (transactions, incl. `excludeFromStats`), `normalizeBudget`, `getLabelFilter`, `getDailyRows`. Keeps all SQLite/Postgres branching out of `actions.ts`. |
| `lib/validation.ts` | Zod schemas: `transactionSchema`, `categorySchema`, `budgetSchema`, `recurringSchema`, `passwordSchema`. Applied at the top of every mutation in `actions.ts`. |
| `lib/idb.ts` | IndexedDB singleton (DB version 2): `transactions` and `syncQueue` stores. Typed with `idb@8`. `LocalTransaction` mirrors the server record incl. `labels`, `excludedBudgetIds`, and `excludeFromStats`. `QueuedOp` has `retryCount?: number`. Key exports: `putTransaction`, `patchTransaction`, `getTransactionsByMonth`, `getTransactionFromIDB`, `deleteTransactionFromIDB`, `replaceTempId`, `enqueueOp`, `getAllQueuedOps`, `deleteQueuedOp`, `updateQueuedOp`, `getPendingCount`, `getFailedSyncCount`, `seedIDBFromServer`, `reconcileWithServer`. |
| `lib/sync.ts` | Offline mutation logic: `applyLocalMutation`, `drainQueue` (MAX_RETRIES=5, increments retryCount on failure), `seedIDBFromServer`, `reconcileAfterSync`. |
| `lib/parser.ts` | Parses natural-language input into `{category, amount, type, note, labels}`. Type inferred from `INCOME_KEYWORDS`. Labels parsed from `#tag` tokens (e.g. `food 20 #date`). |
| `lib/utils.ts` | `cn`, `formatCurrency`, `formatDate`, `formatDateShort`, `getMonthName`, `getCurrentMonthYear`, `getPrevMonth`, `getNextMonth`, `getNextDueDate`, `getRecurringStatus`, `isPostedThisPeriod`, `toMonthlyAmount`, `countRemainingPayments`, `stringToColor`. Also exports `DEFAULT_CATEGORIES` (used server-side only — do not import in client components to avoid Turbopack module boundary conflicts). |
| `lib/auth.ts` | NextAuth config. JWT callback stores `sessionVersion` alongside `userId`/`role`. Bootstrap path seeds default categories for the admin user on first login. |
| `context/SyncProvider.tsx` | React context: online state, pending count, failed count, sync trigger, SW registration. Exposes `{ isOnline, pendingCount, failedCount, isSyncing, syncNow, refreshPendingCount, userId }`. Runs `reconcileAfterSync` on first load while online. Must be inside `SessionProvider`. |
| `hooks/useDashboardState.ts` | All dashboard state, effects, memos, and handlers extracted from `DashboardContent`. Returns everything the JSX needs including `handleAdd`, `handleReplace`, `handleDelete`, `handleUpdate`. |
| `hooks/useOnlineStatus.ts` | Thin hook: `navigator.onLine` + `online`/`offline` events. |
| `app/api/sync/route.ts` | REST endpoint for SW background sync. Mirrors `lib/actions.ts` ownership checks. Uses upsert on `clientId` for add-op deduplication. |
| `app/api/export/route.ts` | GET endpoint for CSV export. Accepts `month`, `year`, `category`, `label`, `q` query params. Returns `text/csv` attachment scoped to the authenticated user. |
| `public/sw.js` | Service worker: static caching + BackgroundSync drain. Plain JS, raw IDB cursor API. |
| `components/DashboardContent.tsx` | Thin client orchestrator: calls `useDashboardState(props)` and renders JSX. No state or logic lives here directly. |
| `components/StatCard.tsx` | Standalone stat card with gradient background, MoM delta badge, and income/expense/balance colour variants. |
| `components/ExpenseInput.tsx` | Quick-add input with Exp/Inc type toggle pill. Offline-aware: routes to `applyLocalMutation` when offline. |
| `components/TransactionList.tsx` | Renders rows with label badges, amber "Pending" badge for unsynced items, and a grey "Off-chart" badge when `excludeFromStats` is set; inline edit/delete are offline-aware. The inline edit form includes a `LabelEditor`, a `BudgetExcludeSelect` (per-transaction `excludedBudgetIds`, expenses only), and an "Exclude from charts" checkbox (`excludeFromStats`, all types). Delete shows spinner while in-flight; edit form dims (`opacity-50`) while saving. `CategoryCombobox` receives `CategoryOption[]` for icon display. |
| `components/CategoryCombobox.tsx` | Searchable category dropdown. Accepts `categories: CategoryOption[]` — renders icon alongside name. Has "Use …" option for free-text entry. |
| `components/CategoryManager.tsx` | Settings category list with inline edit mode for custom categories (name + icon + colour picker). Default categories show a "Default" badge; custom categories show pencil + delete icons. |
| `components/budgets/BudgetManager.tsx` | Dashboard modal to create/edit/delete budgets. Supports the four `budgetType`s (overall / category / excluded / label). Dynamically imported. |
| `components/budgets/BudgetProgress.tsx` | Progress bar with "RM X.XX remaining" / "RM X.XX over budget" label below the bar. |
| `components/SyncStatusBar.tsx` | Offline/syncing status indicator. |
| `components/MonthSelector.tsx` | Month/year navigation control used on the dashboard. |
| `components/SpendingInsights.tsx` | Spending pace/burn-rate analysis card. |
| `components/QuickAddSheet.tsx` | Bottom-sheet wrapper for `ExpenseInput` on mobile. |
| `components/NavBar.tsx` | Top navigation bar. |
| `components/Providers.tsx` | Composes `SessionProvider` + `SyncProvider` at the app root. |
| `components/charts/SpendingPieChart.tsx` | Category spending pie chart (Recharts). |
| `components/charts/TrendChart.tsx` | Daily income/expense area chart (Recharts). |
| `components/recurring/RecurringList.tsx` | Client component owning recurring state. Syncs from `initialRecurring` via `useEffect`. |
| `components/recurring/RecurringRow.tsx` | Individual recurring row: status badge, Post/Skip/Edit/Delete. Uses plain async/await (not startTransition). |
| `components/recurring/RecurringForm.tsx` | Create/edit form for recurring rules. Passes `CategoryOption[]` to `CategoryCombobox`. |
| `components/DashboardErrorBoundary.tsx` | Error boundary wrapping dashboard sections to isolate IDB/render failures. |
| `components/UserManager.tsx` | Admin-only client component: user list (avatar, role badge, inline reset-password expand) + create form. Exports `UserRecord` interface. |
| `components/SettingsTabs.tsx` | Client component wrapping all settings sections in a tab bar (Users / Categories / Account). Admins default to Users tab; non-admins default to Categories tab. |
| `prisma/schema.prisma` | Five models: `User`, `Transaction`, `Category`, `Budget`, `RecurringTransaction`. |
| `prisma/schema.sqlite.prisma` | SQLite-compatible variant of the schema (used when `DATABASE_URL` is set). |

### Schema overview

**User** — `id, email String @unique, name, passwordHash, role String ("admin"\|"user"\|"demo"), sessionVersion Int @default(1), createdAt, updatedAt`
- `sessionVersion` is incremented by `changePassword` and `adminResetPassword`. `getAuthenticatedUserId()` compares this DB value against the JWT claim — a mismatch throws `"Unauthorized"`, invalidating stale tokens. After a password change the client calls `signOut()` so the user re-authenticates with a fresh token.
- No FK relations to other models — cascade deletes must be done manually in `deleteUser()` using `db.$transaction`.

**Transaction** — `id, clientId String? @unique, userId, amount Float, category, note?, date, type String ("income"\|"expense"), labels String[] @default([]), excludedBudgetIds String[] @default([]), excludeFromStats Boolean @default(false), createdAt, updatedAt`
- `clientId` stores the offline temp ID (`pending_…`) and is used by `/api/sync` to upsert offline-add ops idempotently, preventing duplicates on retry.
- `excludedBudgetIds` — budget IDs this transaction is excluded from (per-transaction budget opt-out; filtered client-side in `useDashboardState`).
- `excludeFromStats` — when `true`, the transaction is dropped from the dashboard charts (category breakdown + daily trend) but **still counts** in the Income/Expense/Balance totals.
- On SQLite, `labels` and `excludedBudgetIds` are JSON strings; `excludeFromStats` is a native `Boolean`.

**RecurringTransaction** — `id, userId, name, category, amount, type, frequency ("daily"\|"weekly"\|"monthly"\|"yearly"), startDate, endDate?, lastRun?, isActive, note?, createdAt, updatedAt`

**Category** — `id, userId, name, icon, color, isDefault, createdAt`

**Budget** — `id, userId, name @default("Budget"), amount Float, period @default("monthly"), budgetType ("overall"\|"category"\|"excluded"\|"label"), category?, excludedCategories String[] @default([]), labels String[] @default([]), createdAt, updatedAt`. Unique on `[userId, name]`. On SQLite, `excludedCategories`/`labels` are JSON strings (handled by `normalizeBudget`/`encodeBudgetArray`).

**IndexedDB `transactions` store** — mirrors Transaction fields (incl. `labels`, `excludedBudgetIds`, `excludeFromStats`) plus `syncStatus: "synced"|"pending"|"pending-update"|"pending-delete"`, `syncError?`, and ISO-string dates. Key: `id`.

**IndexedDB `syncQueue` store** — `queueId` (autoIncrement), `op`, `tempId`, `payload`, `createdAt`, `retryCount?`. Key: `queueId`. Ops with `retryCount >= 5` are dropped by `drainQueue` to prevent queue deadlock.

### Features

#### User management (admin only)

Admin users see a **Users** tab in Settings (non-admins see only Categories and Account tabs). The tab UI is owned by `SettingsTabs.tsx`. `UserManager.tsx` renders the user list and create form.

- **Create**: Admin fills name, email, password, role → calls `createUser()` → optimistic update
- **Reset password**: Inline expand per row → calls `adminResetPassword()` — no old password required
- **Delete**: Calls `deleteUser()` with atomic cascade; button disabled for self and last admin
- The settings page fetches `getUsers()` sequentially after `getSessionRole()` to avoid calling it for non-admins

#### Month navigation

The dashboard supports historical month browsing via `?month=&year=` search params (e.g. `?month=3&year=2025`). `MonthSelector` renders prev/next arrows and updates the URL. The server component fetches both the selected month and the previous month (for MoM comparisons on stat cards).

#### Income/Expense toggle
`ExpenseInput` has an **Exp / Inc** pill toggle left of the text field. State: `manualTypeOverride` (`null` = follow parser). Resets to `null` when input is cleared.

#### Labels
Transactions support an array of string labels (e.g. "date", "house", "work"). Labels can be:
- Added via quick-add using `#tag` syntax: `coffee 15 starbucks #date #work`
- Added/removed in the inline edit form (`LabelEditor` component in `TransactionList.tsx`)
- Filtered in the transactions page via a label dropdown (uses `{ labels: { has: label } }` Prisma query)

Labels are displayed as small color-coded badges using `stringToColor(label)` for consistent per-label colors.

#### Recurring transactions
Rules stored in `RecurringTransaction` table. Displayed in a collapsible card on the dashboard between the quick-add input and the stat cards. Auto-expands when items are due or overdue.

- **Status logic** in `lib/utils.ts`: `getNextDueDate(frequency, startDate, lastRun)` + `getRecurringStatus(nextDue, endDate)` → `"upcoming" | "due" | "overdue" | "ended"`
- **Posting**: `postRecurringTransaction(id)` atomically creates a `Transaction` and updates `lastRun` via `db.$transaction([...])`. Both pages are revalidated.
- **Skipping**: `skipRecurringTransaction(id)` advances `lastRun` to the next due date without creating a transaction (marks the period as handled without recording a charge).
- **UI sync**: `RecurringList` uses a `useEffect([initialRecurring])` to sync local state when server data arrives after `revalidatePath`.

#### CSV export

The transactions page has an **Export CSV ↓** button in the filter bar. It calls `GET /api/export` with the current `month`, `year`, `category`, `label`, and `q` params. The route returns a `text/csv` attachment (`expenses-YYYY-MM.csv`) with columns: `Date, Category, Type, Amount (RM), Note, Labels`. Up to 10,000 rows are included.

#### Category management

Settings → Categories shows all categories split into Default and Custom groups. Custom categories have a **pencil icon** that opens an inline edit form (name, emoji icon, colour picker). Saving calls `updateCategory()` in `lib/actions.ts` which validates with `categorySchema.partial()`, checks for name conflicts, and updates the DB. Default categories show a read-only "Default" badge and cannot be edited or deleted. New categories are created via the Add form at the bottom.

#### CategoryCombobox icons

`CategoryCombobox` accepts `categories: CategoryOption[]` (with `name`, `icon?`, `color?`). The dropdown renders the emoji icon beside each category name. Callers (TransactionList edit form, RecurringForm) map the `getCategories()` result to `CategoryOption[]` before passing it in.

#### Budgets

Budgets are stored in the `Budget` table and managed via `BudgetManager` (dashboard modal, dynamically imported). Each budget has a `budgetType`:
- `overall` — all expenses count.
- `category` — only the matching `category`.
- `excluded` — all expenses except those in `excludedCategories`.
- `label` — expenses carrying any of the budget's `labels`.

Per-budget spend is computed **client-side** in `useDashboardState` (`computeBudgetSpent`) by iterating the month's transactions and applying the type rule — skipping any transaction that lists the budget in its `excludedBudgetIds`. `BudgetProgress` shows a "RM X.XX remaining" line (emerald) or "RM X.XX over budget" line (rose) below each progress bar.

#### Per-transaction budget exclusion

A transaction can be excluded from specific budgets via its `excludedBudgetIds` array. The inline edit form's `BudgetExcludeSelect` (expenses only) lets you tick which budgets to opt out of. Because budget spend is computed client-side, no server aggregation change is needed — `computeBudgetSpent` simply skips excluded transactions.

#### Exclude from charts (`excludeFromStats`)

A per-transaction **boolean** toggle ("Exclude from charts" checkbox in the inline edit form, all types) that drops a transaction from the dashboard's **category breakdown** (pie chart, "Top spend", `SpendingInsights`) and **daily trend** chart — while keeping it in the Income/Expense/Balance totals. Excluded rows show a grey "Off-chart" badge.

Because these charts are aggregated **server-side**, the filtering happens in `_fetchDashboardData` (`lib/actions.ts`): totals come from an unfiltered `groupBy(["type"])`, while the category breakdown uses a separate `groupBy(["category"])` with `where: { excludeFromStats: false }`; `getDailyRows` always appends the `excludeFromStats` filter to its raw SQL. The optimistic handlers in `useDashboardState` (`handleAdd`/`handleUpdate`/`handleDelete`) mirror this: totals always update, but `categoryData`/`dailyData` are only patched when `!excludeFromStats` (with `handleUpdate` accounting for the flag toggling). `SpendingInsights` derives its own total from the already-filtered `categoryData` so its bars, burn rate, and pace badge stay on the same basis as the charts. A future "overall dashboard" can reuse the same `excludeFromStats: false` filter.

#### Offline / pending transactions

Transactions created offline get a temp ID (`pending_…`) and an amber **"Pending"** badge. They are persisted to IndexedDB so they survive page reloads. When the network is restored, `SyncProvider` automatically flushes the sync queue and replaces temp IDs with real server IDs. The service worker handles sync when the tab is closed via the Web BackgroundSync API.

### Auth

NextAuth v4 with credentials provider. **Multi-user app with admin-only account creation** — no public signup. Roles: `"admin"`, `"user"`, `"demo"`.

`ADMIN_EMAIL` and `ADMIN_PASSWORD_HASH` (env vars) are bootstrap credentials for the first login. On bootstrap, `lib/auth.ts` auto-creates the admin `User` row in the DB with `APP_USER_ID` and `role: "admin"`, and seeds default categories for that user. Subsequent logins use the DB record. Session strategy is JWT (maxAge 30 days); `userId`, `role`, and `sessionVersion` are stored in the token and read back via `session.user.userId` / `session.user.role` / `session.user.sessionVersion`.

**Session invalidation:** `getAuthenticatedUserId()` (called by every server action) does an extra `db.user.findUnique` to compare `dbUser.sessionVersion` against the JWT claim. If they differ, it throws `"Unauthorized"`. `changePassword` and `adminResetPassword` both increment `sessionVersion` via `{ increment: 1 }` — the client calls `signOut()` after a successful password change so the user logs in fresh.

**User model** (`prisma/schema.prisma`): `id, email (unique), name, passwordHash, role, sessionVersion, createdAt, updatedAt`. Passwords are bcrypt-hashed (12 rounds).

**New users** get default categories seeded automatically by `_seedDefaultCategories(userId)`, called from both `createUser()` (admin-created users) and the bootstrap path in `lib/auth.ts`.

**Admin user management** (Settings → Users tab, admin only):
- `getUsers()` — lists all users, never returns `passwordHash` (Prisma `select` excludes it)
- `deleteUser(id)` — atomic cascade delete (budgets → recurringTransactions → categories → transactions → user); guards: no self-delete, no last-admin delete
- `updateUser(id, data)` — change name or role; guards: no last-admin demotion
- `adminResetPassword(id, newPassword)` — bcrypt-hashes and updates without old password; increments `sessionVersion`
- All admin actions call `requireAdmin()` (private helper): session check + `role === "admin"` check

`proxy.ts` protects all routes except `/login`, `/api/auth/**`, and static assets. The user ID is resolved from the session token via `getAuthenticatedUserId()` — it throws `"Unauthorized"` if the session is absent, the userId is missing, or the sessionVersion is stale. `APP_USER_ID` in `.env` is used in `lib/auth.ts` when constructing the initial admin record at first sign-in.

### Styling

Tailwind with dark mode forced via `class="dark"` on `<html>`. Custom utility classes (`card`, `input-base`, `btn-primary`, `badge`, etc.) are defined in `app/globals.css`.


## Auto-generated signatures
<!-- Updated by gen-context.js -->
# Code signatures

## deps
```
components\recurring\RecurringList.tsx ← RecurringRow, RecurringForm
components\recurring\RecurringRow.tsx ← RecurringForm
components\DashboardContent.tsx ← hooks/useDashboardState, StatCard
```

## app

### app\(dashboard)\dashboard\page.tsx
```
component DashboardPage
props PageProps
```

### app\(dashboard)\layout.tsx
```
component DashboardLayout
```

### app\(dashboard)\settings\loading.tsx
```
component SettingsLoading
```

### app\(dashboard)\settings\page.tsx
```
component SettingsPage
```

### app\(dashboard)\transactions\page.tsx
```
component TransactionsPage
hook useSearchParams
hook useRouter
hook usePathname
hook useSyncContext
hook useRef
hook useState
hook useEffect
hook useCallback
handler onAdd
handler onChange
handler onClick
handler onDelete
handler onUpdate
```

### app\(auth)\login\page.tsx
```
component LoginForm
component LoginPage
hook useRouter
hook useSearchParams
hook useState
hook useTransition
handler onSubmit
handler onChange
```

### app\(dashboard)\dashboard\loading.tsx
```
component DashboardLoading
```

### app\(dashboard)\error.tsx
```
component DashboardError
handler onClick
```

### app\(dashboard)\transactions\loading.tsx
```
component TransactionsLoading
```

### app\api\sync\route.ts
```
export async function POST(req)
```

### app\api\export\route.ts
```
export async function GET(req)
```

### app\global-error.tsx
```
component GlobalError
handler onClick
```

### app\globals.css
```
var --radius
```

### app\layout.tsx
```
component RootLayout
```

### app\not-found.tsx
```
component NotFound
```

### app\page.tsx
```
component RootPage
```

## components

### components\budgets\BudgetManager.tsx
```
component BudgetManager
props BudgetManagerProps
hook useState
hook useEffect
export BudgetManager
handler onClick
handler onChange
```

### components\CategoryCombobox.tsx
```
component CategoryCombobox
props CategoryComboboxProps
hook useState
hook useRef
hook useEffect
hook useDown
export CategoryCombobox
handler onChange
handler onKeyDown
handler onMouseDown
```

### components\CategoryManager.tsx
```
component CategoryManager
component CategoryRow
hook useState
export CategoryManager
handler onDelete
handler onSubmit
handler onChange
handler onStartEdit
handler onSaveEdit
handler onCancelEdit
```

### components\ChangePasswordForm.tsx
```
component ChangePasswordForm
hook useState
export ChangePasswordForm
handler onSubmit
handler onChange
```

### components\DashboardContent.tsx
```
component DashboardContent
props DashboardContentProps
hook useDashboardState
export DashboardContent
handler onTransactionPosted
```

### components\StatCard.tsx
```
component StatCard
export StatCard
```

### components\DemoBanner.tsx
```
component DemoBanner
```

### components\NavBar.tsx
```
component ChevronLeftIcon
component ChevronRightIcon
component NavBar
hook usePathname
hook useSidebar
hook useState
hook useEffect
export NavBar
handler onClick
```

### components\recurring\RecurringForm.tsx
```
component RecurringForm
props RecurringFormProps
hook useState
hook useTransition
hook useEffect
export RecurringForm
handler onSubmit
handler onChange
handler onClick
```

### components\TransactionList.tsx
```
component LabelBadge
component LabelEditor
component TransactionRow
component TransactionList
props TransactionListProps
hook useState
hook useRef
hook useSyncContext
hook useEffect
export TransactionList
handler onClick
handler onChange
handler onKeyDown
handler onDelete
handler onUpdate
```

### components\budgets\BudgetProgress.tsx
```
component BudgetProgress
props BudgetProgressProps
export BudgetProgress
```

### components\charts\SpendingPieChart.tsx
```
component CustomTooltip
component CustomLegend
component SpendingPieChart
props SpendingPieChartProps
export SpendingPieChart
```

### components\charts\TrendChart.tsx
```
component CustomTooltip
component TrendChart
props TrendChartProps
export TrendChart
```

### components\ExpenseInput.tsx
```
component ExpenseInput
component TypeToggle
props ExpenseInputProps
hook useState
hook useRef
hook useSyncContext
export AddedTx
export ExpenseInput
handler onChange
handler onKeyDown
handler onClick
```

### components\MainWrapper.tsx
```
component MainWrapper
hook useSidebar
export MainWrapper
```

### components\MonthSelector.tsx
```
component MonthSelector
props MonthSelectorProps
hook useRouter
hook usePathname
export MonthSelector
```

### components\Providers.tsx
```
component Providers
export Providers
```

### components\QuickAddSheet.tsx
```
component QuickAddSheet
props QuickAddSheetProps
export QuickAddSheet
handler onClick
handler onAdd
handler onReplace
handler onRemove
```

### components\recurring\RecurringList.tsx
```
component RecurringList
props RecurringListProps
hook useState
hook useEffect
export RecurringList
handler onPosted
handler onSkipped
handler onDeleted
handler onRestored
handler onDeleteError
handler onUpdated
handler onTransactionPosted
handler onSave
```

### components\recurring\RecurringRow.tsx
```
component RecurringRow
props RecurringRowProps
hook useState
export RecurringRow
handler onSave
handler onClick
```

### components\SpendingInsights.tsx
```
component SpendingInsights
props SpendingInsightsProps
export SpendingInsights
```

### components\SyncStatusBar.tsx
```
component SyncStatusBar
hook useSyncContext
hook useState
hook useRef
hook useEffect
export SyncStatusBar
handler onClick
```

### components\TopLoadingBar.tsx
```
component TopLoadingBar
hook usePathname
hook useState
hook useEffect
export TopLoadingBar
```

### components\UserManager.tsx
```
component UserManager
interface UserRecord
props UserManagerProps
hook useState
export UserManager
export UserRecord
handler handleCreate
handler handleDelete
handler handleResetPassword
```

### components\SettingsTabs.tsx
```
component SettingsTabs
props SettingsTabsProps
hook useState
export SettingsTabs
```

## context

### context\SyncProvider.tsx
```
component SyncProvider
hook useSyncContext
hook useContext
hook useSession
hook useRouter
hook useState
hook useRef
hook useCallback
hook useEffect
export SyncProvider
```

### context\SidebarContext.tsx
```
component SidebarProvider
hook useState
hook useEffect
hook useContext
export SidebarProvider
```

## e2e

### e2e\helpers.ts
```
export function amountMasks(page) → Locator[]
export async function waitForReady(page) → Promise<void>
```

## hooks

### hooks\useDashboardState.ts
```
export function useDashboardState(props) → { categoryData, dailyData, budgets, showBudgetManager, setShowBudgetManager, sheetOpen, setSheetOpen, showRecurring, setShowRecurring, topCategory, dueCount, fixedAvailableCash, mergedTransactions, recentTransactions, recentCategories, displayIncome, displayExpenses, displayBalance, dailySpend, isCurrentMonth, expenseDelta, incomeDelta, handleAdd, handleReplace, handleDelete, handleUpdate }
```

### hooks\useOnlineStatus.ts
```
export function useOnlineStatus() → boolean
```

## lib

### lib\actions.ts
```
export async function addTransaction(data)
export async function updateTransaction(id, data)
export async function deleteTransaction(id)
export async function getTransactionIds() → Promise<string[]>
export async function getDashboardData(month, year)
export async function getTransactions(filters) → Promise<
export const getCategories (React.cache'd)
export async function addCategory(data)
export async function updateCategory(id, data)
export async function deleteCategory(id)
export async function addDefaultCategories()
export async function getRecurringTransactions()
export async function createRecurringTransaction(data)
export async function updateRecurringTransaction(id, data)
export async function deleteRecurringTransaction(id)
export async function postRecurringTransaction(id)
export async function getBudgets()
export async function upsertBudget(data)
export async function deleteBudget(id)
export async function skipRecurringTransaction(id)
export async function changePassword(currentPassword, newPassword) → Promise<
export async function createUser(data) → Promise<
export async function getSessionRole() → Promise<string>
export async function getUsers()
export async function deleteUser(id) → Promise<void>
export async function updateUser(id, data) → Promise<
export async function adminResetPassword(id, newPassword) → Promise<
```

### lib\db-adapter.ts
```
export const IS_SQLITE: boolean
export function parseLabels(val) → string[]
export function encodeLabels(labels) → unknown
export function normalizeTx(tx) → object
export function getLabelFilter(label?) → Record<string, unknown>
export async function getDailyRows(userId, start, end) → Promise<Array<...>>
```

### lib\validation.ts
```
export const transactionSchema
export const categorySchema
export const budgetSchema
export const recurringSchema
export const passwordSchema
```

### lib\idb.ts
```
export interface LocalTransaction
  id: string
  userId: string
  category: string
  amount: number
  type: "income" | "expense"
  note?: string
  labels: string[]
  date: string
export interface QueuedOp
  queueId?: number
  op: "add" | "update" | "delete"
  tempId: string
  payload: Record<string, unknown>
  createdAt: string
  retryCount?: number
export async function putTransaction(tx) → Promise<void>
export async function patchTransaction(id, patch) → Promise<void>
export async function getTransactionsByMonth(userId, month, year) → Promise<LocalTransaction[]>
export async function getTransactionFromIDB(id) → Promise<LocalTransaction | und
export async function deleteTransactionFromIDB(id) → Promise<void>
export async function replaceTempId(tempId, realId, serverPatch) → Promise<void>
export async function enqueueOp(op, "queueId">) → Promise<void>
export async function getAllQueuedOps() → Promise<QueuedOp[]>
export async function deleteQueuedOp(queueId) → Promise<void>
export async function updateQueuedOp(op) → Promise<void>
```

### lib\parser.ts
```
export interface ParsedExpense
  category: string
  amount: number
  type: "income" | "expense"
  note?: string
  labels: string[]
export function parseExpenseInput(input) → ParsedExpense | null
```

### lib\sync.ts
```
export async function drainQueue() → Promise<
export async function applyLocalMutation(op, data) → Promise<
export async function reconcileAfterSync(userId) → Promise<number>
```

### lib\utils.ts
```
export const DEFAULT_CATEGORIES (server-side use only)
export type RecurringFrequency
export function cn(...inputs)
export function formatCurrency(amount) → string
export function getNextDueDate(frequency, startDate, lastRun) → Date
export function getRecurringStatus(nextDue, endDate) → "upcoming" | "due" | "overdue"
export function isPostedThisPeriod(frequency, lastRun) → boolean
export function toMonthlyAmount(frequency, amount) → number
export function countRemainingPayments(frequency, nextDue, endDate) → number
export function formatDate(date) → string
export function formatDateShort(date) → string
export function getMonthName(month) → string
export function getCurrentMonthYear()
export function getPrevMonth(month, year)
export function getNextMonth(month, year)
export function stringToColor(str) → string
```

## types

### types\index.ts
```
export interface Transaction
export interface CategoryData
export interface DailyData
export interface RecurringTransaction
export interface Budget
export interface CategoryOption
```
