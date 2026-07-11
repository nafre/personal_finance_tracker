# Improvements Backlog

Ideas that were scoped but not fully implemented. Each open item has an effort estimate (S/M/L) and a suggested file to start from. Items marked **DONE** have since been implemented.

> **Jul 2026:** several open items now have full implementation plans in the [feature roadmap](features/README.md) (`docs/features/`). Those items are marked **Superseded** below — the feature doc is the authoritative plan; the entry here is kept only as a historical pointer.

---

## UX / Features

### ~~1d — CSV Export~~ DONE
Implemented as `GET /api/export` — see `app/api/export/route.ts`. The transactions page has an **Export CSV ↓** button in the filter bar.

### 1e — Bulk Select + Bulk Delete (M, medium)
> **Superseded** — full plan: [features/23-bulk-edit.md](features/23-bulk-edit.md) (extends this item with bulk recategorize / add-label / off-chart).

Add multi-select checkboxes to `TransactionList`, a "Delete selected" action, and optionally "Add label to selected".
- Start: `components/TransactionList.tsx` — add a `selectable` prop and checkbox column.
- Add `deleteTransactions(ids: string[])` server action to `lib/actions.ts`.

### 1f — Undo for Delete (S, medium)
> **Superseded** — full plan: [features/27-undo-delete.md](features/27-undo-delete.md) (chooses delete-then-restore over the deferred-delete sketch below; the ToastContext action-button extension carries over).

5-second toast with "Undo" that re-inserts the deleted record before the server confirms deletion.
- Start: `components/TransactionList.tsx` `handleDelete` — stash the deleted record in a ref, show toast, cancel deletion on undo.
- `context/ToastContext.tsx` now exists (Jul 2026) — extend `showToast` with an optional action button (`{ label, onClick }`) instead of building a one-off toast. The exit animation plumbing (`usePresence`) is already there.

### ~~1g — Visual Category Picker in Quick-Add~~ DONE
Implemented as a unified chip row in `ExpenseInput` (icon + colour tint, recently-used first, then all categories). Categories are fetched server-side on the dashboard page and passed down as `CategoryOption[]`; the transactions page reuses its existing on-mount fetch.

### 1h — Duplicate Detection (S, medium)
> **Superseded** — full plan: [features/22-duplicate-detection.md](features/22-duplicate-detection.md) (adds a same-day passive hint and a review grouping on `/transactions`).

On add, check if a transaction with the same amount + category was created in the last 60 seconds and show an inline "looks like a duplicate" confirm.
- Start: `components/ExpenseInput.tsx` — in `handleSubmit`, check the most recent transactions list before calling `addTransaction`.

### ~~1i — Mobile Polish~~ DONE
- ~~Top-category label on mobile~~ DONE: the "Top spend" header label now renders at all widths (wraps below the month selector at 390px).
- ~~Month selector at 390px~~ DONE (Jul 2026 UI polish pass): no longer wraps; chevron icons, 44px arrow targets, `whitespace-nowrap` toggle. See `docs/UI_POLISH_JUL2026.md` for the full pass (icons, touch targets, dialog a11y, filter bar, safe areas).

### 1k — Transaction Templates / Favorites (M, high)
> **Superseded** — full plan: [features/20-transaction-templates.md](features/20-transaction-templates.md) (keeps the two-phase approach below and adds the `Template` model spec).

One-tap re-add for complete frequent transactions (category + amount + note + labels) — goes beyond the recently-used *category* chips, which still require typing the amount.
- Phase 1 (derived, no schema change): compute the top repeated `(category, amount, note)` tuples from recent transactions (client-side, `hooks/useDashboardState.ts`) and render a template chip row in `ExpenseInput`; tapping pre-fills the input text so the user can confirm/tweak before submit.
- Phase 2 (optional): explicit "Save as template" action on a `TransactionList` row — needs a small `Template` model (or pinned flag) + CRUD in `lib/actions.ts`.
- The add path must stay offline-aware: reuse the existing submit flow (`applyLocalMutation` when offline).
- Start: `components/ExpenseInput.tsx`, `hooks/useDashboardState.ts`.

### ~~1j — Recurring Upgrades~~ DONE
All three shipped (Jul 2026):
- **Backfill** — `backfillRecurringTransaction(id)` creates one transaction per missed period at its historical due date and advances `lastRun`, atomically (capped at `MAX_BACKFILL = 36` per call). `RecurringRow` shows a two-step-confirm "Backfill N" button when a rule is ≥2 periods behind (`countMissedPeriods` in `lib/utils.ts`). No optimistic tx patching — backfilled rows carry past dates, so the UI catches up via `revalidatePath`.
- **Duplicate** — Copy icon on `RecurringRow` opens `RecurringForm` in create mode prefilled from the rule (" (copy)" name, start date reset to today, past end dates dropped so the copy isn't born ended).
- **Due this week** — month-view summary card above the recurring section (`data-testid="due-week-card"`): count + expense/income totals for rules due within 7 days (overdue included); computed in the consolidated recurring memo in `useDashboardState`; "Review →" expands the recurring list. Hidden when nothing qualifies.

### 1l — CSV Import (M, medium)
> **Superseded** — full plan: [features/18-csv-import.md](features/18-csv-import.md) (adds column mapping for foreign formats, date-format handling, and chunked batch inserts).

Companion to the CSV export: upload a CSV (own export format first; bank formats later) and bulk-create transactions. Makes the export/backup story round-trip.
- Parse client-side, preview rows in a table with per-row include checkboxes, then submit via a new `addTransactions(rows[])` server action (Zod-validate each row; cap batch size).
- Dedupe against existing data by `(date, amount, category)` and flag suspected duplicates in the preview rather than silently skipping.
- Start: new `components/ImportDialog.tsx` (use `hooks/useDialogBehavior.ts`), `lib/actions.ts`.

### 1m — Auto-Post Recurring Rules (M, medium)
> **Superseded** — full plan: [features/21-auto-post-recurring.md](features/21-auto-post-recurring.md) (adds the action-core extraction and timezone notes; same `autoPost` + `CRON_SECRET` design).

Posting is manual today (Post button / backfill). An opt-in `autoPost` flag per rule plus a daily cron (Vercel Cron → `app/api/cron/route.ts`) would post due rules server-side without opening the app.
- Idempotency comes free: `postRecurringTransaction` advances `lastRun` atomically, so a re-run posts nothing new. Reuse `backfillRecurringTransaction` semantics for rules more than one period behind.
- Guard the route with `CRON_SECRET` (Vercel sends it as a Bearer header).
- Schema change: `autoPost Boolean @default(false)` on `RecurringTransaction` (both schemas + `RecurringForm` checkbox).

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

### ~~2f — Lazy-Load SpendingPieChart~~ DONE (removed as dead code, then rebuilt)
`SpendingPieChart` was imported nowhere at the time and deleted. It has since been rebuilt from scratch for the month view (see 7k) and **is** lazy-loaded with `dynamic(..., { ssr: false })` as prescribed — nothing left to do here.

---

## Reliability

### ~~3b — Service Worker Retry/Backoff~~ DONE
Failed ops now carry `nextRetryAt` (exponential: 30s → 1m → 2m → 4m → 8m, base kept in sync between `lib/sync.ts` and `public/sw.js`). Drains stop at an op still inside its backoff window (causal order preserved); the SW rejects the sync event when ops remain so the browser reschedules with its own backoff. User-initiated syncs (`syncNow({ force: true })` — SyncStatusBar buttons, reconnect flush) bypass the window.

### ~~3e — Pagination Dedup in loadMore~~ DONE
`loadMore()` now filters appended results against a `Set` of already-loaded IDs before concatenating, so server-side data shifts between cursor pages can no longer duplicate rows.

### ~~3c — Error Boundaries~~ DONE
`DashboardErrorBoundary` now takes an optional `section` prop rendering a compact card fallback with "Try again"; `DashboardContent` wraps each section (quick add, recurring, spending insights, trend chart, monthly chart, budgets, recent transactions) in its own boundary. The page-level boundary remains as the outer catch-all.

### ~~3d — Toast Notifications~~ DONE
Minimal `context/ToastContext.tsx` (no new dependency): `useToast().showToast(message, type)` with queue (max 3), 5s auto-dismiss, manual dismiss, `role="alert"` for errors. Mounted in `Providers`. Used for the failures that were invisible before: background add failure after `QuickAddSheet` closes (`ExpenseInput`), delete-failed-restored (`TransactionList`), recurring delete failure (`RecurringList`).

### 3g — Service Worker Update Notification (S, medium)
`public/sw.js` serves `/_next/static/**` cache-first, so after a deploy users can run a stale bundle until the new SW activates on a later visit — the same staleness documented as a dev gotcha, but in production. Detect the waiting worker and offer a refresh.
- In `SyncProvider`'s registration effect, listen for `registration.waiting` / `updatefound` → show a persistent "New version available — Refresh" toast (needs the ToastContext action-button extension from 1f); on click, `postMessage({ type: "SKIP_WAITING" })` to the SW then reload.
- Start: `context/SyncProvider.tsx`, `public/sw.js` (add the `SKIP_WAITING` message handler).

### 3h — E2E Coverage for the Offline Flow (M, medium)
The offline machinery (IDB queue, pending badges, temp-ID replacement, reconnect drain) has zero automated coverage — the Playwright suite is visual-only and always online. A regression here is invisible until someone actually goes offline.
- Playwright can drive it: `context.setOffline(true)` → quick-add → assert amber "Pending" badge → reload (still offline) → assert persistence → `setOffline(false)` → assert badge clears and the row survives with a real ID.
- Keep it a functional spec (assertions, not screenshots) so it doesn't add snapshot-churn surface.
- Start: new `e2e/offline.spec.ts`, reusing the login helper in `e2e/helpers.ts`.

### ~~3f — Stale IDB Ghost After Cross-Page Delete~~ DONE
Fixed in two halves: (1) `TransactionList`'s online edit/delete now write through to the IDB mirror (`patchTransaction` with the server-canonical record / `deleteTransactionFromIDB` after server success), so cross-page mutations can no longer orphan mirror records; (2) `SyncProvider` exposes `reconcileCount`, bumped whenever `reconcileAfterSync` purges stale records — the dashboard's pending-load effect depends on it, so ghosts captured into React state before a reconcile finished are dropped without a reload.

---

## Insights & Analytics

### ~~4a — Year View + 12-Month Trend~~ DONE
Implemented as the Year / All-time dashboard views (`?period=` param, monthly trend granularity). See `app/(dashboard)/dashboard/page.tsx` and the "Dashboard — year view" e2e tests.

### 4b — Forecast / Runway (M, medium)
> **Superseded** — full plan: [features/02-cashflow-forecast.md](features/02-cashflow-forecast.md) (adds the `lib/forecast.ts` pure module, median-based projection, and the all-time runway line).

Use recurring rules + average daily spend to project end-of-month net balance.
- Add a `ForecastCard` component in `components/` that consumes `dailyData` + `initialRecurring`.

### 4c — Category Drilldown Page (M, medium)
> **Superseded** — full plan: [features/04-category-drilldown.md](features/04-category-drilldown.md) (adds the `getCategoryDetail` action and the `getTrendRows` category-param extension).

Click a pie slice → `/transactions?category=X` works today but a dedicated drilldown with a 30-day sparkline is better.
- Add `app/(dashboard)/categories/[name]/page.tsx`.

### 4d — Spending Heatmap (S, low)
> **Superseded** — full plan: [features/03-spending-heatmap.md](features/03-spending-heatmap.md) (reuses `getDailyRows` instead of a new action; quantile bucketing + snapshot-masking strategy).

Daily intensity grid (GitHub contribution-style) for the year.
- Pure visualization component consuming a `getDailySpend(year)` action.

---

## Code Quality

### ~~5a — Split DashboardContent~~ DONE
State and handlers were extracted to `hooks/useDashboardState.ts`. `DashboardContent` is now a thin layout shell.

### ~~5b — Centralize IS_SQLITE Branch~~ DONE
Dialect abstraction lives in `lib/db-adapter.ts`: `IS_SQLITE`, `parseLabels`, `encodeLabels`, `normalizeTx`, `getLabelFilter`, `getDailyRows`. `lib/actions.ts` imports from there.

### ~~5c — Unit Tests~~ DONE
Added Vitest (`vitest.config.ts`, `npm run test` / `test:watch`) and wrote 66 tests across three files, matching the exact scope this item called out:
- `lib/parser.test.ts` — `parseExpenseInput`: currency-prefix stripping, thousands separators, income-keyword detection (keys off the first category token only), `#label` parsing, the `"Misc"` default, and the zero/negative-amount rejection in `extractNumericValue`.
- `lib/utils.test.ts` — every exported pure function except `cn` (trivial passthrough) and `DEFAULT_CATEGORIES` (static data), with the heaviest coverage on `getNextDueDate`, `getRecurringStatus`, and `countMissedPeriods` (the function flagged here, since its return value drives how many transactions `backfillRecurringTransaction` actually creates) — including the `MAX_BACKFILL` cap and the `endDate`-cutoff case. Date-dependent tests use `vi.setSystemTime()` with dates picked away from month/DST boundaries rather than relying on real "now", so they aren't timezone- or day-fragile.
- `lib/sync.test.ts` — the one with real setup cost, since `lib/sync.ts` touches `lib/idb.ts` (IndexedDB) and calls `@/lib/actions` (Prisma/`next/cache`, which must never load in a test process):
  - `@/lib/actions` is fully mocked (`vi.mock("@/lib/actions", () => ({ getTransactionIds: vi.fn() }))`).
  - A `// @vitest-environment jsdom` docblock opts just this file into jsdom (`lib/idb.ts`'s `getDB()` guards on `typeof window === "undefined"`); the rest of the suite runs on Vitest's faster default `"node"` environment. (Vitest's older `environmentMatchGlobs` config option — the initially-planned approach — no longer exists in the installed v4; the per-file docblock is what's still supported.)
  - `lib/idb.ts` caches its DB connection in a module-level singleton, so per-test isolation needed both a fresh IndexedDB backend (`vi.stubGlobal("indexedDB", new FDBFactory())` from `fake-indexeddb/lib/FDBFactory`) *and* a fresh module instance (`vi.resetModules()` before re-importing `@/lib/sync`/`@/lib/idb` in `beforeEach`) — resetting only one leaks state across tests.
  - Covers `applyLocalMutation` (add/update/delete, including the still-pending-record in-place patch and the never-synced-delete cancellation), `drainQueue` (success paths, 404-as-success, retry/backoff with causal-order stop, the `MAX_RETRIES` drop, and the force-bypass of an active backoff window), and `reconcileAfterSync` (purge + the catch-and-return-0 path).
  - `vitest.config.ts` scopes `test.include` to `lib/**/*.test.ts` specifically — Vitest's default include glob also matches `*.spec.ts`, which would otherwise have picked up (and failed to run) Playwright's `e2e/*.spec.ts` files.
- **Verified**: `npm run test` (66/66), `npm run build` (confirms the new devDependencies/config don't affect the Next.js type-check gate), `npm run test:ui` (91/91, unaffected).

### 5d — Major Dependency Upgrades (L, low urgency — tackle one at a time)
From the Jul 2026 review. Each is its own project; **do not bundle**:
- ~~**Prisma 6 → 7**~~ DONE — the biggest-risk item, landed in two commits (SQLite dev path, then Postgres/production) per the "tackle one at a time" rule. `mcp-server` untouched as planned (zero Prisma coupling — raw `pg`).
  - **Generator**: `prisma-client-js` → `prisma-client` with `moduleFormat = "cjs"` on both schemas — v7's default client output is raw ESM-syntax TypeScript (not compiled JS), and `moduleFormat = "cjs"` was the key mitigation that avoided converting the whole app to `"type": "module"` (which would have forced renaming `next.config.js`/`postcss.config.js` and revisiting `tsconfig.json`). Output moved from `node_modules/.prisma/client-*` to a project-local `generated/` directory (gitignored) since the new generator requires an explicit `output` path.
  - **Driver adapters are mandatory** — the Rust query engine is gone. `@prisma/adapter-better-sqlite3` for SQLite (pinned `timestampFormat: "unixepoch-ms"` in the adapter's *second* constructor argument — its default is ISO8601 strings, which would've silently broken `lib/db-adapter.ts`'s raw-SQL epoch-ms arithmetic) and `@prisma/adapter-pg` for Postgres.
  - **`prisma.config.ts`** (new, required by the CLI regardless of module format): a single shared config works for both schemas by resolving `datasource.url` from `DATABASE_URL ?? POSTGRES_URL_NON_POOLING` at load time, mirroring the app's own dialect-detection pattern — no need for the two-config-file fallback the initial plan flagged as a possibility. `datasource.url`/`directUrl` are no longer legal in schema files at all (CLI-wide in v7, not just for `migrate`) — both schemas' `datasource` blocks were trimmed to just `provider`.
  - **Postgres-specific fixes**: Supabase's pooler presents a self-signed cert chain, and `@prisma/adapter-pg`'s `pg`-based connection verifies certs under `sslmode=require` (the old Rust engine never did — `require` only ever meant "encrypted," not "verified"), so the connection string is rewritten to `sslmode=no-verify` at runtime — same trust level as before, not a new weakening. Turbopack was also bundling `pg` into the server chunk and breaking its connection handling entirely; fixed with `serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg", "pg"]` in `next.config.js`.
  - **Verified**: full CRUD, `groupBy`, both `$transaction` forms (array + interactive callback), and both raw-SQL granularities directly against **production** (after a `pg_dump` backup) — row counts matched exactly after a live create/update/delete round-trip, plus a 25-query/10-concurrent-query stress pass with no prepared-statement errors against the pgbouncer pooler. `npm run build` and the full `npm run test:ui` suite (91/91) pass on both dialects.
  - **Unrelated fallout, fixed along the way**: an early `rm -f prisma/dev.db` (made while investigating the wrong path) turned out to delete the *real* local dev database — Prisma 6 resolved the schema's relative SQLite path against the schema file's directory (`prisma/dev.db`), while Prisma 7's adapter resolves it against `process.cwd()` (root `dev.db`) instead. Production was never touched (separate database, backed up regardless); the local admin fixture data two e2e tests depended on was restored and baselines regenerated.
- ~~**React 18 → 19**~~ DONE — bumped `react`/`react-dom` to `^19.2.7` and `@types/react`/`@types/react-dom` to `^19.2.17`/`^19.2.3`; `next-auth@4`, `recharts@3`, `swr@2`, and `lucide-react` all already declared React-19-compatible peer ranges, so no `overrides` were needed. Two source changes: `useRef<ReturnType<typeof setTimeout>>()` calls with no initial value (`app/(dashboard)/transactions/page.tsx`, `components/SyncStatusBar.tsx`) needed an explicit `| undefined` + `(undefined)` argument under React 19's stricter typing — everywhere else in the repo already passed one. No `forwardRef`, `defaultProps`, or `propTypes` usage existed to migrate. The two `startTransition(async fn)` sites (`app/(auth)/login/page.tsx`, `components/recurring/RecurringForm.tsx`) — previously documented as a React-18 anti-pattern to avoid — were manually verified via Playwright MCP to now track the async gap correctly (button stays disabled with correct label for the full request; a synthetic double-click mid-flight produced zero extra click events and no duplicate recurring rule was created). The nine components using the manual `useState` loading-flag workaround were left untouched (no longer strictly necessary, but out of scope for this upgrade). Verified via `npm run build` and the full `npm run test:ui` suite (90/91 — the one failure, `category filter applied` on desktop, is a pre-existing intermittent text-antialiasing flake confirmed unrelated to this upgrade: it passed on the freshly-regenerated baseline, failed once mid-suite, then passed again in isolation, with the diff confined to placeholder/chip text rendering, never layout).
- ~~**Tailwind 3 → 4**~~ DONE — the last item in the list, tackled on its own per the "one at a time" rule.
  - **Migration**: ran the official `npx @tailwindcss/upgrade` codemod (clean working tree beforehand, per its requirement). It deleted `tailwind.config.ts` and moved all theme tokens (brand colors, font families, keyframes/animations) into an `@theme` block at the top of `app/globals.css`; `darkMode: "class"` became `@custom-variant dark (&:is(.dark *));`; the six `@layer components` custom classes (`.fab`, `.card`, `.btn-primary`, etc.) became `@utility` blocks (v4's replacement — needed since `@layer components` no longer participates in v4's cascade-layer-based utility ordering the same way). `postcss.config.js` now only needs `@tailwindcss/postcss`; `autoprefixer` was removed (v4 vendor-prefixes internally via Lightning CSS).
  - **Template renames** (11 files, applied by the codemod): scale renames whose v3 names now mean something else in v4 — `outline-none` → `outline-hidden`, `flex-shrink-0` → `shrink-0`, `rounded`/`shadow`/`blur` bare-scale → explicit `-sm`/`-xs` suffix (e.g. `rounded` → `rounded-sm`, `backdrop-blur-sm` → `backdrop-blur-xs`), `bg-gradient-to-*` → `bg-linear-to-*`, arbitrary values that now have bracket-free syntax (`z-[100]` → `z-100`, `pb-[var(--safe-bottom)]` → `pb-(--safe-bottom)`). Each rename preserves the exact prior CSS output — confirmed via the visual regression suite, not just read as safe.
  - **`tailwind-merge` 2 → 3**: bumped alongside (v2 doesn't know v4's renamed utility scales, e.g. it would treat `rounded-sm` as the v3 "small radius" conflict group rather than v4's "default radius" group — silently wrong `cn()` merges wherever conflicting radius/shadow/blur classes are combined). No API changes hit this codebase's single `twMerge(clsx(inputs))` call in `lib/utils.ts`.
  - **Visual regression fallout**: v4 defines its default color palette in OKLCH instead of sRGB, which shifts nearly every colored pixel by a sub-visible amount — 14 of 91 Playwright baselines failed on a uniform, low-intensity whole-image diff (confirmed by inspecting the diff images: no structural/layout change, same pattern as the anti-aliasing shift noted in the Recharts 3 upgrade). Re-baselined with `npm run test:ui:update` and committed the new snapshots per the mandatory workflow. One additional failure (`category filter applied`, desktop) was isolated to the Quick-add input's rotating example-placeholder text and reproduced as a pre-existing timing flake, not a Tailwind effect — confirmed by re-running it alone immediately after (passed).
  - **Verified**: `npm run build` (type-check gate) and the full `npm run test:ui` suite (91/91) both pass.
- ~~**Recharts 2 → 3**~~ DONE — bumped to `^3.9.2` across `components/charts/*.tsx` (all six chart components). Added explicit `accessibilityLayer={false}` to each root chart element to hold behavior constant (v3 defaults it to `true`). No source changes needed beyond that: the codebase's tooltips are all loosely `any`-typed (no `import type` from `recharts`), so the v3 type rewrite caused zero compile errors, and the one `Cell radius={... as any}` cast in `MonthlyBarChart.tsx` is still required (`Cell`'s type still omits `radius` and the component is now `@deprecated` for v4). Verified via `npm run build`, a manual browser pass (month/year/all-time views, tooltips, the `Pie` click-through drilldown which has a reworked v3 event signature), and `npm run test:ui` — only the year/all-time full-page snapshots shifted (sub-pixel anti-aliasing from the new rendering internals, no structural change), re-baselined with `npm run test:ui:update`.
- ~~**TypeScript 5.6 → 6.0**~~ DONE — both `package.json` (root, `mcp-server`) bumped to `^6.0.3` in separate commits. Zero source changes needed: both `tsconfig.json`s already had `strict`/`skipLibCheck` on, and the risk-surface scan (no `@ts-ignore`, `enum`, `namespace`, `satisfies`, or decorators) turned up clean. Verified via `npm run build` in both packages plus a manual smoke test (SQLite dev mode: budget create/delete, year/all-time views) — no runtime regressions.

### 5e — Align mcp-server zod Version (S, low)

`mcp-server/package.json` pins `zod ^3.x` while the main app uses `^4.x`. Harmless while the two share no code, but a footgun if validation logic is ever shared. Bump mcp-server to zod 4 and adjust any v3-only API usage.
- Start: `mcp-server/package.json`.

### 5f — Unit Tests for lib/db-adapter.ts (S, medium)
Natural follow-on to 5c: `parseLabels`, `encodeLabels`, `parseBudgetArray`, `encodeBudgetArray`, `normalizeTx`, and `normalizeBudget` are pure functions guarding the SQLite/Postgres split (JSON-string vs native arrays, `excludeFromStats` coercion) with zero coverage — exactly the code a future schema tweak silently breaks. No jsdom or mocking needed; plain Vitest on the node environment.
- Start: new `lib/db-adapter.test.ts` (skip `getTrendRows`/`getDailyRows` — they need a DB; the pure helpers are the value).

### 5g — Keep `.github/copilot-instructions.md` Regenerated (S, low)
The auto-generated SigMap signature file was last regenerated 2026-06-03 — it predates the Prisma 7 / React 19 / Tailwind 4 / Vitest changes, so any tool consuming it sees stale signatures. Re-run `gen-context.js` and ideally wire it into a pre-commit hook or CI step so it can't drift; alternatively delete the file if nothing uses Copilot here.

---

## Security & Hygiene

### 6a — Rate-Limit `/api/sync` and `/api/export` (S, medium)
`/api/sync` accepts writes and `/api/export` serves up to 10,000-row CSVs with only a session check. Add a simple per-session rate limit covering both.
- Use `@upstash/ratelimit` (free tier) or a tiny in-memory token bucket.
- Note: as of Jul 2026, `/api/sync` now also validates `sessionVersion` (stale-JWT rejection), matching server actions.

### ~~6d — Validate `/api/export` Query Params~~ DONE
`month`/`year` are now range-checked (1–12 / 1970–9999, rejecting NaN) with a 400 response, `from`/`to` are date-validated the same way, and the `getTransactions` call is wrapped — `"Unauthorized"` (stale session) maps to 401, anything else to a 500 with a plain body instead of an unhandled exception.

### ~~6e — CSV Export Ignores Date-Range Filters~~ DONE
`handleExport` now forwards `from`/`to` and the route accepts them (same inclusive end-of-day semantics as the transactions page: `to` gets `T23:59:59.999`). When a range is active the filename reflects it (`expenses-<from>-to-<to>.csv`) instead of the month stamp.

### 6b — Sentry Error Reporting (S, medium)
No production error visibility. Sentry's free tier covers a single-user app.
- `npm install @sentry/nextjs`, add `sentry.client.config.ts` and `sentry.server.config.ts`.

### 6c — Backup / Export (S, low)
> **Superseded** — full plan: [features/26-json-backup-restore.md](features/26-json-backup-restore.md) (adds the restore half: versioned envelope, merge/replace modes, pending-sync-queue guard).

Monthly "Download backup JSON" button in settings (or a scheduled email).
- Server action `exportAllData()` that returns JSON of all transactions, categories, and recurring rules.

### ~~6f — Neon Deployment Docs Pointed at a Dead Env Var~~ DONE
DEPLOYMENT.md and the README both told Neon users to set a single `DATABASE_URL` — but since the SQLite-mode work, `lib/db.ts` reads that variable only as the SQLite switch (`startsWith("file:")`) and the Postgres adapter reads **only** `POSTGRES_PRISMA_URL`, so a by-the-book Neon deploy got an empty connection string at runtime. All four mentions rewritten to the `POSTGRES_*` pair (pooled `-pooler` host + direct), with an explicit warning not to use `DATABASE_URL` for Postgres.

### 6g — Repo Hygiene Sweep (S, low)
Accumulated cruft, all verified Jul 2026:
- `stat-cards-mobile.png` / `stat-cards-mobile-v2.png` — debug screenshots committed at the repo root in an old StatCard commit; delete.
- `course.html` — standalone "Full-Stack Course" page at the root; move to `docs/` if worth keeping, else delete.
- `.claude/skills/` and `.agents/skills/` are byte-identical duplicates (~65 files each, both tracked). If `skills-lock.json`'s installer doesn't require both, keep one.
- `.claude/settings.local.json` is committed — by convention it's machine-local and gitignored; merge the useful permission allowlist into `.claude/settings.json` and untrack.
- `@types/bcryptjs` is likely removable (`bcryptjs` 3.x bundles its own types); `@types/node` is `^20` while dev runs Node 24 — bump when next touching deps.

---

## Visualizations

New charts scoped in Jul 2026. Each is tagged with the view it belongs to (month / year / all-time / general). Pattern charts must respect the `excludeFromStats: false` filter — deriving from the already-filtered `dailyData`/`categoryData` gets this for free. (Exception: accounting charts like the wealth curve use the ledger basis — see the "Exclude from charts" section in CLAUDE.md for the split.)

### ~~7a — Cumulative Spend Pace Line~~ DONE — month view
`components/charts/PaceChart.tsx` (lazy-loaded): cumulative spend vs last month's curve (muted) vs a straight even-pace line to the month's spending cap, with an "RM X ahead of / under pace" badge. The cap prefers an `overall` budget, falling back to an `excluded`-type budget's amount (overall-minus-categories is still a month-wide cap); `category`/`label` budgets never draw the line. Spend is chart-basis (excludeFromStats filtered), consistent with `SpendingInsights`' burn rate. No extra fetch was needed — the prev-month `getDashboardData` call already returned `dailyData`; it's now passed down as the `prevDailyData` prop. In the current month the spend line stops at today. Snapshot note: the current-month plot changes daily, so the month full-page e2e test masks the whole card and the dedicated test uses a fixed past month.

### ~~7b — Category Month-over-Month Comparison~~ DONE (as delta badges) — month view
Shipped in `SpendingInsights`: each top-5 category bar now carries a MoM % delta badge (arrow up/down, rose/emerald) computed from `prevCategoryData` — the "which category moved" question is answered. The full paired/diverging-bars visualization with RM deltas ("Food +RM120") was deliberately not built; revisit only if the % badges prove insufficient.

### 7c — Cash-Flow Waterfall (M, medium) — month view
Income on the left, stepping down through top expense categories, ending at the month's balance — the month's story as one narrative. Recharts has no native waterfall; use the stacked-bar-with-transparent-base trick.
- Data: `categoryData` + income total, already in props.
- Start: new `components/charts/WaterfallChart.tsx`.

### 7d — Stacked Monthly Bars by Category (M, medium) — year view
Twelve bars stacked by top-5 categories + "Other", consistent colours across months. Shows composition drift ("subscriptions doubled since March"), which the year trend line hides.
- Needs a per-month `groupBy(["category"])` in the year branch of `_fetchDashboardData` with the `excludeFromStats: false` filter.
- Start: `lib/actions.ts`, new `components/charts/StackedMonthlyChart.tsx`.

### 7e — Savings Rate Trend (S, medium) — year view
> **Superseded** — full plan: [features/07-savings-rate-trend.md](features/07-savings-rate-trend.md) (settles on a separate small chart card, ledger basis, deriving from `initialWealthData`).

Line of `(income − expenses) / income` per month with a 0% reference line. The rate tracks financial health better than absolute numbers.
- **Partially covered**: the Net stat card now shows the current period's savings rate as its subtitle ("X% saved" / "X% overspent" — `savingsRate` in `useDashboardState`). The per-month *trend* line is still unbuilt.
- Pure client-side arithmetic over the year view's existing monthly totals (`wealthData`/`dailyData` buckets already carry per-month income and expense).
- Start: `hooks/useDashboardState.ts`, new sparkline in `components/StatCard.tsx` or a line in `MonthlyBarChart`'s tooltip.

### 7f — Fixed vs Variable Split (M, medium) — year view
> **Superseded** — full plan: [features/08-fixed-vs-discretionary.md](features/08-fixed-vs-discretionary.md) (upgrades the rule-matching approximation below to an explicit per-category `spendType` column).

Stacked area per month: spend from recurring rules (rent, subscriptions) vs everything else — shows what portion of spending is actually controllable. Approximation is fine: sum `toMonthlyAmount()` over active rules as the fixed band, or match transactions to rules by category + amount tolerance.
- Start: `lib/utils.ts` (`toMonthlyAmount` already exported), new chart component.

### ~~7g — Cumulative Net Balance "Wealth Curve"~~ DONE — all-time view
`components/charts/WealthCurve.tsx` (lazy-loaded): running net balance over the all-time monthly buckets, rendered as the hero chart directly below the stat cards in `?period=all`. Ledger basis since Jul 2026 (off-chart transactions count — a cumulative balance must reflect every real money movement): consumes the dedicated `initialWealthData` series fetched via `getRangeDashboardData(…, withWealthSeries: true)`. Headline figure is derived from the plotted data so it always matches the curve's endpoint; a dashed zero reference line appears if the balance ever goes negative.

### 7h — Year-over-Year Overlay (M, low — until 2+ years of data) — all-time view
> **Superseded** — full plan: [features/09-year-over-year.md](features/09-year-over-year.md) (adds YoY stat-card badges in the year view; keeps the defer-until-2-years advice — the component hides below 2 years of data).

Cumulative spend per year plotted Jan→Dec as overlaid lines (current year brighter). Catches seasonal comparisons ("am I spending more than last year at this point?") that MoM deltas miss.
- Same monthly data, pivoted by year client-side. Defer until a second year of data exists.

### 7i — Budget Burndown Mini-Chart (S, medium) — cross-view
> **Superseded** — full plan: [features/15-budget-history-burndown.md](features/15-budget-history-burndown.md) (adds the 6-month history strip and the lazy `getBudgetHistory` action alongside the sparkline below).

Small sparkline of remaining budget through the period inside each `BudgetProgress`. The bar says "70% used"; the burndown says "used it all in the first ten days."
- Budget spend is already computed client-side in `computeBudgetSpent` — derive the daily series with the same loop plus a date bucket.
- Start: `hooks/useDashboardState.ts`, `components/budgets/BudgetProgress.tsx`.

### ~~7j — Day-of-Week Spending Profile~~ DONE — year / all-time views
`components/charts/DayOfWeekChart.tsx` (lazy-loaded): Mon–Sun bars of average expense per weekday — each weekday's spend total ÷ how many times that weekday occurred between range start and today (so sparse spending days don't inflate the profile). Chart basis (`excludeFromStats` rows skipped); computed client-side from the range transactions (bounded to the 500 most recent — fine for a habit profile). Tooltip shows avg/day, total, and occurrence count. Rendered below the monthly bars in the year and all-time views only (a single month's sample is too small). Snapshot note: the occurrence denominators grow as days elapse, so the year/all-time full-page e2e tests mask the card and a dedicated test asserts the seven bars render.

### ~~7l — Off-Chart Overlay on "Income vs Expenses by Month"~~ DONE — year / all-time views
Expense bars stay chart-basis; each month's off-chart amount (`wealthData` minus `dailyData` per bucket, clamped ≥ 0) is stacked on top as a dimmer diagonally-hatched segment in `MonthlyBarChart`. Tooltip gains an "Off-chart" line (only when > 0) and Net subtracts it; a legend row ("Expenses" / "Off-chart") appears only when off-chart data exists, so months without flagged rows render pixel-identical to before. The year view now opts in via `getRangeDashboardData(…, withWealthSeries: true)` (the all-time view already fetched it); `DashboardContent` passes `initialWealthData` down. Recharts gotcha hit during implementation: `<Bar>` elements must be **direct** children of `<BarChart>` — wrapping the stacked pair in a React fragment silently drops them.

### ~~7k — Category Pie Chart~~ DONE — month view
Rebuilt as `components/charts/SpendingPieChart.tsx` (lazy-loaded, `ssr: false`): donut of top-6 categories + "Other", each category's stored colour (fallback `stringToColor`), HTML centre label with the chart-basis total (maskable via `amountMasks`). Slice **and** legend click (keyboard-accessible buttons) → `/transactions?month=&year=&category=X`. Rendered beside `PaceChart` in a second month-view charts row.
