# 17 — Safe-to-Spend Number

**Budgeting & goals** · Effort: **M** · Inspired by: PocketGuard's "In My Pocket", Simple Bank's Safe-to-Spend · Backlog: — · Depends on: — (better with 11/13/21)

## 1. Summary & inspiration

PocketGuard's whole pitch is one number: after bills and commitments, *this* is what you can spend freely. It collapses the dashboard into an answer. The inputs all exist here: month income, spend so far, recurring still due (`fixedAvailableCash`/`fixedMonthlyExpense` already computed in `useDashboardState`), budget commitments, and (once feature 11/13 land) planned goal contributions.

## 2. UX design

- A hero **"Safe to spend"** stat card in the month view's stat row (or above it, wider): big number + a tappable breakdown disclosure:
  - `+` Income this month (actual so far, or expected if recurring income rules exist and haven't posted)
  - `−` Spent so far
  - `−` Recurring bills still due this month
  - `−` Remaining committed budget headroom? **No** — double-counts with actual spend; see math below.
  - `−` Planned goal set-asides (feature 13's monthly amounts), when present
- Optional "per day" subline: safe ÷ days remaining ("RM23/day until month end").
- Current month only (today-anchored); hidden on `readOnlyMonth` and year/all-time views.
- Turns rose when negative, with honest copy ("RM120 short of your commitments").

**The math (keep it defensible):**
`safe = expectedIncome − spentSoFar − recurringExpenseStillDue − goalSetAsides`
where `expectedIncome = max(actualIncomeSoFar, projectedRecurringIncome)`. Deliberately does **not** subtract budget remainders — budgets cap categories; safe-to-spend tracks cash. Mixing them is PocketGuard's most-complained-about confusion.

## 3. Data model

None.

## 4. Server layer

None — every input is already in dashboard props (`initialTotalIncome`, `initialTotalExpenses`, `initialRecurring`; goals from feature 11's `initialGoals` when present).

## 5. Client layer

- Pure `computeSafeToSpend(inputs)` in `lib/forecast.ts` (shares recurring-still-due logic with feature 02 — literally the same `isPostedThisPeriod`-based accumulation; write it once).
- `hooks/useDashboardState.ts`: `safeToSpend` memo over the existing slices; updates optimistically with every add (the number visibly dropping right after you log an expense is the feature's best moment).
- New `components/SafeToSpendCard.tsx` (or a `StatCard` variant with a disclosure) — `data-testid="safe-to-spend"`, `tabular-nums` amounts, breakdown rows using `formatCurrency`.
- Wrap in `DashboardErrorBoundary section`.

## 6. Offline considerations

Fully offline-correct: derived from merged optimistic state, so pending offline adds move the number immediately.

## 7. Edge cases & interactions

- **Basis:** ledger (accounting stat) — includes `excludeFromStats` transactions; a real cash question. Note this near the chart-basis forecast (feature 02) so the two cards' philosophies are explicit; they will show different "spent" figures when off-chart rows exist.
- No income yet this month + no recurring income rules: `expectedIncome = 0` → the card reads deeply negative early in the month. Guard: if no income signal at all, show "Log income or add a salary rule to unlock" empty state instead of a scary number.
- Recurring rules already posted (`isPostedThisPeriod`) are in `spentSoFar` — never double-subtract (same invariant as feature 02; same shared helper).
- Overdue rules from previous periods: count only the current month's due occurrences.
- Mid-month budget edits / goal changes: memo recomputes; no persistence to invalidate.

## 8. Testing

- Vitest: `computeSafeToSpend` — posted vs unposted recurring, income projection, negative result, no-income guard, month-boundary daysRemaining.
- Playwright: today-anchored → mask `[data-testid="safe-to-spend"]` in the current-month full-page snapshot (PaceChart precedent); add a presence test asserting the card and breakdown disclosure render.

## 9. Effort & risk

**M.** All-client feature; the effort is in the *definition*. The stated math (cash-based, no budget subtraction) is the defensible v1 — write it into the card's info tooltip so the number never feels arbitrary. That trust is the whole feature.
