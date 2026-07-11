# 16 — Auto-Budget Suggestions

**Budgeting & goals** · Effort: **S** · Inspired by: Monarch's suggested budgets, Mint's auto-budgets · Backlog: — · Depends on: —

## 1. Summary & inspiration

The hardest part of budgeting is picking the number. Monarch seeds each budget with your trailing average and lets you nudge it. This app has `BudgetManager` with a blank amount field — one "Suggest" affordance closes the gap, and the data (historical category totals) is one `groupBy` away.

## 2. UX design

- In `BudgetManager`'s create/edit form, once a budget type + target (category / labels / exclusions) is chosen, show a hint row under the amount input: *"You've averaged RM427/mo on Food over the last 3 months"* with a **Use RM430** button (rounded up to the nearest RM10 — suggested budgets should breathe).
- A secondary line shows the range ("RM380–520") so the user knows the volatility.
- For `overall` budgets: trailing average of total monthly expenses. For `excluded`: average of total minus the excluded categories. For `label`: average of labeled spend.
- If fewer than 2 full months of history: hide the hint entirely (a 1-month "average" is just last month).

## 3. Data model

None.

## 4. Server layer

New read action `getBudgetSuggestion(input)` in `lib/actions.ts`:

- Input mirrors the budget definition: `{ budgetType, category?, excludedCategories?, labels? }` (Zod-validate with a trimmed variant of `budgetSchema`).
- Query the trailing 3 **full** calendar months (exclude the current partial month — it biases low): expenses grouped by month, filtered per type. Postgres: SQL-side category/label filters (`labels: { hasSome }`); SQLite: fetch + `parseLabels` JS filtering, bounded.
- Return `{ avg, min, max, months }`. Compute in TS from the three month totals.
- Basis: budget spend counts what `computeBudgetSpent` counts — align the filters with `lib/budget-math.ts` semantics (i.e., no `excludeFromStats` filter unless the client math applies one; per-transaction `excludedBudgetIds` can't apply to a not-yet-created budget, correctly).

## 5. Client layer

- `components/budgets/BudgetManager.tsx`: on type/target change (the existing `handleTypeChange`/`handleCategorySelect` handlers), debounce-call the action; render hint + "Use" button that fills the amount field. Show a subtle skeleton while fetching; disappear silently on error (a suggestion should never block budget creation).
- No new components — it's ~40 lines inside the manager.

## 6. Offline considerations

Online-only (BudgetManager already is). Offline: the action fails, the hint just doesn't render.

## 7. Edge cases & interactions

- Months with zero spend in the target category count as RM0 months (they're real data), but if **all** three are zero, hide the hint.
- Category renamed mid-history: suggestion reflects the current name's history only — acceptable.
- Rounding: suggest up (`Math.ceil(avg / 10) * 10`), never down — a budget below your average is a setup for failure.
- Demo role: read-only action, fine to show; the Save button is what's gated.
- Don't auto-fill the amount silently — the explicit "Use" click keeps the user the author of the number (Monarch's lesson: silent auto-budgets erode trust).

## 8. Testing

- Vitest: the avg/min/max/rounding math — extract `summarizeMonthlyTotals(totals[])` into `lib/budget-math.ts`.
- Playwright: BudgetManager modal snapshot gains the hint row — re-baseline the manager snapshot with a fixture that has 3 months of history; `amountMasks` covers the RM figures.

## 9. Effort & risk

**S.** One read action + one form affordance. No risk beyond making sure the suggestion filter semantics match `computeBudgetSpent` (shared module, again).
