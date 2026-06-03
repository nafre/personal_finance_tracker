# Expense Tracker

A personal finance tracker built with Next.js 16, Prisma, and PostgreSQL. Track income and expenses with natural-language input, recurring transactions, budgets, CSV export, offline support, and real-time charts — deployable to Vercel + Supabase/Neon in minutes.

## Features

- **Natural-language input** — type `coffee 15 starbucks #work` and the parser extracts category, amount, and labels automatically
- **Income / expense toggle** — quick-add pill to override parser inference
- **Recurring transactions** — daily, weekly, monthly, or yearly rules with due/overdue status
- **Labels** — tag transactions with `#hashtag` syntax; filter by label on the transactions page
- **Budgets** — per-category monthly budget targets with progress bars and over-budget alerts
- **Charts** — daily income/expense area chart and category spending breakdown via Recharts
- **CSV export** — download filtered transactions as a CSV file from the transactions page
- **Spending insights** — burn-rate analysis and daily average spending card
- **Month navigation** — browse any historical month via prev/next arrows on the dashboard
- **Offline-first** — mutations queue to IndexedDB when offline and sync automatically on reconnect via Web BackgroundSync
- **PWA-ready** — installable on iOS/Android via Add to Home Screen
- **Multi-user** — admin-controlled account creation; roles: `admin`, `user`, `demo`
- **SQLite local dev** — no Supabase credentials required; set `DATABASE_URL=file:./dev.db` to use SQLite

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript 5 |
| Database | PostgreSQL via Prisma 6 (Supabase / Neon / Vercel Postgres) or SQLite (local dev) |
| Auth | NextAuth v4 (credentials provider) |
| Data fetching | SWR 2 |
| Charts | Recharts 2 |
| Styling | Tailwind CSS 3 |
| Validation | Zod 4 |
| Offline | IndexedDB (`idb@8`) + Service Worker BackgroundSync |

## Prerequisites

- Node.js 18+
- A PostgreSQL database (free options: [Supabase](https://supabase.com), [Neon](https://neon.tech), Vercel Postgres) — or skip entirely and use SQLite for local development

## Getting Started

### 1. Clone and install

```bash
git clone https://github.com/nafre/personal_finance_tracker.git
cd expense-tracker
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env.local
```

Then fill in `.env.local`:

**Option A — Supabase / Neon (PostgreSQL):**

```env
# Pooled connection (pgbouncer) — from Supabase-Vercel integration
POSTGRES_PRISMA_URL="postgresql://user:password@host/dbname?pgbouncer=true"
# Direct connection — used by db:push / db:migrate
POSTGRES_URL_NON_POOLING="postgresql://user:password@host/dbname"

# Generate with: openssl rand -base64 32
NEXTAUTH_SECRET="your-secret-here"
NEXTAUTH_URL="http://localhost:3000"

# Your login credentials
ADMIN_EMAIL="you@example.com"
# Bootstrap hash (used on first login — change password later via Settings → Account)
# Generate: node -e "const b=require('bcryptjs');b.hash('yourpassword',12).then(h=>console.log(h))"
ADMIN_PASSWORD_HASH="$2a$12$..."

# Stable identifier used as userId in the database — do not change after first run
APP_USER_ID="default-user"
```

**Option B — SQLite (no cloud DB needed):**

```env
DATABASE_URL="file:./dev.db"
NEXTAUTH_SECRET="your-secret-here"
NEXTAUTH_URL="http://localhost:3000"
ADMIN_EMAIL="you@example.com"
ADMIN_PASSWORD_HASH="$2a$12$..."
APP_USER_ID="default-user"
```

### 3. Set up the database

**PostgreSQL:**

```bash
npm run db:push    # Push schema (no migration history)
npm run db:seed    # Seed default categories
```

**SQLite:**

```bash
npm run db:dev:push      # Push SQLite schema to dev.db
npm run db:dev:seed      # Seed default categories
```

### 4. Start the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and log in.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Generate Prisma client + build for production |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run db:push` | Push Prisma schema to DB (no migration history) |
| `npm run db:migrate` | Deploy pending migrations |
| `npm run db:studio` | Open Prisma Studio (DB GUI) |
| `npm run db:seed` | Seed default categories |
| `npm run db:dev:generate` | Generate Prisma client for SQLite schema |
| `npm run db:dev:push` | Push SQLite schema to `dev.db` |
| `npm run db:dev:studio` | Open Prisma Studio for SQLite DB |
| `npm run db:dev:seed` | Seed SQLite DB |
| `npm run test:ui` | Run Playwright visual regression tests |
| `npm run test:ui:update` | Regenerate snapshot baselines |
| `npm run test:ui:report` | Open the Playwright HTML report |

## Usage

### Adding transactions

Type into the quick-add bar using natural language:

```
coffee 15            → RM15 expense, category "Food"
salary 3000 income   → RM3000 income
groceries 80 #date   → RM80 expense with label "date"
```

- The **Exp / Inc** toggle pill forces the transaction type regardless of what the parser infers.
- Labels use `#tag` syntax and can be added/removed later via inline edit.

### Recurring transactions

Click **Add Recurring** in the recurring card (between the quick-add bar and stat cards). Set name, category, amount, frequency, and optional end date. When a rule is due or overdue it auto-expands. Click **Post** to record a transaction from it, or **Skip** to advance to the next period without recording a charge.

### Budgets

Click **Manage Budgets** on the dashboard to set per-category monthly limits. Each category shows a progress bar, with "remaining" or "over budget" feedback below it.

### Transactions page

Filter by date range, category, type, or label. Edit or delete any transaction inline. Use **Export CSV ↓** to download the current filtered view.

### Settings

- **Categories** — manage custom categories with emoji icons and colour pickers
- **Account** — change your password
- **Users** (admin only) — create, reset passwords, and delete user accounts

## Deployment

### Vercel + Supabase (recommended)

**1. Create a Supabase project**

Go to [supabase.com](https://supabase.com), create a project. Under **Project Settings → Database**, copy the **Connection string** (Transaction mode / pgbouncer) for `POSTGRES_PRISMA_URL` and the direct connection string for `POSTGRES_URL_NON_POOLING`.

Alternatively, use the **Vercel-Supabase integration** to have Vercel inject both variables automatically.

**2. Generate credentials**

```bash
# NextAuth secret
openssl rand -base64 32

# Password hash
node -e "const b=require('bcryptjs');b.hash('YOUR_PASSWORD',12).then(h=>console.log(h))"
```

**3. Deploy to Vercel**

```bash
npm i -g vercel
vercel
```

Or push to GitHub and import the repo in the [Vercel dashboard](https://vercel.com).

**4. Add environment variables**

In **Vercel → Settings → Environment Variables**:

| Variable | Value |
|----------|-------|
| `POSTGRES_PRISMA_URL` | Supabase pooled connection string (pgbouncer) |
| `POSTGRES_URL_NON_POOLING` | Supabase direct connection string |
| `NEXTAUTH_SECRET` | Generated secret |
| `NEXTAUTH_URL` | `https://your-app.vercel.app` |
| `ADMIN_EMAIL` | Your email |
| `ADMIN_PASSWORD_HASH` | Initial bcrypt hash (bootstrap only) |
| `APP_USER_ID` | `default-user` |

**5. Run migrations on first deploy**

```bash
POSTGRES_URL_NON_POOLING="your-direct-url" npx prisma migrate deploy
POSTGRES_URL_NON_POOLING="your-direct-url" npm run db:seed
```

Or set the Vercel build command to:

```
prisma generate && prisma migrate deploy && next build
```

**6. Subsequent deploys**

Push to GitHub — Vercel auto-deploys. No extra steps needed.

### Vercel + Neon (alternative free tier)

Same steps, but use a single `DATABASE_URL` from [neon.tech](https://neon.tech). Set `DATABASE_URL` in Vercel env vars in place of the Supabase pair.

### Install as PWA

On mobile, open the app URL in Safari (iOS) or Chrome (Android), tap **Share → Add to Home Screen**. The app is offline-capable — transactions made without a network connection are queued and synced automatically when connectivity is restored.

## Architecture

```
Browser / PWA
  │
  │  HTTPS
  ▼
Next.js App Router (Vercel serverless)
  │  Server Actions  →  lib/actions.ts
  │  REST endpoint   →  /api/sync (service worker only)
  │  REST endpoint   →  /api/export (CSV download)
  │
  │  Prisma ORM
  ▼
PostgreSQL (Supabase / Neon)
```

**Offline flow:**

1. Mutation made offline → written to IndexedDB with `pending` status + enqueued in `syncQueue`
2. Amber "Pending" badge shown in UI immediately (optimistic)
3. On reconnect → `SyncProvider` calls `drainQueue()` → POSTs each op to `/api/sync` in order → real IDs replace temp IDs
4. Service worker handles sync when the tab is closed via Web BackgroundSync

**Dashboard render pattern:**

The dashboard server component fetches all data, passes it as props to `DashboardContent` (client component). All state, effects, and mutation handlers live in `hooks/useDashboardState.ts`. Mutations update all affected state slices immediately — no waiting for server re-render.

## Project Structure

```
app/
  (auth)/login/          # Login page
  (dashboard)/
    error.tsx            # Dashboard error boundary
    dashboard/           # Main dashboard (server component + DashboardContent client)
      loading.tsx        # Loading skeleton
    settings/            # Settings page (Categories, Account, Users tabs)
      loading.tsx        # Loading skeleton
    transactions/        # Transactions page (fully client-side)
      loading.tsx        # Loading skeleton
  api/
    sync/                # REST endpoint for BackgroundSync SW
    export/              # REST endpoint for CSV download
  global-error.tsx       # Root-level error boundary
  not-found.tsx          # Custom 404 page
components/
  DashboardContent.tsx   # Thin client orchestrator, calls useDashboardState
  StatCard.tsx           # Stat card with gradient background and MoM delta badge
  ExpenseInput.tsx       # Quick-add bar with Exp/Inc toggle
  TransactionList.tsx    # Transaction rows with inline edit/delete, label badges
  SyncStatusBar.tsx      # Offline/syncing banner
  SpendingInsights.tsx   # Burn-rate analysis card
  MonthSelector.tsx      # Month/year navigation control
  NavBar.tsx             # Top navigation bar
  QuickAddSheet.tsx      # Mobile bottom-sheet quick-add
  CategoryCombobox.tsx   # Searchable category dropdown with icon support
  CategoryManager.tsx    # Settings category list with inline edit
  ChangePasswordForm.tsx # Account password change form
  SettingsTabs.tsx       # Tab bar wrapping all settings sections
  UserManager.tsx        # Admin-only user list and create form
  DemoBanner.tsx         # Demo-role notice banner
  MainWrapper.tsx        # Sidebar-aware layout shell
  TopLoadingBar.tsx      # Top progress bar for navigations
  DashboardErrorBoundary.tsx  # Error boundary for dashboard sections
  budgets/
    BudgetManager.tsx    # Budget list + create/edit form
    BudgetProgress.tsx   # Progress bar with remaining/over-budget label
  charts/
    SpendingPieChart.tsx # Category spending pie chart
    TrendChart.tsx       # Daily income/expense area chart
  recurring/
    RecurringList.tsx    # Recurring rules list, owns local state
    RecurringRow.tsx     # Individual rule: status badge, Post/Skip/Edit/Delete
    RecurringForm.tsx    # Create/edit form for recurring rules
context/
  SyncProvider.tsx       # Online state, pending count, SW registration
  SidebarContext.tsx     # Sidebar open/close state
hooks/
  useDashboardState.ts   # All dashboard state, effects, memos, and handlers
  useOnlineStatus.ts     # navigator.onLine + event listeners
lib/
  actions.ts             # All server actions (single DB access point)
  db-adapter.ts          # SQLite/Postgres dialect abstraction
  idb.ts                 # IndexedDB singleton (transactions + syncQueue)
  sync.ts                # applyLocalMutation, drainQueue, reconcileAfterSync
  parser.ts              # Natural-language input parser
  validation.ts          # Zod schemas for all mutations
  utils.ts               # formatCurrency, recurring status helpers
  auth.ts                # NextAuth config + bootstrap logic
  db.ts                  # Prisma client singleton
types/
  index.ts               # Shared TypeScript interfaces
prisma/
  schema.prisma          # PostgreSQL: User, Transaction, Category, RecurringTransaction
  schema.sqlite.prisma   # SQLite-compatible variant
e2e/
  dashboard.spec.ts      # Dashboard visual regression tests
  transactions.spec.ts   # Transactions page visual regression tests
  login.spec.ts          # Login page visual regression tests
  settings.spec.ts       # Settings page visual regression tests
  helpers.ts             # Shared test helpers (amountMasks, waitForReady)
public/
  sw.js                  # Service worker (cache-first static, BackgroundSync)
```

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Can't sign in | Check `ADMIN_EMAIL` matches exactly (case-insensitive) and `ADMIN_PASSWORD_HASH` is set |
| `ADMIN_PASSWORD_HASH not configured` | Env var missing in Vercel settings |
| DB connection errors | Ensure `POSTGRES_PRISMA_URL` includes `?pgbouncer=true` for Supabase; Neon needs `?sslmode=require` |
| 500 on first load | Run `prisma migrate deploy` against your production DB |
| Charts not rendering | Clear browser cache; ensure no SSR/client hydration mismatch |
| Offline sync not working | Check browser supports BackgroundSync; inspect `syncQueue` in DevTools → Application → IndexedDB |
| Visual regression tests fail | Run `npm run test:ui:update` to regenerate baselines after intentional UI changes |

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit your changes
4. Push and open a pull request

Visual regression tests live in `e2e/` and run with `npm run test:ui`. Update snapshots with `npm run test:ui:update` after intentional design changes.

## License

MIT
