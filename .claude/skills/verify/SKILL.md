---
name: verify
description: How to launch and drive this app to verify a change end-to-end in a real browser.
---

# Verifying changes in the running app

## Launch

1. `Remove-Item -Recurse -Force .next\dev` — Turbopack's dev cache can serve CSS missing newly added utility classes.
2. `npm run dev` (background). SQLite mode bootstraps automatically; server is ready when `http://localhost:3000/login` returns 200 (~5s).

## Login

Credentials are `TEST_EMAIL` / `TEST_PASSWORD` in `.env.local` (same as the Playwright suite). Fill the login form at `/login`; lands on `/dashboard`.

## Drive

Use the Playwright MCP (`mcp__playwright__browser_*`). Before any visual check, unregister the service worker and clear Cache Storage in the MCP browser, then reload — the SW serves stale assets even in dev and re-registers on every load:

```js
const regs = await navigator.serviceWorker.getRegistrations();
for (const r of regs) await r.unregister();
for (const k of await caches.keys()) await caches.delete(k);
```

## Gotchas

- The QuickAddSheet FAB is mobile-only — resize to 390×844 first.
- BudgetManager opens via the budgets card's "Manage →" / "Set up →" button (current month only).
- Modals are native `<dialog>` elements (`dialog[open]`, `:modal`); they stay mounted ~150–300ms after close for exit animations — wait for detached, not for a class.
- Dev runs React StrictMode: mount effects run mount → cleanup → mount. A bug that only reproduces under double-effects will not show in `npm run test:ui` (production build, and the suite never opens the modals).
- The visual suite (`npm run test:ui`) does not open BudgetManager or QuickAddSheet — passing tests say nothing about the modals.
- If you create transactions while probing, delete them through the row's two-step confirm afterwards (dev.db persists).
