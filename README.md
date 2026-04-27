# Expense Tracker

A personal finance tracker built with Next.js 15, Prisma, and PostgreSQL. Track income and expenses with natural-language input, recurring transactions, offline support, and real-time charts — deployable to Vercel + Neon in minutes.

## Features

- **Natural-language input** — type `coffee 15 starbucks #work` and the parser extracts category, amount, and labels automatically
- **Income / expense toggle** — quick-add pill to override parser inference
- **Recurring transactions** — daily, weekly, monthly, or yearly rules with due/overdue status
- **Labels** — tag transactions with `#hashtag` syntax; filter by label on the transactions page
- **Charts** — spending breakdown by category via Recharts
- **Offline-first** — mutations queue to IndexedDB when offline and sync automatically on reconnect via Web BackgroundSync
- **PWA-ready** — installable on iOS/Android via Add to Home Screen
- **Single-user** — credential-based auth (bcrypt), no OAuth required

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript 5 |
| Database | PostgreSQL via Prisma 6 (Neon / Supabase / Vercel Postgres) |
| Auth | NextAuth v4 (credentials provider) |
| Charts | Recharts 2 |
| Styling | Tailwind CSS 3 |
| Offline | IndexedDB (`idb@8`) + Service Worker BackgroundSync |

## Prerequisites

- Node.js 18+
- A PostgreSQL database (free options: [Neon](https://neon.tech), [Supabase](https://supabase.com), Vercel Postgres)

## Getting Started

### 1. Clone and install

```bash
git clone <your-repo-url>
cd expense-tracker
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env.local
```

Then fill in `.env.local`:

```env
# PostgreSQL connection string (Neon, Supabase, etc.)
DATABASE_URL="postgresql://user:password@host/dbname?sslmode=require"

# Generate with: openssl rand -base64 32
NEXTAUTH_SECRET="your-secret-here"
NEXTAUTH_URL="http://localhost:3000"

# Your login credentials
ADMIN_EMAIL="you@example.com"
# Generate hash: node -e "const b=require('bcryptjs');b.hash('yourpassword',12).then(h=>console.log(h))"
ADMIN_PASSWORD_HASH="$2a$12$..."

# Stable identifier used as userId in the database — do not change after first run
APP_USER_ID="default-user"
```

### 3. Set up the database

```bash
npm run db:push    # Push schema (no migration history)
npm run db:seed    # Seed default categories
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

Click **Add Recurring** in the recurring card (between quick-add and stat cards). Set name, category, amount, frequency, and optional end date. When a rule is due or overdue it auto-expands. Click **Post** to create a transaction from it.

### Transactions page

Filter by date range, category, type, or label. Edit or delete any transaction inline.

## Deployment

### Vercel + Neon (recommended — free tier)

**1. Create a Neon database**

Go to [neon.tech](https://neon.tech), create a project, and copy the connection string.

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
| `DATABASE_URL` | Neon connection string |
| `NEXTAUTH_SECRET` | Generated secret |
| `NEXTAUTH_URL` | `https://your-app.vercel.app` |
| `ADMIN_EMAIL` | Your email |
| `ADMIN_PASSWORD_HASH` | bcrypt hash |
| `APP_USER_ID` | `default-user` |

**5. Run migrations on first deploy**

```bash
DATABASE_URL="your-neon-url" npx prisma migrate deploy
DATABASE_URL="your-neon-url" npm run db:seed
```

Or set the Vercel build command to:

```
prisma generate && prisma migrate deploy && next build
```

**6. Subsequent deploys**

Push to GitHub — Vercel auto-deploys. No extra steps needed.

### Install as PWA

On mobile, open the app URL in Safari (iOS) or Chrome (Android), tap **Share → Add to Home Screen**.

## Architecture

```
Browser / PWA
  │
  │  HTTPS
  ▼
Next.js App Router (Vercel serverless)
  │  Server Actions  →  lib/actions.ts
  │  REST endpoint   →  /api/sync (service worker only)
  │
  │  Prisma ORM
  ▼
PostgreSQL (Neon)
```

**Offline flow:**

1. Mutation made offline → written to IndexedDB with `pending` status + enqueued in `syncQueue`
2. Amber "Pending" badge shown in UI immediately (optimistic)
3. On reconnect → `SyncProvider` calls `drainQueue()` → POSTs each op to `/api/sync` in order → real IDs replace temp IDs
4. Service worker handles sync when the tab is closed via Web BackgroundSync

**Dashboard render pattern:**

The dashboard server component fetches all data, passes it as props to `DashboardContent` (client component), which manages optimistic state locally. Mutations update all affected state slices immediately — no waiting for server re-render.

## Project Structure

```
app/
  (auth)/login/          # Login page
  (dashboard)/
    error.tsx            # Dashboard error boundary
    dashboard/           # Main dashboard (server component + DashboardContent client)
      loading.tsx        # Loading skeleton
    transactions/        # Transactions page (fully client-side)
      loading.tsx        # Loading skeleton
  api/sync/              # REST endpoint for BackgroundSync SW
  global-error.tsx       # Root-level error boundary
  not-found.tsx          # Custom 404 page
components/
  DashboardContent.tsx   # Central client component, owns optimistic state
  ExpenseInput.tsx       # Quick-add bar with Exp/Inc toggle
  TransactionList.tsx    # Transaction rows with inline edit/delete
  SyncStatusBar.tsx      # Offline/syncing banner
  recurring/             # RecurringList, RecurringRow, RecurringForm
context/
  SyncProvider.tsx       # Online state, pending count, SW registration
hooks/
  useOnlineStatus.ts     # navigator.onLine + event listeners
lib/
  actions.ts             # All server actions (single DB access point)
  idb.ts                 # IndexedDB singleton (transactions + syncQueue)
  sync.ts                # applyLocalMutation, drainQueue, seedIDBFromServer
  parser.ts              # Natural-language input parser
  utils.ts               # formatCurrency, recurring status helpers
prisma/
  schema.prisma          # Transaction, Category, RecurringTransaction models
public/
  sw.js                  # Service worker (cache-first static, BackgroundSync)
```

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Can't sign in | Check `ADMIN_EMAIL` matches exactly (case-insensitive) and `ADMIN_PASSWORD_HASH` is set |
| `ADMIN_PASSWORD_HASH not configured` | Env var missing in Vercel settings |
| DB connection errors | Ensure `DATABASE_URL` includes `?sslmode=require` for Neon |
| 500 on first load | Run `prisma migrate deploy` against your production DB |
| Charts not rendering | Clear browser cache; ensure no SSR/client hydration mismatch |
| Offline sync not working | Check browser supports BackgroundSync; inspect `syncQueue` in DevTools → Application → IndexedDB |

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit your changes
4. Push and open a pull request

There is no test suite yet — contributions that add one are welcome.

## License

MIT
