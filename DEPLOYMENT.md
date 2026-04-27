# Deployment Guide

Deploy your personal Expense Tracker to Vercel + Neon (free tier) in ~10 minutes.

---

## 1. Set up a Postgres database (Neon — free)

1. Go to [neon.tech](https://neon.tech) and create a free account.
2. Create a new project → copy the **connection string** (starts with `postgresql://`).
3. Save it — you'll need it as `DATABASE_URL`.

> **Vercel Postgres** also works: create a Postgres store in your Vercel dashboard and copy its `POSTGRES_PRISMA_URL`.

---

## 2. Generate your password hash

Run this once in your terminal (Node.js required):

```bash
node -e "const b=require('bcryptjs'); b.hash('YOUR_PASSWORD_HERE', 12).then(h => console.log(h))"
```

Copy the output (it starts with `$2a$12$...`). This is your `ADMIN_PASSWORD_HASH`.

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

```env
DATABASE_URL="postgresql://user:pass@host/db?sslmode=require"
NEXTAUTH_SECRET="your-generated-secret"
NEXTAUTH_URL="http://localhost:3000"
ADMIN_EMAIL="you@example.com"
ADMIN_PASSWORD_HASH="$2a$12$..."
APP_USER_ID="default-user"
```

---

## 5. Run locally

```bash
npm install
npm run db:push       # Push schema to your database
npm run db:seed       # Seed default categories
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

Follow the prompts. When asked about environment variables, add them in the Vercel dashboard (step 6b).

### Option B — GitHub + Vercel dashboard

1. Push this project to a GitHub repo.
2. Go to [vercel.com](https://vercel.com) → **Add New Project** → import your repo.
3. Vercel auto-detects Next.js — no framework config needed.

### Add environment variables in Vercel

In your project's **Settings → Environment Variables**, add:

| Key | Value |
|-----|-------|
| `DATABASE_URL` | Your Neon connection string |
| `NEXTAUTH_SECRET` | Your generated secret |
| `NEXTAUTH_URL` | `https://your-app.vercel.app` |
| `ADMIN_EMAIL` | `you@example.com` |
| `ADMIN_PASSWORD_HASH` | `$2a$12$...` |
| `APP_USER_ID` | `default-user` |

> **Important:** Set `NEXTAUTH_URL` to your exact Vercel URL (e.g. `https://expense-tracker-abc123.vercel.app`).

### Run migrations on first deploy

After deploying, run the DB migration from your local machine (with the production `DATABASE_URL` set):

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

The app will behave like a native app with full-screen mode. Note: offline use is not supported — the app requires a network connection to reach the database.

---

## 8. Subsequent deployments

Push to GitHub → Vercel auto-deploys. No further steps needed.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| "ADMIN_PASSWORD_HASH not configured" | Check Vercel env vars are set |
| Can't sign in | Verify email matches `ADMIN_EMAIL` exactly (case-insensitive) |
| DB connection errors | Check `DATABASE_URL` includes `?sslmode=require` for Neon |
| Charts not rendering | Charts use `"use client"` — ensure no SSR mismatch |
| 500 on first load | Run `prisma migrate deploy` against production DB |

---

## Architecture: how sync works

```
Phone / Laptop / Tablet
        │
        │  HTTPS (Vercel Edge)
        ▼
  Next.js Server Actions
  (run on Vercel serverless)
        │
        │  Prisma ORM
        ▼
  Postgres Database (Neon)
  ← single source of truth →
```

- **Every write** (add/edit/delete) goes through a server action → directly to Postgres.
- **Every read** fetches from the same Postgres DB regardless of device.
- **Optimistic UI** updates the screen instantly while the server action runs in the background — input feels instant, data is real.
- **No websockets needed** — page data refreshes on navigation via Next.js `revalidatePath`.
