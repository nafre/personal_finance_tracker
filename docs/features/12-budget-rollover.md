# 12 — Budget Rollover (Envelope Carryover)

**Budgeting & goals** · Effort: **L** · Inspired by: YNAB's envelope model, Actual Budget's rollover toggle · Backlog: — · Depends on: —

## 1. Summary & inspiration

The envelope idea: unspent budget carries into next month (and overspend eats next month's allowance). It turns budgets from "monthly pass/fail" into a running discipline. Actual Budget's per-category rollover toggle is the right scope — full YNAB zero-based budgeting is a different app.

## 2. UX design

- `BudgetManager` gains a **"Roll over unspent"** toggle per budget (all four `budgetType`s).
- `BudgetProgress` for a rollover budget shows the effective limit: base amount ± carryover, with a small breakdown line — "RM500 + RM120 carried over", or "RM500 − RM80 overspent last month".
- Viewing a past month shows that month's carryover state as it *was* (historical accuracy — this is what forces the snapshot design below).
- A "Reset carryover" action per budget (two-step confirm) for when accumulated debt/credit stops being useful.

## 3. Data model

Rollover needs month-by-month history, which pure recomputation can't provide cheaply once budgets are edited mid-history. Add a flag plus a snapshot table (both schemas):

```prisma
model Budget {
  ...
  rollover Boolean @default(false)
}

model BudgetPeriod {
  id        String   @id @default(cuid())
  userId    String
  budgetId  String
  month     Int
  year      Int
  baseAmount Float   // budget.amount at close time
  spent     Float    // computed spend at close time
  carryIn   Float    // carryover received from the previous period
  createdAt DateTime @default(now())

  @@unique([budgetId, month, year])
  @@index([userId, year, month])
  @@map("budget_periods")
}
```

SQLite: identical (scalars only). `deleteBudget` and `deleteUser` cascades must clear `budgetPeriod` rows.

## 4. Server layer

- **Closing a period:** no cron required — close lazily. `getBudgets()` (or a new `getBudgetsWithCarryover(month, year)`) checks for missing `BudgetPeriod` rows for any fully-elapsed month since the budget's `createdAt` (or since rollover was enabled) and materializes them on read, walking forward: `carryIn(n) = carryIn(n−1) + baseAmount − spent(n−1)`, clamped by policy (see edge cases). Spend computation server-side needs the same rules as the client — this is the second consumer (after feature 05) forcing **`computeBudgetSpent` extraction into a pure shared `lib/budget-math.ts`**, fed by a month-transactions query.
- `saveBudget`: accept `rollover`; `budgetSchema` gains the boolean. Enabling rollover starts carryover from the *current* month (no retroactive back-computation — state this in UI copy).
- New `resetBudgetCarryover(id)` action: deletes the budget's `BudgetPeriod` rows and restarts from the current month.
- Effective limit for the viewed month = `amount + carryIn(viewedMonth)` — return per-budget `carryIn` from the action so the client just adds.

## 5. Client layer

- `components/budgets/BudgetManager.tsx`: toggle + helper copy.
- `components/budgets/BudgetProgress.tsx`: accept `carryIn?: number`; render effective limit + breakdown line.
- `hooks/useDashboardState.ts`: `computeBudgetSpent` (now imported from `lib/budget-math.ts`) unchanged; the budget card math adds `carryIn` to the limit. Optimistic handlers need no change (carryIn is fixed within a month).

## 6. Offline considerations

Budget CRUD stays online-only. Carryover materialization happens server-side on read — offline dashboard loads show the last-fetched values (fine).

## 7. Edge cases & interactions

- **Negative carryover policy:** cap debt at one month's base amount (Actual's approach) so a forgotten budget doesn't compound into an absurd hole; make the clamp a named constant in `lib/budget-math.ts`.
- Budget `amount` edited mid-history: past `BudgetPeriod` rows keep their `baseAmount` snapshot — history doesn't rewrite. This is *why* the snapshot exists.
- Transactions edited in a **closed** month (via `/transactions`, which stays editable): the snapshot goes stale. Policy: recompute the affected period lazily — on materialization walk, if `spent` in the stored row differs from a fresh computation, update it and re-walk forward. Keep the re-walk bounded (≤ 24 months).
- Per-transaction `excludedBudgetIds` and budget-type rules: all inherited via the shared `computeBudgetSpent` — the extraction is the correctness linchpin.
- Rollover + past-month dashboard view: `carryIn` for the viewed month comes from stored periods → historically correct.
- Chart basis: budget spend is already chart-agnostic (budgets count all matching expenses regardless of `excludeFromStats`? — verify current `computeBudgetSpent` behavior and keep the server identical; the extraction test locks it).

## 8. Testing

- Vitest: `lib/budget-math.test.ts` — spend rules per budget type (moved code gains its first tests), carryover walk (positive, negative-clamped, amount-edited mid-walk, stale-spent recompute).
- Playwright: `BudgetProgress` breakdown line changes budget snapshots → re-baseline dashboard budget section; add a rollover-budget fixture and dedicated snapshot.

## 9. Effort & risk

**L.** The snapshot/lazy-close design is the crux — it's what keeps history honest without a cron. Biggest risk: server/client spend divergence — eliminated by the `lib/budget-math.ts` single implementation, which features 05 and 17 also want. Build the extraction first as its own PR.
