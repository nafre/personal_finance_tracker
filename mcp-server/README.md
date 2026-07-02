# Expense Tracker — Finance MCP server

A small, **read-only** [MCP](https://modelcontextprotocol.io) server that exposes
your Expense Tracker data to Claude so you can ask things like _"how am I doing
this month?"_ or run the **Review my finances** prompt and get specific feedback.

It reuses the same aggregation logic as the app's dashboard, scoped to a single
user, over a read-only Postgres connection — it **cannot modify your data**.

One codebase, two transports:

- **stdio** (`stdio.ts`) — runs locally, driven by Claude Desktop. No hosting, no
  auth, DB credentials stay on your machine. **Start here.**
- **HTTP** (`http.ts`) — Streamable HTTP for Render, so Claude.ai web/mobile can
  reach it. Requires real auth (see Phase 2).

## Tools

| Tool | What it returns |
|------|-----------------|
| `get_financial_overview` | income, expenses, net, savings rate, txn count, top category |
| `get_spending_by_category` | per-category expense totals + % share |
| `get_spending_trend` | income/expense bucketed by day or month |
| `list_recent_transactions` | line items (filter by category/label, ≤100) |
| `get_budgets_status` | per-budget limit vs spent vs remaining (a calendar month) |
| `get_recurring_commitments` | recurring income/expenses normalized to monthly |

Plus a **`review_finances`** prompt that orchestrates the above and asks Claude
for actionable feedback. All amounts are MYR (RM).

> Periods: `this_month`, `last_month`, `this_year`, `last_year`, `all_time`, or
> `custom` with `from`/`to` (YYYY-MM-DD). Boundaries are computed in **UTC** to
> match the Vercel-hosted app exactly.

---

## 1. Create a read-only DB role (Supabase → SQL Editor)

```sql
create role claude_ro login password '<strong-password>';
grant connect on database postgres to claude_ro;
grant usage on schema public to claude_ro;
grant select on public.transactions, public.categories,
                public.budgets, public.recurring_transactions to claude_ro;
```

Build its **pooled** connection string (same host/port as the app's
`POSTGRES_PRISMA_URL`, but with the new role):

```
postgres://claude_ro:<password>@aws-1-<region>.pooler.supabase.com:6543/postgres?sslmode=require&pgbouncer=true
```

## 2. Install & build

```bash
cd mcp-server
npm install
npm run build
```

Configure env (copy `.env.example` → `.env` for local runs, or set in your
Claude Desktop config below):

- `DATABASE_READONLY_URL` — the read-only URL from step 1
- `EXPENSE_USER_ID` — your app `APP_USER_ID` (default `default-user`)

## 3. Try it with MCP Inspector

```bash
npm run inspect
```

Open the Inspector UI, list tools, and call `get_financial_overview` with
`period = this_month`. Cross-check the totals against your app dashboard for the
same month — they should match.

## 4. Connect Claude Desktop (Phase 1, local stdio)

Add to `claude_desktop_config.json` (Settings → Developer → Edit Config):

```json
{
  "mcpServers": {
    "expense-tracker": {
      "command": "node",
      "args": ["C:\\Users\\Erfan\\Documents\\Claude\\Projects\\Expense Tracker\\mcp-server\\dist\\stdio.js"],
      "env": {
        "DATABASE_READONLY_URL": "postgres://claude_ro:...@...pooler.supabase.com:6543/postgres?sslmode=require&pgbouncer=true",
        "EXPENSE_USER_ID": "default-user"
      }
    }
  }
}
```

Restart Claude Desktop, then run the **review_finances** prompt or ask
_"how am I doing this month?"_. Claude will call the tools and respond.

---

## Phase 2 — Deploy to Render (web/mobile)

1. Push this repo. On Render: **New → Web Service**, Root Directory `mcp-server`,
   Build `npm install && npm run build`, Start `node dist/http.js`.
2. Env vars: `DATABASE_READONLY_URL`, `EXPENSE_USER_ID`, and an auth secret.
3. **Auth (required — data is public on the internet):**
   - Interim/testing: set `MCP_BEARER_TOKEN` to a long random secret; the `/mcp`
     endpoint then demands `Authorization: Bearer <token>`. Works with MCP
     Inspector and Claude Desktop custom connectors that send a header.
   - Claude.ai web/mobile connectors require **OAuth 2.1** (PKCE + dynamic client
     registration). Implement it with the MCP SDK's auth router/provider, or put
     an OAuth gateway (Cloudflare Access / oauth2-proxy) in front. This is the
     bulk of Phase 2 work — until it's in place, keep using the local stdio
     server, which is just as capable inside Claude Desktop.
4. Add the Render URL (e.g. `https://<svc>.onrender.com/mcp`) as a **Custom
   Connector** in Claude.

The same tools in `server.ts` back both transports — only the entry file and
auth differ.
