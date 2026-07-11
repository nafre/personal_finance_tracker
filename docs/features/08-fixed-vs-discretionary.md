# 08 — Fixed vs Discretionary Split ("Needs vs Wants")

**Analytics & insights** · Effort: **M** · Inspired by: Copilot's needs/wants, YNAB's fixed-expense awareness · Backlog: **7f** · Depends on: —

## 1. Summary & inspiration

Copilot classifies spending into fixed (rent, subscriptions — not controllable month-to-month) vs flexible (controllable), which reframes "I spent RM4,000" into "RM2,600 was committed; my choices were RM1,400". Backlog 7f scoped an approximation via recurring rules; this plan goes one step further with an explicit per-category `spendType`, because category-level classification is more accurate than rule-matching and the `useDashboardState` code already gropes toward it (`fixedMonthlyExpense`, `discretionarySpend` exist today, derived from recurring rules only).

## 2. UX design

- **Settings → Categories:** each category row gains a small Fixed/Flexible toggle pill (default Flexible; obvious ones like Rent/Bills seeded as Fixed for new users).
- **Month view:** the existing "spending mix" figures upgrade from recurring-approximation to category-truth; show a two-segment horizontal bar (Fixed | Flexible) with RM + % in `SpendingInsights`.
- **Year view:** stacked area/bar per month — fixed band vs flexible band (`data-testid="fixed-split-chart"`), answering "is my committed base creeping up?".

## 3. Data model

`Category` gains one column (both schemas — plain string, no dialect divergence):

```prisma
model Category {
  ...
  spendType String @default("flexible") // "fixed" | "flexible"
}
```

`prisma/schema.sqlite.prisma`: identical line. No `lib/db-adapter.ts` work (scalar, not array). Migrate with `npm run db:migrate` (Postgres) / `db:dev:push` (SQLite).

## 4. Server layer

- `lib/validation.ts`: extend `categorySchema` with `spendType: z.enum(["fixed", "flexible"]).optional()`.
- `lib/actions.ts`: `updateCategory` passes the field through (it already validates with `categorySchema.partial()`); `addCategory` accepts it; `_seedDefaultCategories` marks sensible defaults (Rent, Bills, Insurance → fixed).
- Year-view aggregation: the monthly buckets don't carry category composition. Add an optional aggregate to `getRangeDashboardData`: a per-month `groupBy(["category"])` joined against the user's fixed-category set, returning `{ month, fixed, flexible }[]` as `initialFixedSplit` (chart basis — `excludeFromStats: false`, matching the other pattern stats). Cheaper alternative: reuse the per-month category `groupBy` planned for the stacked-bars idea in backlog 7d if that ships first.

## 5. Client layer

- `components/CategoryManager.tsx`: toggle pill in the row + inline edit form (default categories: allow changing `spendType` even though name/icon are locked — it's a personal classification, not identity).
- `hooks/useDashboardState.ts`: replace the recurring-derived `discretionarySpend` with category-based math: `fixedSpend = Σ` expenses in fixed categories (chart basis), `flexibleSpend = chartExpenses − fixedSpend`. Keep `fixedMonthlyExpense` (recurring-based) for the forecast/safe-to-spend features — different question ("what's scheduled" vs "what's classified").
- New `components/charts/FixedSplitChart.tsx` (year view), lazy-loaded, stacked `Bar` — note the Recharts-3 gotcha: `<Bar>` elements must be direct children of `<BarChart>`, no fragments.
- `SpendingInsights`: the two-segment mix bar.

## 6. Offline considerations

Category `spendType` edits are settings mutations — online-only (consistent with all category management today). Transaction-side math is derived client-side, so pending transactions classify correctly by their category.

## 7. Edge cases & interactions

- Free-text categories with no `Category` record → flexible by default.
- Category deleted: transactions keep the name string → flexible fallback.
- A "fixed" category with one-off extras (e.g. Bills containing a one-time repair): classification is per-category, accept the fuzziness — that's exactly Copilot's tradeoff. The per-transaction escape hatch already exists: `excludeFromStats` or recategorize.
- Demo role: settings toggle disabled like other demo restrictions.

## 8. Testing

- Vitest: the fixed/flexible split math (pure memo extraction), fallback classification.
- Playwright: `e2e/settings.spec.ts` — categories tab snapshot changes (toggle pills) → re-baseline. New year-view chart: mask in full-page (current month bucket drifts), dedicated fixed-past-range test. `amountMasks` on the mix bar.

## 9. Effort & risk

**M.** One scalar column, one aggregate, mostly UI. Risk: double meaning of "fixed" (category-classified vs recurring-scheduled) — keep the two exports separately named and documented in `useDashboardState`. Supersedes backlog 7f (upgrades its approximation approach).
