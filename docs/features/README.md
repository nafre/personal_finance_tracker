# Feature Roadmap — ideas adapted from other finance apps

A curated set of 35 features borrowed from established finance/expense apps (YNAB, Monarch, Copilot, PocketGuard, Actual Budget, Firefly III, Lunch Money, Spendee, Money Manager) and adapted to this app's architecture. Every feature is **self-contained**: implementable with the current stack (Next.js 16 App Router, Prisma 7 dual-dialect Postgres/SQLite, NextAuth, SWR, Recharts, IndexedDB offline sync, Vercel hosting) plus free browser/platform APIs (Web Push with self-generated VAPID keys, Vercel Cron). No paid APIs, no bank aggregators.

Each feature has its own file following a fixed template: **Summary & inspiration → UX design → Data model → Server layer → Client layer → Offline considerations → Edge cases & interactions → Testing → Effort & risk**. Data-model sections always cover both `prisma/schema.prisma` and `prisma/schema.sqlite.prisma` (SQLite stores arrays as JSON strings via the `lib/db-adapter.ts` helpers). Features that overlap an open item in `docs/IMPROVEMENTS_BACKLOG.md` cite it and expand it into a full plan — treat the doc here as the authoritative version.

## A. Analytics & insights

| # | Feature | Inspired by | Effort | Depends on | Backlog |
|---|---------|-------------|--------|------------|---------|
| [01](01-bills-calendar.md) | Bills & recurring calendar | Monarch, Money Manager | M | — | — |
| [02](02-cashflow-forecast.md) | Cash-flow forecast & runway | Copilot, PocketGuard | M | — | 4b |
| [03](03-spending-heatmap.md) | Spending heatmap calendar | GitHub, Spendee | S | — | 4d |
| [04](04-category-drilldown.md) | Category drilldown page | Monarch, Lunch Money | M | — | 4c |
| [05](05-monthly-report.md) | Monthly report / month in review | Copilot | M | — | — |
| [06](06-anomaly-detection.md) | Anomaly & large-transaction flags | Copilot, Monarch | M | — | — |
| [07](07-savings-rate-trend.md) | Savings-rate trend chart | YNAB reports | S | — | 7e |
| [08](08-fixed-vs-discretionary.md) | Fixed vs discretionary split | Copilot needs/wants | M | — | 7f |
| [09](09-year-over-year.md) | Year-over-year comparison | Lunch Money | S | — | 7h |
| [10](10-merchant-analytics.md) | Merchant / note analytics | Monarch merchants | S | — | — |

## B. Budgeting & goals

| # | Feature | Inspired by | Effort | Depends on | Backlog |
|---|---------|-------------|--------|------------|---------|
| [11](11-savings-goals.md) | Savings goals | Monarch, Wallet | L | — | — |
| [12](12-budget-rollover.md) | Budget rollover (envelopes) | YNAB, Actual Budget | L | — | — |
| [13](13-sinking-funds.md) | Sinking funds | YNAB "true expenses" | M | 11 | — |
| [14](14-budget-alerts.md) | Budget threshold alerts | PocketGuard, Mint | S | — | — |
| [15](15-budget-history-burndown.md) | Budget history & burndown | YNAB, Actual | M | — | 7i |
| [16](16-auto-budget-suggestions.md) | Auto-budget suggestions | Monarch | S | — | — |
| [17](17-safe-to-spend.md) | Safe-to-spend number | PocketGuard | M | — | — |

## C. Data & automation

| # | Feature | Inspired by | Effort | Depends on | Backlog |
|---|---------|-------------|--------|------------|---------|
| [18](18-csv-import.md) | CSV import with mapping & dedup | Actual, Firefly III | L | — | 1l |
| [19](19-rules-engine.md) | Auto-categorization rules engine | Firefly III | L | 18 (soft) | — |
| [20](20-transaction-templates.md) | Transaction templates / favorites | Money Manager | M | — | 1k |
| [21](21-auto-post-recurring.md) | Auto-post recurring (cron) | subscription trackers | M | — | 1m |
| [22](22-duplicate-detection.md) | ~~Duplicate detection~~ **DONE** (Jul 2026) | Monarch | S | — | 1h |
| [23](23-bulk-edit.md) | Bulk select & bulk edit | Lunch Money | M | — | 1e |
| [24](24-split-transactions.md) | Split transactions | YNAB, Spendee | L | — | — |
| [25](25-receipt-attachments.md) | Receipt / photo attachments | Spendee, Wallet | L | — | — |
| [26](26-json-backup-restore.md) | Full JSON backup & restore | Actual Budget | M | — | 6c |
| [27](27-undo-delete.md) | ~~Undo delete~~ **DONE** (Jul 2026) | Monarch, Gmail | S | — | 1f |

## D. UX & PWA polish

| # | Feature | Inspired by | Effort | Depends on | Backlog |
|---|---------|-------------|--------|------------|---------|
| [28](28-theme-toggle.md) | Light/dark theme toggle | table stakes | L | — | — |
| [29](29-pwa-install.md) | PWA install prompt + app shortcuts | native-app parity | S | — | — |
| [30](30-web-push.md) | Web Push notifications | PocketGuard, banks | L | 21, 14 | — |
| [31](31-command-palette.md) | Command palette & global search | Linear, Raycast | M | 32 (soft) | — |
| [32](32-better-search-filters.md) | ~~Better search & filters~~ **DONE** (Jul 2026) | Lunch Money | S | — | — |
| [33](33-privacy-mode.md) | ~~Privacy mode (blur amounts)~~ **DONE** (Jul 2026) | bank apps | S | — | — |
| [34](34-math-expressions.md) | ~~Math expressions in quick-add~~ **DONE** (Jul 2026) | Actual Budget | S | — | — |
| [35](35-swipe-actions.md) | Swipe actions on mobile rows | iOS Mail, Spendee | M | — | — |

## Suggested build order

**Phase 1 — quick wins (all S, no schema changes):**
~~34 math expressions~~ (DONE Jul 2026) → ~~33 privacy mode~~ → ~~32 better search/filters~~ → ~~27 undo delete~~ → ~~22 duplicate detection~~ (all four DONE Jul 2026; 33/27 gained on/off switches in a new Settings → Preferences tab) → 29 PWA install → 03 heatmap → 07 savings-rate trend → 16 auto-budget suggestions → 09 YoY (deferred until 2+ years of data exist).

**Phase 2 — automation foundations:**
21 auto-post cron (unlocks server-side scheduling) → 14 budget alerts → 20 templates → 18 CSV import → 19 rules engine (reuses import's batch path) → 23 bulk edit (reuses rules' batch mutations).

**Phase 3 — analytics layer:**
02 forecast/runway → 06 anomaly flags → 10 merchant analytics → 04 category drilldown → 15 budget history/burndown → 08 fixed vs discretionary → 01 bills calendar → 05 monthly report (crowns the analytics work).

**Phase 4 — flagships (schema-heavy or app-wide):**
11 savings goals → 13 sinking funds → 17 safe-to-spend → 12 budget rollover → 24 split transactions → 25 attachments → 26 JSON backup/restore → 30 web push (needs 21 + 14) → 31 command palette → 35 swipe actions → 28 theme toggle (last: touches every component and re-baselines all 91 visual snapshots).

**Dependency chains to respect:**
- Rules engine (19) ← CSV import (18): import's preview pipeline is where rules get applied in bulk first.
- Sinking funds (13) and safe-to-spend (17) build on the Goals model (11) and recurring commitments respectively.
- Web push (30) is only useful once there is something to push: cron-posted bills (21) and budget alerts (14).
- Command palette (31) reuses the multi-field search from (32).

## Conventions every implementation must follow

- **Mutations** live in `lib/actions.ts`, Zod-validated via `lib/validation.ts`, and call `revalidatePath("/dashboard")` + `revalidatePath("/transactions")` (never `revalidatePath("/")`).
- **Dual dialect**: every schema change lands in both `prisma/schema.prisma` and `prisma/schema.sqlite.prisma`; array/JSON fields go through `lib/db-adapter.ts` (`parseLabels`-style helpers); raw SQL goes through `getTrendRows`/`getDailyRows`-style adapter functions.
- **Dashboard state**: new dashboard data flows server page → `initial*` prop → `hooks/useDashboardState.ts`; optimistic handlers must respect the ledger/chart basis split (`excludeFromStats`).
- **Read-only past months** (`readOnlyMonth`): today-anchored affordances hide on historical months.
- **Demo role**: mutating settings features must be disabled for `role === "demo"`.
- **Dialogs** use `hooks/useDialogBehavior.ts` + `role="dialog"` + `aria-modal`; destructive actions use inline two-step confirm.
- **Testing** (mandatory workflow): pure logic gets Vitest tests in `lib/*.test.ts`; every new component/page gets a Playwright visual test in `e2e/` with a `data-testid` on its root container and `amountMasks(page)` over currency; run `npm run test:ui` after every UI change.
