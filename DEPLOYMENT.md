# Deployment Guide

Deploy your Expense Tracker to Vercel + Supabase (or Neon) — free tier — in ~10 minutes.

---

## 1. Set up a Postgres database

### Option A — Supabase (recommended)

1. Go to [supabase.com](https://supabase.com) and create a free account.
2. Create a new project.
3. Go to **Project Settings → Database → Connection string**.
4. Copy the **Transaction mode** (pgbouncer) string — this is your `POSTGRES_PRISMA_URL`.
5. Copy the **Session mode** (direct) string — this is your `POSTGRES_URL_NON_POOLING`.

> **Vercel-Supabase integration:** Connect your Vercel project to Supabase in the Vercel dashboard and both variables are injected automatically.

### Option B — Neon (alternative free tier)

1. Go to [neon.tech](https://neon.tech) and create a free account.
2. Create a new project → copy the **connection string** (starts with `postgresql://`).
3. Use this as a single `DATABASE_URL` environment variable (no pooled/direct split needed).

---

## 2. Generate your password hash

Run this once in your terminal (Node.js required):

```bash
node -e "const b=require('bcryptjs'); b.hash('YOUR_PASSWORD_HERE', 12).then(h => console.log(h))"
```

Copy the output (it starts with `$2a$12$...`). This is your `ADMIN_PASSWORD_HASH`.

> After your first login you can change your password at any time via **Settings → Account**. The new hash is stored in the database, so you do not need to update `ADMIN_PASSWORD_HASH` in your platform environment variables.

---

## 3. Generate a NextAuth secret

```bash
openssl rand -base64 32
```

Save the output as `NEXTAUTH_SECRET`.

---

## 4. Create your local `.env` file

Copy `.env.example` to `.env.local` and fill in your values:

```bash
cp .env.example .env.local
```

**Supabase setup:**

```env
POSTGRES_PRISMA_URL="postgresql://user:pass@host/db?pgbouncer=true"
POSTGRES_URL_NON_POOLING="postgresql://user:pass@host/db"
NEXTAUTH_SECRET="your-generated-secret"
NEXTAUTH_URL="http://localhost:3000"
ADMIN_EMAIL="you@example.com"
ADMIN_PASSWORD_HASH="$2a$12$..."
APP_USER_ID="default-user"
```

**SQLite (no cloud DB — local dev only):**

```env
DATABASE_URL="file:./dev.db"
NEXTAUTH_SECRET="your-generated-secret"
NEXTAUTH_URL="http://localhost:3000"
ADMIN_EMAIL="you@example.com"
ADMIN_PASSWORD_HASH="$2a$12$..."
APP_USER_ID="default-user"
```

---

## 5. Run locally

**PostgreSQL:**

```bash
npm install
npm run db:push       # Push schema to your database
npm run db:seed       # Seed default categories
npm run dev           # Start dev server at http://localhost:3000
```

**SQLite:**

```bash
npm install
npm run db:dev:push   # Push SQLite schema to dev.db
npm run db:dev:seed   # Seed default categories
npm run dev           # Start dev server at http://localhost:3000
```

Open [http://localhost:3000](http://localhost:3000) and log in with your email + password.

---

## 6. Deploy to Vercel

### Option A — Vercel CLI

```bash
npm i -g vercel
vercel
```

Follow the prompts. Add environment variables in the Vercel dashboard (step 6b).

### Option B — GitHub + Vercel dashboard

1. Push this project to a GitHub repo.
2. Go to [vercel.com](https://vercel.com) → **Add New Project** → import your repo.
3. Vercel auto-detects Next.js — no framework config needed.

### Add environment variables in Vercel

In your project's **Settings → Environment Variables**, add:

**Supabase:**

| Key | Value |
|-----|-------|
| `POSTGRES_PRISMA_URL` | Supabase pooled connection string (pgbouncer) |
| `POSTGRES_URL_NON_POOLING` | Supabase direct connection string |
| `NEXTAUTH_SECRET` | Your generated secret |
| `NEXTAUTH_URL` | `https://your-app.vercel.app` |
| `ADMIN_EMAIL` | `you@example.com` |
| `ADMIN_PASSWORD_HASH` | `$2a$12$...` |
| `APP_USER_ID` | `default-user` |

**Neon (alternative):**

| Key | Value |
|-----|-------|
| `DATABASE_URL` | Neon connection string |
| `NEXTAUTH_SECRET` | Your generated secret |
| `NEXTAUTH_URL` | `https://your-app.vercel.app` |
| `ADMIN_EMAIL` | `you@example.com` |
| `ADMIN_PASSWORD_HASH` | `$2a$12$...` |
| `APP_USER_ID` | `default-user` |

> **Important:** Set `NEXTAUTH_URL` to your exact Vercel URL (e.g. `https://expense-tracker-abc123.vercel.app`).

### Run migrations on first deploy

After deploying, run the DB migration from your local machine:

**Supabase:**

```bash
POSTGRES_URL_NON_POOLING="your-direct-url" npx prisma migrate deploy
POSTGRES_URL_NON_POOLING="your-direct-url" npm run db:seed
```

**Neon:**

```bash
DATABASE_URL="your-neon-url" npx prisma migrate deploy
DATABASE_URL="your-neon-url" npm run db:seed
```

Or use Vercel's **Build Command** override:

```
prisma generate && prisma migrate deploy && next build
```

---

## 7. Install as PWA (optional)

On mobile (iOS/Android):
- Open the app URL in Safari/Chrome
- Tap **Share → Add to Home Screen**

The app will behave like a native app with full-screen mode. It is **offline-capable** — transactions created without a network connection are queued to IndexedDB and automatically synced when connectivity is restored. The service worker handles background sync even when the tab is closed.

---

## 8. Subsequent deployments

Push to GitHub → Vercel auto-deploys. No further steps needed.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| "ADMIN_PASSWORD_HASH not configured" | Check Vercel env vars are set |
| Can't sign in | Verify email matches `ADMIN_EMAIL` exactly (case-insensitive) |
| DB connection errors | Supabase: ensure `POSTGRES_PRISMA_URL` includes `?pgbouncer=true`. Neon: ensure `DATABASE_URL` includes `?sslmode=require` |
| Charts not rendering | Charts use `"use client"` with `dynamic({ ssr: false })` — ensure no SSR mismatch |
| 500 on first load | Run `prisma migrate deploy` against production DB |
| Offline sync not working | Check browser supports BackgroundSync; inspect `syncQueue` in DevTools → Application → IndexedDB |

---

## Architecture

```
Phone / Laptop / Tablet (Browser / PWA)
        │
        │  HTTPS (Vercel Edge)
        ▼
  Next.js Server Actions    ← mutations (add/update/delete)
  (run on Vercel serverless)
        │  Prisma ORM
        ▼
  Postgres Database (Supabase / Neon)
  ← single source of truth →

IndexedDB (in-browser)      ← offline queue + local mirror
        │
        │  /api/sync (REST, used by service worker)
        ▼
  Same Postgres Database    ← synced on reconnect
```

- **Every write** (add/edit/delete) goes through a server action → directly to Postgres.
- **Offline writes** are queued to IndexedDB and POST-ed to `/api/sync` on reconnect (or by the service worker via BackgroundSync).
- **Optimistic UI** updates the screen instantly while the server action runs — input feels immediate, data is real.
- **No websockets needed** — page data refreshes on navigation via Next.js `revalidatePath`.
- **CSV export** — `GET /api/export` streams filtered transactions as a CSV attachment.
