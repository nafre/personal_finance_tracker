# 04 — Category Drilldown Page

**Analytics & insights** · Effort: **M** · Inspired by: Monarch's category pages, Lunch Money's category view · Backlog: **4c** · Depends on: —

## 1. Summary & inspiration

Every mature tracker gives a category its own page: trend over time, average, top merchants, recent transactions, budget status. Today a pie-slice click lands on `/transactions?category=X` — a flat list. Backlog 4c scoped a dedicated page at `app/(dashboard)/categories/[name]/page.tsx`.

## 2. UX design

Route: `/categories/[name]` (URL-encoded category name — categories are identified by name in `Transaction.category`, not by ID).

- **Header:** category icon + color chip (from the `Category` record; fallback `stringToColor`), name, and period selector reusing the URL-param pattern (`?month=&year=` / `?period=year|all`).
- **Stat row** (reuse `StatCard`): total this period · MoM delta · monthly average (trailing 12) · share of total spend.
- **Trend chart:** monthly bars of this category's spend for the trailing 12 months (reuse `MonthlyBarChart` styling or a simplified single-series variant).
- **Budget section:** if a `category`-type budget matches, show `BudgetProgress` for the viewed month.
- **Top notes:** top 5 note strings by total (see feature 10 for the shared normalizer).
- **Transactions list:** reuse `TransactionList` (editable — this is not the read-only dashboard) with a "View all in Transactions →" link to `/transactions?category=X`.
- Entry points: pie-slice/legend click (`SpendingPieChart.drillDown` — change target from `/transactions` to here), `SpendingInsights` category rows, and category names in `TransactionList` rows.

## 3. Data model

None.

## 4. Server layer

New server action `getCategoryDetail(name, month, year)` in `lib/actions.ts`:

- Guard with `getAuthenticatedUserId()`; Zod-validate `name` (nonempty, ≤ 50 chars) and month/year ranges.
- Queries (run in `Promise.all`):
  1. Month transactions: `findMany({ where: { userId, category: name, date: monthRange } })` → `normalizeTx`.
  2. 12-month trend: reuse `getTrendRows(userId, start, end, "month")` with an added category constraint — extend `getTrendRows` in `lib/db-adapter.ts` with an optional `category?: string` param (both dialect branches) rather than writing new raw SQL.
  3. `Category` record for icon/color; matching `budgetType: "category"` budget.
- Trend is a **pattern** stat → keep the `excludeFromStats: false` filter (default `getTrendRows` behavior).

The page itself is a server component mirroring `dashboard/page.tsx`: parse search params, fetch, pass `initial*` props to a small client `CategoryDetailContent`.

## 5. Client layer

- `app/(dashboard)/categories/[name]/page.tsx` (server) + `components/CategoryDetailContent.tsx` (client orchestrator).
- Reuse: `StatCard`, `BudgetProgress`, `TransactionList` (pass `budgets`/`categories` props as the transactions page does), `MonthSelector`.
- Edits made in the embedded `TransactionList` go through its existing offline-aware handlers; after mutation, `router.refresh()` (the page is server-rendered, same pattern as recurring posting).
- Add the route to `NavBar`? No — it's a drill-in page, breadcrumb "← Dashboard" suffices.

## 6. Offline considerations

The page is server-rendered, so it needs network for first load. Embedded `TransactionList` mutations stay offline-aware (its handlers already branch on `isOnline`). Don't seed IDB from this page (dashboard owns seeding).

## 7. Edge cases & interactions

- Category renamed in Settings: old transactions keep the old string — the page must render gracefully for a name with transactions but no `Category` record (fallback icon 📦 + `stringToColor`).
- Free-text categories (via `CategoryCombobox`'s "Use …") have no `Category` record — same fallback.
- URL-encoding: names can contain spaces/emoji; use `encodeURIComponent` at every link site and `decodeURIComponent` in the page.
- Empty category (no transactions in range): render the header + an empty state, not a 404.
- Read-only rule: this page is *not* month-scoped-read-only (it's a management surface like `/transactions`), so `TransactionList` stays editable.

## 8. Testing

- Vitest: none beyond the `getTrendRows` category-param addition (covered indirectly; the adapter's raw SQL isn't unit-tested per backlog 5f's scoping).
- Playwright: new `e2e/category.spec.ts` — navigate to a seeded category for a fixed past month, `data-testid="category-detail"`, snapshots at three viewports, `amountMasks(page)`. Also update the pie-chart drilldown assertion in `e2e/dashboard.spec.ts` (target URL changes).

## 9. Effort & risk

**M.** Mostly assembly of existing pieces. Risks: `getTrendRows` signature change must keep both dialect branches in lockstep, and the `SpendingPieChart` drilldown retarget touches an existing e2e assertion. Supersedes backlog 4c.
