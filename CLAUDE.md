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
npm run test         # Run unit tests (Vitest)
npm run test:watch   # Unit tests in watch mode
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
| `e2e/dashboard.spec.ts` | Full page, stat cards, quick-add, transaction list, recurring section, due-week card, navigation, category donut, pace chart (fixed past month), privacy mode (blur toggle snapshot, fixed past month, tablet/desktop), past-month read-only view (badge + absence of edit affordances + month-scoped view-all link), wealth curve (all-time), quick-add category chips (non-snapshot: most-used group leads, divider, alphabetical tail, click pre-fills), day-of-week profile (presence only — its bars drift daily, so the year/all-time full-page tests mask the `[data-testid="dow-chart"]` card) |
| `e2e/transactions.spec.ts` | Full page, filter bar, summary strip, transaction list, category filter; functional (non-snapshot): type pill / case-insensitive search / amount range, all-time toggle, undo delete, duplicate detection. The last two create or delete rows and restore the data before finishing. Gotchas: (1) use `scrollIntoViewIfNeeded()` + plain `.click()` on row buttons — a `force: true` click at coordinates behind the fixed mobile bottom nav dispatches to the nav (it once hit Sign out); (2) never assert the summary count with `toContainText("0 transactions")` — it also matches "**3**0 transactions"; use `/\b0 transactions/`; (3) don't assume the default (current-month) view has rows — `prisma/seed.ts` dates everything relative to *seed time*, so the current month empties out a few weeks after seeding. The amount-range test pins `?from=&to=` over the whole span instead |
| `e2e/settings.spec.ts` | Settings page: categories tab, preferences tab (toggle rows), account tab, users tab (admin) |

Tests run at three viewports: **mobile (390px)**, **tablet (768px)**, **desktop (1280px)**.

### Snapshot stability

Snapshots live in `e2e/snapshots/<project>/<spec>/<test>.png` and are committed to git.

- **Currency amounts** are masked via `.tabular-nums` — they never break the snapshot.
- **Dates and category names** appear in snapshots. Update baselines with `npm run test:ui:update` if data changes substantially.
- **Pace chart** — the current month's cumulative line ends at *today*, so its plot changes daily. The month full-page test masks the whole `[data-testid="pace-chart"]` card; the dedicated pace/donut tests navigate to a fixed past month (historical data is stable).

### One-time setup required

Add to `.env.local` (same credentials used to log in to the app):
```
TEST_EMAIL=<same value as ADMIN_EMAIL>
TEST_PASSWORD=<your plaintext login password>
```

Then generate initial snapshots: `npm run test:ui:update`

## Unit Testing

Vitest covers the pure logic in `lib/parser.ts`, `lib/math-eval.ts`, `lib/utils.ts`, `lib/sync.ts`,
`lib/duplicates.ts`, and the search helpers in `lib/db-adapter.ts` — files with no
Playwright coverage since the visual suite doesn't assert behavior. Tests live alongside their source
as `lib/*.test.ts` (distinct from Playwright's `e2e/*.spec.ts`, so `vitest.config.ts` scopes
`test.include` to `lib/**/*.test.ts` and the two runners never collide). Config: `vitest.config.ts`
(root), default environment `"node"`.

`lib/sync.test.ts` is the one with real setup cost, since `lib/sync.ts` drives `lib/idb.ts`
(IndexedDB) and calls `@/lib/actions` (Prisma/`next/cache` — must never load in a test process):
- A `// @vitest-environment jsdom` docblock at the top of the file opts just that file into jsdom,
  because `lib/idb.ts`'s `getDB()` guards on `typeof window === "undefined"`.
- `@/lib/actions` is fully mocked via `vi.mock("@/lib/actions", () => ({ getTransactionIds: vi.fn() }))`.
- `lib/idb.ts` caches its DB connection in a module-level singleton, so per-test isolation needs
  **both** a fresh IndexedDB backend (`vi.stubGlobal("indexedDB", new FDBFactory())` from
  `fake-indexeddb/lib/FDBFactory`) **and** a fresh module instance (`vi.resetModules()` before
  re-importing `@/lib/sync`/`@/lib/idb`) — resetting only one leaks state across tests.

`lib/db-adapter.test.ts` mocks `@/lib/db` (`vi.mock("@/lib/db", () => ({ db: {} }))` — importing the
real module eagerly constructs a Prisma client) and, because `IS_SQLITE` is computed from
`DATABASE_URL` at module load, re-imports the adapter per dialect via `vi.resetModules()` +
`vi.stubEnv("DATABASE_URL", …)`.

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

**Stack:** Next.js 16 App Router · React 19 · Prisma 7 (PostgreSQL/Supabase via `@prisma/adapter-pg`, or SQLite via `@prisma/adapter-better-sqlite3`) · NextAuth v4 · SWR 2 · Recharts · Tailwind CSS 4 · `lucide-react` (icons) · IndexedDB (`idb@8`) · `bcryptjs` (password hashing) · `zod` (input validation) · `clsx` + `tailwind-merge` (`cn()` helper)

### Data flow

All mutations go through `lib/actions.ts` (`"use server"` file). Every transaction mutation calls `revalidatePath("/dashboard")` and `revalidatePath("/transactions")` — **not** `revalidatePath("/")`, because the root page is just a redirect and revalidating it triggers an unwanted navigation cycle.

The dashboard uses a **hybrid render pattern**:
1. `app/(dashboard)/dashboard/page.tsx` is a server component — reads `?month=&year=` search params (defaults to current month), then fetches `getDashboardData(month, year)`, `getDashboardData(prevMonth, prevYear)`, and `getRecurringTransactions()` in parallel, passing results as `initial*` props.
2. `DashboardContent` is a thin client orchestrator — it calls `useDashboardState(props)` and renders pure JSX. All state, effects, memos, and mutation handlers live in `hooks/useDashboardState.ts`.
3. After a mutation completes, the handlers in `useDashboardState` update all affected state slices (`transactions`, `totalIncome`, `totalExpenses`, `categoryData`, `dailyData`) so the UI reflects changes without waiting for a server re-render.

Props passed to `DashboardContent`: `initialTransactions`, `initialTotalIncome`, `initialTotalExpenses`, `initialCategoryData`, `initialDailyData`, `initialTopCategory`, `initialRecurring`, `initialBudgets`, `initialCategories`, `initialFrequentCategories` (90-day most-used expense categories — leads the quick-add chip row), `month`, `year`, `prevTotalExpenses`, `prevTotalIncome`, `prevCategoryData`, `prevDailyData` (prev period's daily buckets — consumed by `PaceChart`; empty array in the all-time view), `initialWealthData` (ledger-basis monthly buckets — populated in the year and all-time views, empty array in month view; feeds `WealthCurve` and the off-chart overlay on `MonthlyBarChart`).

The transactions page (`/transactions`) is a **fully client-side** page. It fetches data via the `getTransactions` server action through **SWR**, keyed by a serialized filter object (`month`, `year`, `category`, `label`, `q`, `type`, `min`, `max`, `from`, `to`) — re-visiting a previously-seen filter returns cached data instantly while revalidating in the background. SWR results are copied into local state via an effect on `data` — NOT `onSuccess`, because returning to a cached key (e.g. Clear all inside SWR's 2s dedupe window) never fires `onSuccess` and would leave the list stale. Cursor-based "Load more" pagination appends pages outside SWR; categories and budgets are fetched once on mount. A drop in `pendingCount` (sync completed) triggers a silent `mutate()` to clear "Pending" badges. The page's quick-add wires `onReplace`/`onRemove` so the optimistic temp id is swapped for the real server id when the background add resolves — without this, fresh rows keep their temp id (and "Pending" badge) and editing/deleting them 404s server-side.

**Historical note (fixed in React 19):** Prior to the React 19 upgrade, `startTransition(async fn)` did not reliably track async transitions, so this codebase used a manual `useState` loading flag instead (still present in several components — see `ChangePasswordForm.tsx`, `BudgetManager.tsx`, `CategoryManager.tsx`, `ExpenseInput.tsx`, `TransactionList.tsx`, `app/(dashboard)/transactions/page.tsx`, `UserManager.tsx`, `SyncProvider.tsx`, `RecurringRow.tsx`). React 19 tracks async transitions correctly, so `login/page.tsx` and `RecurringForm.tsx` now use `startTransition(async fn)` safely; the `useState`-flag components were left as-is (not strictly necessary anymore, but harmless) to avoid unrelated scope creep in the upgrade.

### Offline-first & background sync

The app is offline-capable. Mutations made without network connectivity are queued to IndexedDB and flushed when connectivity is restored.

**Layers:**

1. **`lib/idb.ts`** — singleton IndexedDB wrapper (`idb` library). Two stores (DB version 2):
   - `transactions` — local mirror of server records plus pending items. Each record has `syncStatus: "synced" | "pending" | "pending-update" | "pending-delete"`.
   - `syncQueue` — ordered queue of pending mutations (`op: "add" | "update" | "delete"`, autoIncrement `queueId` preserves causal order). Each entry has an optional `retryCount` for failure tracking and `nextRetryAt` (epoch ms) as the exponential-backoff gate.
   - Never pass a DB handle around — all exported functions lazy-open the singleton internally.

2. **`lib/sync.ts`** — pure client-side logic (no React):
   - `applyLocalMutation(op, data)` — writes to IDB + enqueues when offline. For `add`, generates a `pending_${timestamp}_${random}` temp ID. For pending-adds that are subsequently edited, updates the queue entry in-place rather than adding a second UPDATE op.
   - `drainQueue(options?)` — processes `syncQueue` in insertion order, POST-ing each op to `/api/sync`. Drops ops that have hit `MAX_RETRIES = 5`. On failure sets `nextRetryAt` (exponential backoff: 30s → 1m → 2m → 4m → 8m, `BASE_RETRY_DELAY_MS` kept in sync with `public/sw.js`); a drain stops when it reaches an op still inside its backoff window, unless `{ force: true }` (user-initiated retry). On `add` success, calls `replaceTempId` to swap the temp ID for the real server ID (atomic IDB transaction that also remaps any subsequent queue entries referencing the old temp ID). Stops on first failure to preserve ordering.
   - `seedIDBFromServer(transactions, userId)` — upserts server data into IDB as `synced`; never overwrites pending records.
   - `reconcileAfterSync(userId)` — calls `getTransactionIds()` (server action) then `reconcileWithServer()` (IDB) to delete any local IDB records whose IDs no longer exist on the server. Called by `SyncProvider` on first load when online.

3. **`app/api/sync/route.ts`** — `POST /api/sync`. REST endpoint used by the service worker (which cannot call server actions). Accepts `{ op, id?, payload? }`, validates the session cookie (incl. the `sessionVersion` check), and applies the same ownership checks as `lib/actions.ts`. Add/update payloads are validated with `transactionSchema` / `transactionSchema.partial()` — the same schemas the server actions use, so the offline path is not a weaker back door. Returns `{ success: true, id? }`. For `add` ops uses upsert on `clientId` (the temp ID) to safely deduplicate retries; because `clientId` is globally unique (not per-user), the route returns **409** if the upsert matches a row owned by another user (prevents a replayed `clientId` from leaking another user's transaction id or silently dropping the caller's add). The update path keys each column write off presence in the **raw** payload — Zod `.partial()` still materializes `.default()` values for absent keys, so reading from the parsed result would clobber `labels`/`excludedBudgetIds`/`excludeFromStats`. Rate-limited at 300/min per user (see `lib/rate-limit.ts`).

4. **`context/SyncProvider.tsx`** — React context wrapping the whole app (inside `SessionProvider`). Exposes `{ isOnline, pendingCount, failedCount, isSyncing, reconcileCount, syncNow, refreshPendingCount, userId }` (`failedCount` = local records carrying a `syncError`; `reconcileCount` bumps whenever a reconcile purges stale IDB records — consumers that merge IDB rows into React state re-read on change). Registers `/sw.js`, listens for `online`/`offline` events, auto-calls `syncNow({ force: true })` on reconnect (`force` bypasses the retry-backoff window — also used by SyncStatusBar's Retry/Sync now buttons). Registers the `"expense-sync"` BackgroundSync tag whenever `pendingCount > 0`.

5. **`public/sw.js`** — service worker (plain JS, no bundler):
   - Cache-first for `/_next/static/**` and `/icons/**`.
   - Network-first with cache fallback for page navigations.
   - `sync` event handler (`"expense-sync"`) drains `syncQueue` from IDB via raw cursor API and POSTs each op to `/api/sync`. Honours the same `nextRetryAt` backoff gate as `lib/sync.ts`, and rejects the event's `waitUntil` when ops remain so the browser reschedules the sync with its own backoff.

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

When `DATABASE_URL=file:./dev.db` is set, the app targets `prisma/schema.sqlite.prisma` instead of the PostgreSQL schema. SQLite does not support native array columns, so array fields (`labels`, `excludedBudgetIds`, and Budget's `excludedCategories`/`labels`) are stored as JSON strings. All DB-dialect branching is centralised in `lib/db-adapter.ts`: `IS_SQLITE`, `parseLabels`/`encodeLabels` (transaction arrays), `parseBudgetArray`/`encodeBudgetArray` + `normalizeBudget` (budget arrays), `normalizeTx` (parses `labels`/`excludedBudgetIds` and coerces `excludeFromStats` to a boolean), `getLabelFilter` (returns empty for SQLite — callers do JS-side filtering), and `getTrendRows`/`getDailyRows` (different raw SQL per dialect; filters out `excludeFromStats` rows unless `includeOffChart` is passed — the ledger-basis variant used for the wealth curve). `lib/actions.ts` imports from `lib/db-adapter.ts` rather than inlining these helpers. Note: `excludeFromStats` is a real `Boolean` column (not a JSON array), so it is filterable directly in SQL on both dialects.

### Currency

All amounts are displayed in Malaysian Ringgit. `formatCurrency(amount)` in `lib/utils.ts` outputs `RM1,234.56` using the `ms-MY` locale. The `currency` parameter was removed — everything is MYR. The parser already strips the `rm` prefix from input tokens.

### Key files

| File | Role |
|------|------|
| `types/index.ts` | Shared TypeScript interfaces: `Transaction`, `CategoryData`, `DailyData`, `RecurringTransaction`, `Budget`, `CategoryOption`. Import from here — do not redeclare locally. |
| `lib/actions.ts` | All server actions (CRUD + data fetch). Single source of truth for DB access. All mutations are Zod-validated via `lib/validation.ts`. Exports: `addTransaction`, `updateTransaction`, `deleteTransaction`, `getTransactionIds`, `getDashboardData`, `getTransactions`, `getFrequentCategories`, `getCategories`, `addCategory`, `updateCategory`, `deleteCategory`, `addDefaultCategories`, `getRecurringTransactions`, `createRecurringTransaction`, `updateRecurringTransaction`, `deleteRecurringTransaction`, `postRecurringTransaction`, `skipRecurringTransaction`, `backfillRecurringTransaction`, `getBudgets`, `saveBudget`, `deleteBudget`, `changePassword`, `createUser`, `getSessionRole`, `getUsers`, `deleteUser`, `updateUser`, `adminResetPassword`. |
| `lib/db-adapter.ts` | DB-dialect abstraction: `IS_SQLITE`, `parseLabels`, `encodeLabels`, `parseBudgetArray`, `encodeBudgetArray`, `normalizeTx` (transactions, incl. `excludeFromStats`), `normalizeBudget`, `getLabelFilter`, `getSearchFilter` (multi-field case-insensitive `q` OR-clause: note/category substring, exact label, exact amount; `{}` on SQLite), `matchesSearch` (the JS-side SQLite mirror of `getSearchFilter`), `parseAmountQuery` (strips `rm` prefix + commas), `getTrendRows` (optional `includeOffChart` for the ledger-basis wealth series), `getDailyRows`. Keeps all SQLite/Postgres branching out of `actions.ts`. |
| `lib/duplicates.ts` | Pure duplicate-detection logic (feature 22): module-level `recentAdds` registry (`recordAdd`/`clearRecentAdds` — fed by quick-add commits, since `createdAt` isn't in the client Transaction shape), `findRecentDuplicate` (60s same amount+category window), `hasSameDayDuplicate` (passive hint), `groupPossibleDuplicates` (key: local day\|amount\|category, notes ignored). |
| `lib/validation.ts` | Zod schemas: `transactionSchema`, `categorySchema`, `budgetSchema`, `recurringSchema`, `recurringUpdateSchema` (partial variant used by `updateRecurringTransaction`), `passwordSchema`, `roleSchema` (`"admin"\|"user"\|"demo"` enum). Applied at the top of every mutation in `actions.ts`. All string/array fields carry `max()` length caps so oversized values can't reach the DB. |
| `lib/rate-limit.ts` | Fixed-window in-memory rate limiter (`rateLimit(key, { limit, windowMs })`). Per server instance (a brute-force speed bump, not a hard distributed quota — back with Redis for that). Applied to login (10/15min per email), `/api/sync` (300/min), `/api/export` (20/min), `changePassword` (5/15min). |
| `lib/idb.ts` | IndexedDB singleton (DB version 2): `transactions` and `syncQueue` stores. Typed with `idb@8`. `LocalTransaction` mirrors the server record incl. `labels`, `excludedBudgetIds`, and `excludeFromStats`. `QueuedOp` has `retryCount?: number`. Key exports: `putTransaction`, `patchTransaction`, `getTransactionsByMonth`, `getTransactionFromIDB`, `deleteTransactionFromIDB`, `replaceTempId`, `enqueueOp`, `getAllQueuedOps`, `deleteQueuedOp`, `updateQueuedOp`, `getPendingCount`, `getFailedSyncCount`, `seedIDBFromServer`, `reconcileWithServer`. |
| `lib/sync.ts` | Offline mutation logic: `applyLocalMutation`, `drainQueue` (MAX_RETRIES=5, increments retryCount on failure), `seedIDBFromServer`, `reconcileAfterSync`, `clearLocalDataForSignOut` (wipes the IDB mirror + all Cache Storage on sign-out, best-effort). |
| `lib/parser.ts` | Parses natural-language input into `{category, amount, type, note, labels}`. Type inferred from `INCOME_KEYWORDS`. Labels parsed from `#tag` tokens (e.g. `food 20 #date`). The amount may be an arithmetic expression with no internal spaces (`lunch 84.60/3+12.50`), evaluated via `lib/math-eval.ts`; mixed tokens (`2-in-1`) stay on the plain-number path. |
| `lib/math-eval.ts` | `evaluateExpression(expr)` — strict whitelist arithmetic evaluator (`+ - * /`, parens, unary minus; recursive descent, never `eval`). Returns `null` on syntax errors/division-by-zero/non-finite; rounds to 2dp; 64-char and 8-depth caps. Sign policy (rejecting ≤ 0) belongs to the caller. Also exports `evaluateAmountInput` (strips whitespace/commas, then evaluates — plain numbers pass through) and `normalizeAmountOnBlur` (expression → evaluated string, plain/invalid input untouched), used by the amount fields in the `TransactionList` edit form, `RecurringForm`, and `BudgetManager` (all `type="text" inputMode="decimal"`, evaluated on blur and at submit). |
| `lib/utils.ts` | `cn`, `formatCurrency`, `formatDate`, `formatDateShort`, `getMonthName`, `getCurrentMonthYear`, `getPrevMonth`, `getNextMonth`, `getNextDueDate`, `getRecurringStatus`, `isPostedThisPeriod`, `toMonthlyAmount`, `countRemainingPayments`, `countMissedPeriods` (+ `MAX_BACKFILL`, kept in sync with the server cap), `rankCategoriesByUsage` (expense categories by use count, ties on recency — powers the quick-add chip order), `stringToColor`. Also exports `DEFAULT_CATEGORIES` (used server-side only — do not import in client components to avoid Turbopack module boundary conflicts). |
| `lib/auth.ts` | NextAuth config. JWT callback stores `sessionVersion` alongside `userId`/`role`. Bootstrap path seeds default categories for the admin user on first login. Login is rate-limited (10/15min per email, before any bcrypt work) and equalizes response timing — unknown-email paths run a dummy `bcrypt.compare` against a throwaway hash so a miss costs the same as a hit (no user enumeration). |
| `context/SyncProvider.tsx` | React context: online state, pending count, failed count, sync trigger, SW registration. Exposes `{ isOnline, pendingCount, failedCount, isSyncing, reconcileCount, syncNow, refreshPendingCount, userId }` (`syncNow(opts?)` accepts `{ force?: boolean }` to bypass retry backoff). Runs `reconcileAfterSync` on first load while online and bumps `reconcileCount` when it purges records. Must be inside `SessionProvider`. |
| `context/ToastContext.tsx` | Global toast system (no external dependency). `useToast().showToast(message, type?, action?)` — types `"success" \| "error" \| "info"`, optional `action: { label, onClick }` renders an inline button (e.g. Undo) that runs then dismisses, max 3 visible, 5s auto-dismiss, manual dismiss, `role="alert"` for errors. Container renders above the mobile bottom nav. Mounted in `Providers` (above `SyncProvider`). Used for mutation failures that inline errors can't reach (e.g. background add failure after `QuickAddSheet` closes, delete-failed-restored) and the undo-delete toast. |
| `context/PreferencesContext.tsx` | Device-level preferences, one localStorage JSON key (`app-preferences`), cross-tab synced via the `storage` event. Exposes `{ privacyFeatureEnabled, isPrivate, undoDeleteEnabled, togglePrivate, setPreference }`. `isPrivate` is already gated on `privacyFeatureEnabled`; an effect toggles `data-private` on `<html>` (the CSS blur hook). Mounted in `Providers` inside `ToastProvider`. |
| `hooks/useDashboardState.ts` | All dashboard state, effects, memos, and handlers extracted from `DashboardContent`. Returns everything the JSX needs including `handleAdd`, `handleReplace`, `handleDelete`, `handleUpdate`. |
| `hooks/useOnlineStatus.ts` | Thin hook: `navigator.onLine` + `online`/`offline` events. |
| `hooks/useDialogBehavior.ts` | Shared modal/sheet behavior built on native `<dialog>`/`showModal()`: real focus trap (top layer + inert page), Escape via the `cancel` event (intercepted so exit animations play), body scroll lock, focus-on-open/restore-on-close. Attach its ref to a `<dialog>` styled with the `dialog-shell` utility (see `BudgetManager` / `QuickAddSheet`) — native semantics replace `role="dialog"`/`aria-modal`. Keep the element mounted through the exit animation (key the hook off `mounted`, not `visible`). |
| `app/api/sync/route.ts` | REST endpoint for SW background sync. Mirrors `lib/actions.ts` ownership checks; validates payloads with `transactionSchema`. Uses upsert on `clientId` for add-op deduplication, with a 409 guard against cross-user `clientId` collisions. Rate-limited per user. |
| `app/api/export/route.ts` | GET endpoint for CSV export. Accepts `month`, `year`, `category`, `label`, `q`, `from`, `to` query params (validated — 400 on malformed values). Returns `text/csv` attachment scoped to the authenticated user. Cells beginning with `= + - @` (or tab/CR) are apostrophe-prefixed to neutralize spreadsheet formula injection. Rate-limited (20/min). |
| `public/sw.js` | Service worker: static caching + BackgroundSync drain. Plain JS, raw IDB cursor API. |
| `components/DashboardContent.tsx` | Thin client orchestrator: calls `useDashboardState(props)` and renders JSX. No state or logic lives here directly. |
| `components/StatCard.tsx` | Standalone stat card with gradient background, MoM delta badge, and income/expense/balance colour variants. |
| `components/ExpenseInput.tsx` | Quick-add input with Exp/Inc type toggle pill and a visual category chip row (`categories: CategoryOption[]` prop — icon + colour tint, most-used first via the `frequentCategories` prop, closed off by a divider before the rest of the list; tap pre-fills the category token). Offline-aware: routes to `applyLocalMutation` when offline. Duplicate detection: a same (amount, category) commit within 60s swaps the input row for an amber confirm strip ([Add anyway] re-submits with a bypass flag; Cancel keeps the draft); a same-day match (via the `recentTransactions` prop) lights a passive amber dot on the Add button. Every commit calls `recordAdd`. |
| `components/TransactionList.tsx` | Renders rows with label badges, amber "Pending" badge for unsynced items, and a grey "Off-chart" badge when `excludeFromStats` is set; inline edit/delete are offline-aware, and their online paths write through to the IDB mirror (`patchTransaction` / `deleteTransactionFromIDB` after server success) so other pages can't resurrect stale copies. The inline edit form includes a `LabelEditor`, a `BudgetExcludeSelect` (per-transaction `excludedBudgetIds`, expenses only), and an "Exclude from charts" checkbox (`excludeFromStats`, all types). Delete uses an inline two-step confirm (no native `confirm()`) and shows a spinner while in-flight; after a successful delete (and `undoDeleteEnabled`), an Undo toast re-creates the stashed record via `addTransaction`/`applyLocalMutation("add")` (new id; re-enters through `onUndone` → `reinsertRow` → parent `onRestore`). Edit form dims (`opacity-50`) while saving. `CategoryCombobox` receives `CategoryOption[]` for icon display. |
| `components/CategoryCombobox.tsx` | Searchable category dropdown. Accepts `categories: CategoryOption[]` — renders icon alongside name. Has "Use …" option for free-text entry. |
| `components/CategoryManager.tsx` | Settings category list with inline edit mode for custom categories (name + icon + colour picker). Default categories show a "Default" badge; custom categories show pencil + delete icons. |
| `components/budgets/BudgetManager.tsx` | Dashboard modal to create/edit/delete budgets. Supports the four `budgetType`s (overall / category / excluded / label). Dynamically imported. |
| `components/budgets/BudgetProgress.tsx` | Progress bar with "RM X.XX remaining" / "RM X.XX over budget" label below the bar. |
| `components/SyncStatusBar.tsx` | Offline/syncing status indicator. |
| `components/MonthSelector.tsx` | Month/year navigation control used on the dashboard. |
| `components/SpendingInsights.tsx` | Spending pace/burn-rate analysis card. |
| `components/QuickAddSheet.tsx` | Bottom-sheet wrapper for `ExpenseInput` on mobile. |
| `components/NavBar.tsx` | Navigation shell: fixed desktop sidebar (collapsible, width synced via `SidebarContext`) + fixed mobile bottom nav with safe-area padding. Lucide icons. Hosts the privacy-mode eye toggle (sidebar footer + a 5th bottom-nav slot), rendered only while `privacyFeatureEnabled`. |
| `components/Providers.tsx` | Composes `SessionProvider` + `ToastProvider` + `PreferencesProvider` + `SyncProvider` at the app root. |
| `components/PreferencesPanel.tsx` | Settings → Preferences tab: toggle-switch rows for `privacyFeatureEnabled` and `undoDeleteEnabled` (device-level, localStorage-backed via `PreferencesContext`). |
| `components/charts/TrendChart.tsx` | Daily income/expense area chart (Recharts). |
| `components/charts/PaceChart.tsx` | Month-view cumulative spend vs last month's curve vs an even-pace line to the month's cap (an `overall` budget, else an `excluded`-type budget's amount; category/label budgets never draw the line). Spend is chart-basis, consistent with `SpendingInsights`. Consumes `dailyData` (optimistically patched) + `prevDailyData` prop. In the current month the spend line stops at today — e2e masks the whole card in the month full-page snapshot; the dedicated test uses a fixed past month. Lazy-loaded. |
| `components/charts/SpendingPieChart.tsx` | Month-view donut of top-6 categories + "Other" using stored category colours (fallback `stringToColor`). HTML centre total (`tabular-nums`, maskable). Slice/legend click → `/transactions?month=&year=&category=X`. Lazy-loaded. |
| `components/charts/WealthCurve.tsx` | All-time hero chart (`?period=all` only): running net balance over the monthly buckets. **Ledger basis** — consumes the dedicated `initialWealthData` series (includes off-chart transactions, since cumulative net balance must reflect every real money movement); headline derives from the plotted points so it matches the curve endpoint. Lazy-loaded. |
| `components/charts/DayOfWeekChart.tsx` | Year/all-time views: Mon–Sun average-expense bars (weekday total ÷ calendar occurrences of that weekday between range start and today). Chart basis; computed client-side from the range transactions (bounded to the 500 most recent). Lazy-loaded. |
| `components/recurring/RecurringList.tsx` | Client component owning recurring state. Syncs from `initialRecurring` via `useEffect`. |
| `components/recurring/RecurringRow.tsx` | Individual recurring row: status badge, Post/Skip/Backfill/Edit/Duplicate/Delete. "Backfill N" (two-step confirm) appears when a rule is ≥2 periods behind; Duplicate opens a create-mode `RecurringForm` prefilled from the rule. Uses plain async/await (not startTransition). |
| `components/recurring/RecurringForm.tsx` | Create/edit form for recurring rules. Passes `CategoryOption[]` to `CategoryCombobox`. |
| `components/DashboardErrorBoundary.tsx` | Error boundary isolating IDB/render failures. Page-level (no props) shows a full-height fallback; with a `section` prop it renders a compact card fallback — `DashboardContent` wraps each section (quick add, recurring, insights, trend chart, monthly chart, budgets, recent transactions) individually. |
| `components/UserManager.tsx` | Admin-only client component: user list (avatar, role badge, inline reset-password expand) + create form. Exports `UserRecord` interface. |
| `components/SettingsTabs.tsx` | Client component wrapping all settings sections in a tab bar (Users / Categories / Preferences / Account). Admins default to Users tab; non-admins default to Categories tab. |
| `prisma/schema.prisma` | Five models: `User`, `Transaction`, `Category`, `Budget`, `RecurringTransaction`. |
| `prisma/schema.sqlite.prisma` | SQLite-compatible variant of the schema (used when `DATABASE_URL` is set). |

### Schema overview

**User** — `id, email String @unique, name, passwordHash, role String ("admin"\|"user"\|"demo"), sessionVersion Int @default(1), createdAt, updatedAt`
- `sessionVersion` is incremented by `changePassword` and `adminResetPassword`. `getAuthenticatedUserId()` compares this DB value against the JWT claim — a mismatch throws `"Unauthorized"`, invalidating stale tokens. After a password change the client calls `signOut()` so the user re-authenticates with a fresh token.
- No FK relations to other models — cascade deletes must be done manually in `deleteUser()` using `db.$transaction`.

**Transaction** — `id, clientId String? @unique, userId, amount Float, category, note?, date, type String ("income"\|"expense"), labels String[] @default([]), excludedBudgetIds String[] @default([]), excludeFromStats Boolean @default(false), createdAt, updatedAt`
- `clientId` stores the offline temp ID (`pending_…`) and is used by `/api/sync` to upsert offline-add ops idempotently, preventing duplicates on retry.
- `excludedBudgetIds` — budget IDs this transaction is excluded from (per-transaction budget opt-out; filtered client-side in `useDashboardState`).
- `excludeFromStats` — when `true`, the transaction is dropped from the dashboard's pattern stats (category breakdown, daily trend, pace chart, Daily Avg / Avg Spend/mo, spending mix) but **still counts** in the accounting stats (Income/Expense/Balance totals, savings rate, wealth curve). See "Exclude from charts" under Features.
- On SQLite, `labels` and `excludedBudgetIds` are JSON strings; `excludeFromStats` is a native `Boolean`.

**RecurringTransaction** — `id, userId, name, category, amount, type, frequency ("daily"\|"weekly"\|"monthly"\|"yearly"), startDate, endDate?, lastRun?, isActive, note?, createdAt, updatedAt`

**Category** — `id, userId, name, icon, color, isDefault, createdAt`

**Budget** — `id, userId, name @default("Budget"), amount Float, period @default("monthly"), budgetType ("overall"\|"category"\|"excluded"\|"label"), category?, excludedCategories String[] @default([]), labels String[] @default([]), createdAt, updatedAt`. Unique on `[userId, name]`. On SQLite, `excludedCategories`/`labels` are JSON strings (handled by `normalizeBudget`/`encodeBudgetArray`).

**IndexedDB `transactions` store** — mirrors Transaction fields (incl. `labels`, `excludedBudgetIds`, `excludeFromStats`) plus `syncStatus: "synced"|"pending"|"pending-update"|"pending-delete"`, `syncError?`, and ISO-string dates. Key: `id`.

**IndexedDB `syncQueue` store** — `queueId` (autoIncrement), `op`, `tempId`, `payload`, `createdAt`, `retryCount?`. Key: `queueId`. Ops with `retryCount >= 5` are dropped by `drainQueue` to prevent queue deadlock.

### Features

#### User management (admin only)

Admin users see a **Users** tab in Settings (non-admins see only Categories, Preferences, and Account tabs). The tab UI is owned by `SettingsTabs.tsx`. `UserManager.tsx` renders the user list and create form.

- **Create**: Admin fills name, email, password, role → calls `createUser()` → optimistic update
- **Reset password**: Inline expand per row → calls `adminResetPassword()` — no old password required
- **Delete**: Calls `deleteUser()` with atomic cascade; button disabled for self and last admin
- The settings page fetches `getUsers()` sequentially after `getSessionRole()` to avoid calling it for non-admins

#### Month navigation

The dashboard supports historical month browsing via `?month=&year=` search params (e.g. `?month=3&year=2025`). `MonthSelector` renders prev/next arrows and updates the URL. The server component fetches both the selected month and the previous month (for MoM comparisons on stat cards). `MonthSelector` wraps `router.push` in a transition and dispatches `nav-start` / `nav-end` window events so `TopLoadingBar` stays visible until the new data actually commits (the URL updates optimistically long before).

The Recent Transactions "View all →" link mirrors the viewed period: month view → `/transactions?month=&year=`; year view → `/transactions?from=YYYY-01-01&to=YYYY-12-31`; all-time → `from` = first transaction date, `to` = today. The year/all-time cases use the transactions page's `from`/`to` range mode (there is no year-only mode, and range mode requires **both** params).

**Past months are read-only** (`readOnlyMonth = isMonthView && !isCurrentMonth` in `DashboardContent`): quick-add (input, FAB, sheet), the due-week card, and the recurring section render only on the current month (they're all today-anchored — quick-add always dates to *today*); the budget Manage/Set-up entry points are hidden (budgets are global, editing would retroactively change the historical view); and the recent-transactions list gets `readOnly` (a `TransactionList` prop that hides edit/delete). A "Past month · view only" badge (`data-testid="view-only-badge"`) sits next to the selector. Deliberate historical corrections go through `/transactions`, which stays editable.

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
- **Backfilling**: `backfillRecurringTransaction(id)` creates one `Transaction` per missed period — each dated at its historical due date — and advances `lastRun` to the last one, atomically. Capped at `MAX_BACKFILL = 36` per call. `RecurringRow` shows the button when `countMissedPeriods(...) >= 2`; there is no optimistic transaction patching (the rows carry past dates) — the UI catches up via `revalidatePath`.
- **Duplicating**: Copy icon on the row opens `RecurringForm` in create mode prefilled from the rule (name suffixed " (copy)", start date reset to today, past end dates dropped so the copy isn't created already-ended).
- **Due this week card**: month-view summary card above the recurring section (`data-testid="due-week-card"`, hidden when nothing qualifies) showing the count and expense/income totals of rules due within the next 7 days (overdue included). Computed in the consolidated recurring memo in `useDashboardState` (`dueWeekCount` / `dueWeekExpense` / `dueWeekIncome`); "Review →" expands the recurring list.
- **UI sync**: `RecurringList` uses a `useEffect([initialRecurring])` to sync local state when server data arrives after `revalidatePath`.

#### CSV export

The transactions page has an **Export CSV ↓** button in the filter bar. It calls `GET /api/export` with the current `month`, `year`, `category`, `label`, `q`, `type`, `min`/`max` (amount range), and (when a date range is active) `from`/`to` params. The route returns a `text/csv` attachment (`expenses-YYYY-MM.csv`, or `expenses-<from>-to-<to>.csv` for a date range) with columns: `Date, Category, Type, Amount (RM), Note, Labels`. Up to 10,000 rows are included.

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

A per-transaction **boolean** toggle ("Exclude from charts" checkbox in the inline edit form, all types) that splits every dashboard stat onto one of two bases. Excluded rows show a grey "Off-chart" badge. The deciding rule: **accounting stats** (what happened to my money) use the ledger basis and include everything; **pattern stats** (what does my typical spending look like) use the chart basis and respect the flag.

- **Ledger basis (includes off-chart rows):** Income/Expense/Net stat cards + MoM deltas, savings rate, Today's Spend (current month), the **wealth curve** (cumulative net balance — excluding a row would offset the curve permanently), the transactions page, and CSV export.
- **Chart basis (respects the flag):** category breakdown (pie chart, "Top spend", `SpendingInsights`), daily trend chart, pace chart, **Daily Avg** (past-month view), **Avg Spend/mo** (all-time view), and the **spending mix** discretionary side. The latter three derive from `chartExpenses` in `useDashboardState` (sum of the already-filtered `dailyData` buckets).

Because the charts are aggregated **server-side**, the filtering happens in `_fetchDashboardData` (`lib/actions.ts`): totals come from an unfiltered `groupBy(["type"])`, while the category breakdown uses a separate `groupBy(["category"])` with `where: { excludeFromStats: false }`; `getTrendRows` appends the `excludeFromStats` filter to its raw SQL unless called with `includeOffChart: true` — the ledger-basis variant fetched as a second `wealthData` series when the year or all-time view requests it (`getRangeDashboardData(…, withWealthSeries: true)`), passed down via the `initialWealthData` prop to `WealthCurve` and to `MonthlyBarChart`, which stacks each month's off-chart expense (`wealthData` minus `dailyData` per bucket) on the chart-basis expense bar as a hatched segment. The optimistic handlers in `useDashboardState` (`handleAdd`/`handleUpdate`/`handleDelete`) mirror the split: totals always update, but `categoryData`/`dailyData` are only patched when `!excludeFromStats` (with `handleUpdate` accounting for the flag toggling). `SpendingInsights` derives its own total from the already-filtered `categoryData` so its bars, burn rate, and pace badge stay on the same basis as the charts. A future "overall dashboard" can reuse the same `excludeFromStats: false` filter.

#### Search & filters (transactions page)

Search (`q`) matches note + category (substring, case-insensitive on both dialects), labels (exact, case-insensitive — substring isn't expressible on a `String[]` column), and exact amount when the query parses as a number (`45`, `rm45`, `1,200`). Postgres uses `getSearchFilter`'s `OR` clause; SQLite extends the existing JS-side filter path with `matchesSearch`. The filter bar has an All/Expense/Income segmented pill (buttons, not a `<select>` — the e2e category test selects `select.first()` positionally) and a "More filters" collapsible row holding the date-range and amount min/max inputs (debounced into the URL; the row auto-opens when any of its filters is active). `type`/`min`/`max` serialize to URL params like the rest; inverted min/max are swapped server-side in `getTransactions`.

Searches are scoped to the selected **month** unless a date range is active (`getTransactions` uses `filters.from ?? month-window`). An **All time** toggle (`data-testid="all-time-toggle"`) sits beside the month selector in row 1 and is the one-tap way out of that window: it writes `from` = the user's first transaction date (`getEarliestTransactionDate()`, fetched once on mount) and `to` = today, which puts the page in range mode (month selector hides, "More filters" auto-opens). It reads as active whenever the active range covers `[earliest, today]` — ISO date strings compare correctly as plain strings, so a manually widened range still lights it up. Both `from` and `to` are parsed as **local** midnight/end-of-day (`new Date(v + "T00:00:00")`) in `buildFilters` and in `/api/export` — a bare `yyyy-MM-dd` parses as UTC and would drop the early hours of the first day in a positive-offset timezone (i.e. the earliest transaction, exactly the row an all-time search exists to find).

#### Privacy mode (feature 33)

An eye toggle in the nav (sidebar footer + mobile bottom-nav slot) blurs every currency figure: `PreferencesContext` sets `data-private` on `<html>`, and one global rule — `[data-private] .tabular-nums { filter: blur(6px) }` in `globals.css` — covers everything, because currency consistently carries `.tabular-nums` (the same hook `amountMasks` uses in e2e). `@media print` always reveals. SVG chart text is out of CSS reach, so all six chart components read `isPrivate` and pass `tick={false}` to currency Y-axes and skip rendering their `<Tooltip>`. The feature itself is toggleable in Settings → Preferences (`privacyFeatureEnabled`, default on) — turning it off hides the eye and un-blurs immediately. Shoulder-surfing shield only, not a security boundary; inputs are never blurred (none carry the class).

#### Undo delete (feature 27)

Delete-then-restore: the server delete commits immediately (unchanged flow), the deleted record is stashed in the toast action's closure, and the 5s "Transaction deleted — Undo" toast re-creates it via `addTransaction` with the original `date`/`labels`/`excludedBudgetIds`/`excludeFromStats` (new id — nothing references transaction ids externally). Offline deletes offer the same Undo through `applyLocalMutation("add")`, which also covers never-synced rows whose queued add the delete cancelled. The re-created row re-enters through `TransactionList.reinsertRow` → parent `onRestore` (dashboard: `handleTransactionPosted` → `handleAdd`, which patches totals/chart slices incl. the basis split). Toggleable in Settings → Preferences (`undoDeleteEnabled`, default on).

#### Duplicate detection (feature 22)

Three client-side advisory layers (`lib/duplicates.ts`; the server never content-matches — identical legitimate purchases are common, only `clientId` retry-dedup exists server-side):
- **60s confirm strip** in quick-add: same (amount, category) committed within the last minute swaps the input row for an amber "add anyway?" strip. Interrupts at most once per submission; the draft survives Cancel. Source of truth is a module-level `recentAdds` registry fed by every commit (loaded lists can't power this — `createdAt` isn't in the client Transaction shape, and `date` is the user-chosen date).
- **Same-day hint**: a match of any age today only lights a passive amber dot on the Add button (needs the `recentTransactions` prop — dashboard passes `mergedTransactions.slice(0, 20)`, transactions page its loaded rows).
- **Review banner** on `/transactions`: same (local day, amount, category) groups among loaded rows raise a dismissible banner with a filtered review toggle. Session-local; notes are ignored in the key and left for the human to judge.

#### Offline / pending transactions

Transactions created offline get a temp ID (`pending_…`) and an amber **"Pending"** badge. They are persisted to IndexedDB so they survive page reloads. When the network is restored, `SyncProvider` automatically flushes the sync queue and replaces temp IDs with real server IDs. The service worker handles sync when the tab is closed via the Web BackgroundSync API.

### Auth

NextAuth v4 with credentials provider. **Multi-user app with admin-only account creation** — no public signup. Roles: `"admin"`, `"user"`, `"demo"`.

`ADMIN_EMAIL` and `ADMIN_PASSWORD_HASH` (env vars) are bootstrap credentials for the first login. On bootstrap, `lib/auth.ts` auto-creates the admin `User` row in the DB with `APP_USER_ID` and `role: "admin"`, and seeds default categories for that user. Subsequent logins use the DB record. Session strategy is JWT (maxAge 30 days); `userId`, `role`, and `sessionVersion` are stored in the token and read back via `session.user.userId` / `session.user.role` / `session.user.sessionVersion`.

**Session invalidation:** `getAuthenticatedUserId()` (called by every server action) does an extra `db.user.findUnique` to compare `dbUser.sessionVersion` against the JWT claim. If they differ, it throws `"Unauthorized"`. `changePassword`, `adminResetPassword`, and a role change in `updateUser` all increment `sessionVersion` via `{ increment: 1 }` — the client calls `signOut()` after a successful password change so the user logs in fresh, and a demoted admin's existing tokens stop carrying admin power immediately rather than at JWT expiry.

**User model** (`prisma/schema.prisma`): `id, email (unique), name, passwordHash, role, sessionVersion, createdAt, updatedAt`. Passwords are bcrypt-hashed (12 rounds).

**New users** get default categories seeded automatically by `_seedDefaultCategories(userId)`, called from both `createUser()` (admin-created users) and the bootstrap path in `lib/auth.ts`.

**Admin user management** (Settings → Users tab, admin only):
- `getUsers()` — lists all users, never returns `passwordHash` (Prisma `select` excludes it)
- `deleteUser(id)` — atomic cascade delete (budgets → recurringTransactions → categories → transactions → user); guards: no self-delete, no last-admin delete
- `updateUser(id, data)` — change name or role; guards: no last-admin demotion; a role change bumps the target's `sessionVersion`
- `adminResetPassword(id, newPassword)` — bcrypt-hashes and updates without old password; increments `sessionVersion`
- All admin actions call `requireAdmin()` (private helper): it re-reads `role` + `sessionVersion` from the DB (not just the JWT), so a demoted or deleted admin loses access immediately. `createUser` also routes through it, and role inputs are validated with `roleSchema`.

`proxy.ts` protects all routes except `/login`, `/api/auth/**`, and static assets. The user ID is resolved from the session token via `getAuthenticatedUserId()` — it throws `"Unauthorized"` if the session is absent, the userId is missing, or the sessionVersion is stale. `APP_USER_ID` in `.env` is used in `lib/auth.ts` when constructing the initial admin record at first sign-in.

### Security

Hardening measures added in the Jul 2026 security pass (`security/hardening-jul2026`). When touching any of these areas, preserve the control:

- **Authorization** — every mutation is ownership-scoped (`findFirst({ id, userId })`); admin actions go through the DB-backed `requireAdmin()`. Never trust `role`/`sessionVersion` from the JWT alone.
- **Input validation** — all server-action and `/api/sync` payloads are Zod-validated (`lib/validation.ts`), with length caps on every string/array field. The offline REST path uses the same schemas as the server actions — keep them in sync.
- **Rate limiting** — `lib/rate-limit.ts` throttles login, `/api/sync`, `/api/export`, and `changePassword`. In-memory/per-instance (a speed bump, not a hard quota); swap for Redis if a hard guarantee is needed.
- **Security headers** (`next.config.js`) — a same-origin **Content-Security-Policy** (`object-src 'none'`, `frame-ancestors 'none'`, `form-action 'self'`, `connect-src 'self'`; `'unsafe-inline'` is required by Next's hydration, `'unsafe-eval'` is dev-only for React Refresh), plus `Permissions-Policy`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`. If you add an external script/style/font/API host, the CSP must be widened or the request will be blocked.
- **CSV export** — formula-injection escaping (see `app/api/export/route.ts`).
- **Sign-out hygiene** — `clearLocalDataForSignOut()` wipes IDB + Cache Storage before `signOut` so financial data doesn't linger on a shared device.
- **MCP server** (`mcp-server/`) — the HTTP transport **refuses to start** without `MCP_BEARER_TOKEN` (fail-closed) and compares tokens with `timingSafeEqual`. Never reintroduce a no-op auth fallback.
- **Seeding** — `prisma/seed.ts` only creates the publicly-known demo user (`demo@example.com`) and the `changeme` admin fallback in SQLite/local mode or with an explicit `SEED_DEMO=1`; `db:seed` against Postgres requires `ADMIN_PASSWORD_HASH`.
- **TLS** — the Postgres connection uses `sslmode=no-verify` (encrypted but unverified — Supabase's self-signed pooler chain). Known trade-off left in place; upgrade to `verify-full` with a pinned CA if you need it.
- **Dependencies** — keep Next.js patched; the `next-auth` v4 → transitive `uuid` advisory requires a v3 downgrade, so it is intentionally deferred.

### Styling

Tailwind v4, CSS-first config — there is no `tailwind.config.ts`; theme tokens, keyframes, and the `dark` variant (`@custom-variant dark (&:is(.dark *));`, driven by `class="dark"` on `<html>`) live in an `@theme` block at the top of `app/globals.css`. Custom utility classes (`card`, `input-base`, `btn-primary`, `badge`, etc.) are defined with `@utility` in the same file. PostCSS config (`postcss.config.js`) only needs the `@tailwindcss/postcss` plugin — v4 handles vendor-prefixing internally, so `autoprefixer` was removed.

UI conventions (established in the Jul 2026 polish pass — full details in `docs/UI_POLISH_JUL2026.md`):

- **Icons**: structural UI icons come from `lucide-react`; emoji only as data (category icons, brand mark). Icon-only buttons need `aria-label`; the icon itself gets `aria-hidden`.
- **Brand color**: use the `brand` / `brand-light` / `brand-violet` tokens (`--color-brand`, `--color-brand-light`, `--color-brand-violet` in the `@theme` block of `app/globals.css`) or `theme(colors.brand.*)` in CSS — never inline `#4f46e5`/`#6366f1`/`#7c3aed`.
- **Radius scale**: cards `rounded-2xl`, controls `rounded-xl`, badges/pills `rounded-full`, small chips `rounded-lg`; skeletons match the component they stand in for.
- **Touch targets**: compact icon buttons get ≥44px hit areas on touch via `[@media(hover:none)]:min-h-11 [@media(hover:none)]:min-w-11`.
- **Inputs**: `text-base sm:text-sm` (16px on mobile prevents iOS focus-zoom).
- **Destructive actions**: inline two-step confirm (see `TransactionList` / `RecurringRow`), never native `confirm()`.
- **Dialogs**: native `<dialog>` + `hooks/useDialogBehavior.ts` (`showModal()` gives a real focus trap) + the `dialog-shell` utility in `globals.css`; no `role="dialog"`/`aria-modal` needed. Errors: `role="alert"`; transient status: `role="status"`/`aria-live="polite"`. Cancel buttons: `.btn-ghost`. Neutrals: `slate-*` only.

**Dev gotcha**: `public/sw.js` caches `/_next/static/**` cache-first, so a browser with the SW registered serves stale CSS/JS in dev even after a server restart. Unregister the SW + clear `caches` before visually verifying style changes.


## Auto-generated signatures
<!-- Updated by gen-context.js -->
# Code signatures

## deps
```
components\recurring\RecurringList.tsx ← RecurringRow, RecurringForm
components\recurring\RecurringRow.tsx ← RecurringForm
components\DashboardContent.tsx ← hooks/useDashboardState, StatCard
components\budgets\BudgetManager.tsx ← hooks/useDialogBehavior
components\QuickAddSheet.tsx ← hooks/useDialogBehavior, hooks/usePresence, ExpenseInput
components\charts\*.tsx ← hooks/useChartAnimation, context/PreferencesContext (privacy: tick={false} + tooltip suppression)
components\StatCard.tsx ← hooks/useCountUp
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
interface Transaction
interface Category
hook useSearchParams
hook useRouter
hook usePathname
hook useSyncContext
hook useRef
hook useState
hook useEffect
hook useCallback
hook useMemo
hook useSWR
handler setFilter
handler handleSearchChange
handler handleAmountChange
handler clearAllFilters
handler handleExport
handler handleAdd
handler handleReplace
handler handleDelete
handler handleRestore
handler handleUpdate
handler loadMore
```

### app\(auth)\login\page.tsx
```
component LoginForm
component LoginPage
hook useRouter
hook useSearchParams
hook useState
hook useTransition
handler handleSubmit
```

### app\(dashboard)\dashboard\loading.tsx
```
component DashboardLoading
```

### app\(dashboard)\error.tsx
```
component DashboardError
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

### app\api\auth\[...nextauth]\route.ts
```
export { handler as GET, handler as POST }
```

### app\global-error.tsx
```
component GlobalError
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
component TypeBadge
props BudgetManagerProps
interface Category
hook useState
hook useEffect
hook useCallback
hook useDialogBehavior
export BudgetManager
handler resetForm
handler startEdit
handler handleTypeChange
handler handleCategorySelect
handler handleSave
handler handleDelete
handler requestClose
```

### components\CategoryCombobox.tsx
```
component CategoryCombobox
props CategoryComboboxProps
hook useState
hook useRef
hook useEffect
export CategoryCombobox
handler select
handler handleKeyDown
handler handleMouseDown
```

### components\CategoryManager.tsx
```
component CategoryManager
component CategoryRow
interface Category
hook useState
export CategoryManager
handler startEdit
handler cancelEdit
handler handleSaveEdit
handler handleRestoreDefaults
handler handleAdd
handler handleDelete
```

### components\ChangePasswordForm.tsx
```
component ChangePasswordForm
hook useState
export ChangePasswordForm
handler handleSubmit
```

### components\DashboardContent.tsx
```
component DashboardContent
props DashboardContentProps
hook useDashboardState
hook useCallback
export DashboardContent
handler handleTransactionPosted
```

### components\DashboardErrorBoundary.tsx
```
component DashboardErrorBoundary (class)
props Props
interface State
export DashboardErrorBoundary
```

### components\StatCard.tsx
```
component StatCard
hook useCountUp
export StatCard
```

### components\DemoBanner.tsx
```
component DemoBanner
```

### components\NavBar.tsx
```
component NavBar
hook usePathname
hook useSidebar
hook useState
hook useEffect
export NavBar
handler dispatchNavStart
```

### components\recurring\RecurringForm.tsx
```
component RecurringForm
props RecurringFormProps
interface RecurringFormData
hook useState
hook useEffect
hook useTransition
export RecurringForm
handler handleSubmit
```

### components\TransactionList.tsx
```
component LabelBadge
component LabelEditor
component BudgetExcludeSelect
component TransactionRow
component TransactionList
props TransactionListProps
interface Transaction
interface BudgetOption
interface CategoryMeta
hook useState
hook useRef
hook useEffect
hook useCallback
hook useSyncContext
hook useToast
hook usePreferences
export TransactionList
handler addLabel
handler handleKeyDown
handler toggle
handler handleSave
handler handleDelete
handler undoDelete
handler handleUpdate
handler handleRestore
handler reinsertRow
```

### components\budgets\BudgetProgress.tsx
```
component BudgetProgress
props BudgetProgressProps
export BudgetProgress
```

### components\charts\TrendChart.tsx
```
component CustomTooltip
component TrendChart
props TrendChartProps
interface DailyData
hook useMemo
hook useChartAnimation
export TrendChart
```

### components\charts\MonthlyBarChart.tsx
```
component CustomTooltip
component MonthlyBarChart
props MonthlyBarChartProps
hook useChartAnimation
export MonthlyBarChart
```

### components\charts\DayOfWeekChart.tsx
```
component CustomTooltip
component DayOfWeekChart
props DayOfWeekChartProps
hook useChartAnimation
export DayOfWeekChart
```

### components\charts\PaceChart.tsx
```
component PaceTooltip
component PaceChart
props PaceChartProps
hook useMemo
hook useChartAnimation
export PaceChart
```

### components\charts\SpendingPieChart.tsx
```
component DonutTooltip
component SpendingPieChart
props SpendingPieChartProps
interface Slice
hook useMemo
hook useRouter
hook useChartAnimation
export SpendingPieChart
handler drillDown
```

### components\charts\WealthCurve.tsx
```
component WealthTooltip
component WealthCurve
props WealthCurveProps
hook useMemo
hook useChartAnimation
export WealthCurve
```

### components\ExpenseInput.tsx
```
component ExpenseInput
component TypeToggle
props ExpenseInputProps
hook useState
hook useRef
hook useMemo
hook useSyncContext
hook useToast
export AddedTx
export ExpenseInput
handler handleChange
handler handleKeyDown
handler clearInput
handler handleSubmit(bypassDupCheck?)
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
hook useEffect
hook useRef
hook useTransition
export MonthSelector
handler go
handler switchPeriod
```

### components\PreferencesPanel.tsx
```
component PreferencesPanel
component ToggleRow
hook usePreferences
export PreferencesPanel
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
hook usePresence
hook useDialogBehavior
export QuickAddSheet
handler handleAddAndClose
```

### components\recurring\RecurringList.tsx
```
component RecurringList
props RecurringListProps
interface RecurringTransaction
interface PostedTransaction
hook useState
hook useEffect
hook useToast
export RecurringList
handler handlePosted
handler handleDeleted
handler handleRestored
handler handleSkipped
handler handleUpdated
handler handleCreated
handler handleDuplicated
```

### components\recurring\RecurringRow.tsx
```
component RecurringRow
props RecurringRowProps
interface RecurringTransaction
interface PostedTransaction
hook useState
export RecurringRow
handler handlePost
handler handleBackfill
handler handleSkip
handler handleDelete
```

### components\SpendingInsights.tsx
```
component SpendingInsights
props SpendingInsightsProps
interface CategoryData
export SpendingInsights
```

### components\SyncStatusBar.tsx
```
component SyncStatusBar
component PresenceWrapper
hook useSyncContext
hook useState
hook useRef
hook useEffect
hook usePresence
export SyncStatusBar
```

### components\TopLoadingBar.tsx
```
component TopLoadingBarInner
component TopLoadingBar
hook usePathname
hook useSearchParams
hook useState
hook useRef
hook useEffect
export TopLoadingBar
handler onNavStart
handler onNavEnd
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
interface Category
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
export useSyncContext
handler refreshPendingCount
handler syncNow
handler handleOnline
handler handleOffline
```

### context\PreferencesContext.tsx
```
component PreferencesProvider
hook useState
hook useEffect
hook useCallback
hook useContext
export PreferencesProvider
export usePreferences  → { privacyFeatureEnabled, isPrivate, undoDeleteEnabled, togglePrivate, setPreference }
```

### context\SidebarContext.tsx
```
component SidebarProvider
hook useState
hook useEffect
hook useContext
export SidebarProvider
export useSidebar
handler toggle
```

### context\ToastContext.tsx
```
component ToastProvider
interface Toast
interface ToastContextValue
hook useState
hook useRef
hook useCallback
hook useEffect
export ToastProvider
export useToast
handler dismiss
handler showToast
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
export function useDashboardState(props) → { categoryData, dailyData, budgets, budgetSpending, budgetOptions, showBudgetManager, setShowBudgetManager, sheetOpen, setSheetOpen, showRecurring, setShowRecurring, topCategory, dueCount, fixedAvailableCash, fixedMonthlyExpense, dueWeekCount, dueWeekExpense, dueWeekIncome, discretionarySpend, mergedTransactions, recentTransactions, frequentCategories, displayIncome, displayExpenses, displayBalance, savingsRate, avgMonthlySpend, dailySpend, isCurrentMonth, isMonthView, expenseDelta, incomeDelta, handleAdd, handleReplace, handleDelete, handleUpdate }
```

### hooks\useOnlineStatus.ts
```
export function useOnlineStatus() → boolean
```

### hooks\useDialogBehavior.ts
```
export function useDialogBehavior(open, onClose) → RefObject<HTMLDivElement>
```

### hooks\useReducedMotion.ts
```
export function useReducedMotion() → boolean
```

### hooks\usePresence.ts
```
export function usePresence(open, exitMs?) → { mounted, visible }
```

### hooks\useCountUp.ts
```
export function useCountUp(value) → number
```

### hooks\useChartAnimation.ts
```
export function useChartAnimation() → { isAnimationActive, animationDuration, animationEasing }
```

## lib

### lib\actions.ts
```
export async function addTransaction(data)
export async function updateTransaction(id, data)
export async function deleteTransaction(id)
export async function getTransactionIds() → Promise<string[]>
export async function getDashboardData(month, year)
export async function getRangeDashboardData(startISO, endISO, granularity, withWealthSeries?)
export async function getEarliestTransactionDate() → Promise<string | null>
export async function getFrequentCategories(limit?) → Promise<string[]>
export async function getTransactions(filters incl. type?/amountMin?/amountMax?) → Promise<{ transactions, nextCursor, totalCount, totalIncome, totalExpenses }>
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
export async function backfillRecurringTransaction(id) → Promise<{ count, recurring, transactions }>
export async function getBudgets()
export async function saveBudget(data, id?)
export async function deleteBudget(id)
export async function getUsedLabels() → Promise<string[]>
export async function skipRecurringTransaction(id)
export async function changePassword(currentPassword, newPassword) → Promise<{ success: true }>
export async function createUser(data) → Promise<{ id, email }>
export async function getSessionRole() → Promise<string>
export async function getUsers()
export async function deleteUser(id) → Promise<void>
export async function updateUser(id, data) → Promise<{ id, email, name, role }>
export async function adminResetPassword(id, newPassword) → Promise<{ success: true }>
```

### lib\db-adapter.ts
```
export const IS_SQLITE: boolean
export function parseLabels(val) → string[]
export function encodeLabels(labels) → unknown
export function normalizeTx(tx) → object
export function parseBudgetArray(val) → string[]
export function encodeBudgetArray(arr) → unknown
export function normalizeBudget(b) → object
export function getLabelFilter(label?) → Record<string, unknown>
export function parseAmountQuery(q) → number | null
export function getSearchFilter(q?) → Record<string, unknown>
export function matchesSearch(tx, q) → boolean
export type TrendGranularity
export async function getTrendRows(userId, start, end, granularity?, includeOffChart?) → Promise<Array<{ day, type, total }>>
export function getDailyRows(userId, start, end) → Promise<...>
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
  excludedBudgetIds: string[]
  excludeFromStats: boolean
  date: string
  syncStatus: "synced" | "pending" | "pending-update" | "pending-delete"
  syncError?: string
  createdAt: string
export interface QueuedOp
  queueId?: number
  op: "add" | "update" | "delete"
  tempId: string
  payload: Record<string, unknown>
  createdAt: string
  retryCount?: number
  nextRetryAt?: number
export async function putTransaction(tx) → Promise<void>
export async function patchTransaction(id, patch) → Promise<void>
export async function getTransactionsByMonth(userId, month, year) → Promise<LocalTransaction[]>
export async function getTransactionsInRange(userId, startISO, endISO) → Promise<LocalTransaction[]>
export async function getTransactionFromIDB(id) → Promise<LocalTransaction | undefined>
export async function deleteTransactionFromIDB(id) → Promise<void>
export async function replaceTempId(tempId, realId, serverPatch?) → Promise<void>
export async function enqueueOp(op) → Promise<void>
export async function getAllQueuedOps() → Promise<QueuedOp[]>
export async function deleteQueuedOp(queueId) → Promise<void>
export async function updateQueuedOp(op) → Promise<void>
export async function getPendingCount() → Promise<number>
export async function getFailedSyncCount() → Promise<number>
export async function seedIDBFromServer(serverTransactions, userId) → Promise<void>
export async function reconcileWithServer(serverIds, userId) → Promise<number>
```

### lib\duplicates.ts
```
export const RECENT_WINDOW_MS
export function recordAdd(entry) → void
export function clearRecentAdds() → void
export function findRecentDuplicate(draft, now?, windowMs?) → RecentAdd | null
export function hasSameDayDuplicate(draft, recent, today?) → boolean
export function groupPossibleDuplicates(txs) → DuplicateGroup[]
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
export { seedIDBFromServer }
export async function drainQueue(options?) → Promise<{ synced, failed }>
export async function applyLocalMutation(op, data) → Promise<{ committed, wasQueued }>
export async function reconcileAfterSync(userId) → Promise<number>
```

### lib\utils.ts
```
export const DEFAULT_CATEGORIES (server-side use only)
export function cn(...inputs)
export type RecurringFrequency
export function formatCurrency(amount) → string
export function getNextDueDate(frequency, startDate, lastRun) → Date
export function getRecurringStatus(nextDue, endDate) → "upcoming" | "due" | "overdue" | "ended"
export function isPostedThisPeriod(frequency, lastRun) → boolean
export function toMonthlyAmount(frequency, amount) → number
export function countRemainingPayments(frequency, nextDue, endDate) → number
export const MAX_BACKFILL: number
export function countMissedPeriods(frequency, startDate, lastRun, endDate) → number
export function formatDate(date) → string
export function formatDateShort(date) → string
export function getMonthName(month) → string
export function getCurrentMonthYear() → { month, year }
export function getPrevMonth(month, year) → { month, year }
export function getNextMonth(month, year) → { month, year }
export function enumerateMonths(start, end) → { year, month }[]
export function rankCategoriesByUsage(transactions, limit?) → string[]
export function stringToColor(str) → string
```

### lib\db.ts
```
export const db: PrismaClient
```

### lib\auth.ts
```
export const authOptions: NextAuthOptions
```

## types

### types\index.ts
```
export interface Transaction
export interface CategoryData
export interface DailyData
export interface RecurringTransaction
export type BudgetType
export interface Budget
export interface CategoryOption
export type Period
```

### types\next-auth.d.ts
```
declare module "next-auth" (User, Session)
declare module "next-auth/jwt" (JWT)
```
