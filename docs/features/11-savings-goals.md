# 11 — Savings Goals

**Budgeting & goals** · Effort: **L** · Inspired by: Monarch goals, Wallet by BudgetBakers, YNAB targets · Backlog: — · Depends on: — (unlocks 13 sinking funds)

## 1. Summary & inspiration

Every consumer finance app has goals ("Emergency fund: RM6,500 / RM10,000, done by March"). This app tracks flows but has no savings concept. The lightest design that fits the existing architecture: a `Goal` model whose progress is **derived from labeled transactions** — a contribution is just an expense-type transaction carrying the goal's linked label (e.g. `#goal-japan`), reusing the entire existing entry/edit/offline pipeline instead of inventing a parallel "contribution" record.

## 2. UX design

- **Dashboard:** a "Goals" card (collapsible, like the recurring section) showing each active goal as a progress bar (reuse `BudgetProgress`'s visual language): name, icon, `RM saved / RM target`, % and — when `targetDate` is set — a pace hint ("RM 250/mo needed to finish by Dec").
- **Manage:** a `GoalManager` modal (mirror `BudgetManager`: dynamically imported, `useDialogBehavior`, `role="dialog"`): create/edit/archive with name, emoji icon, target amount, optional target date, linked label (auto-suggested `goal-<slug>`).
- **Contributing:** "Add contribution" button per goal → prefills the quick-add input with `savings 100 #goal-japan` style text (user confirms). Contributions are ordinary transactions — visible in `/transactions`, filterable by the label.
- Completed goals get a ✓ state and an archive action. Archived goals hidden behind a "show archived" toggle.

## 3. Data model

New model, both schemas:

```prisma
model Goal {
  id         String    @id @default(cuid())
  userId     String
  name       String
  icon       String    @default("🎯")
  targetAmount Float
  targetDate DateTime?
  label      String              // linked transaction label, unique per user
  status     String    @default("active") // "active" | "completed" | "archived"
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt

  @@unique([userId, label])
  @@unique([userId, name])
  @@index([userId])
  @@map("goals")
}
```

SQLite schema: identical (no array fields → no `lib/db-adapter.ts` JSON helpers needed). `deleteUser`'s manual cascade in `lib/actions.ts` must add `goal.deleteMany` to its `db.$transaction`.

## 4. Server layer

- `lib/validation.ts`: `goalSchema` — name ≤ 50, targetAmount positive, label slug-validated (`/^[a-z0-9-]+$/`), targetDate optional future date.
- `lib/actions.ts`: `getGoals()`, `saveGoal(data, id?)`, `deleteGoal(id)`, `setGoalStatus(id, status)` — all guarded by `getAuthenticatedUserId()`, revalidating `/dashboard` + `/transactions`.
- Progress query: saved amount = `aggregate({ _sum: { amount } })` over expense transactions carrying the label. **Postgres:** `labels: { has: goal.label }`; **SQLite:** `getLabelFilter` returns empty → fetch label-bearing rows and filter via `parseLabels` in JS (same pattern `getTransactions` uses; bound it). Compute inside `getGoals()` so the card gets `{ goal, saved }[]` in one action.
- Dashboard server page fetches `getGoals()` in parallel with the existing calls → `initialGoals` prop.

## 5. Client layer

- `components/goals/GoalManager.tsx` (modal), `components/goals/GoalCard.tsx` / `GoalProgress.tsx` (reuse `BudgetProgress` styling; extract shared bar if identical).
- `useDashboardState`: `goals` state slice + optimistic patch — when `handleAdd`/`handleUpdate`/`handleDelete` sees a transaction whose labels intersect a goal label, adjust that goal's `saved` locally (same philosophy as `computeBudgetSpent`, but server-computed base + client delta).
- Quick-add prefill: pass a `prefill` setter down to `ExpenseInput` (it already supports category-chip prefills — extend the same mechanism).
- "Add contribution" hidden on `readOnlyMonth` (quick-add is hidden there anyway).

## 6. Offline considerations

Contributions are plain transactions → the full offline path (`applyLocalMutation`, temp IDs, queue) works untouched. Goal CRUD itself is online-only (settings-class mutation, like budgets). Optimistic goal-progress patching covers pending contributions in the UI.

## 7. Edge cases & interactions

- **Basis:** goal progress counts **all** contributions, including `excludeFromStats` ones (it's an accounting stat). In fact, recommend users mark contributions off-chart so savings don't pollute spending patterns — put this hint in the GoalManager copy, and have the "Add contribution" prefill set the off-chart flag by default via the edit path (v2: parser token like `!off`).
- Label edited/removed on a transaction → progress moves accordingly (it's derived; no orphaned state). Deleting a goal never deletes transactions.
- Label collision with an existing organic label: the `@@unique([userId, label])` prevents two goals sharing one; a pre-save check warns if the label already has history ("RM X of existing transactions will count").
- Contribution type: expenses (money leaves spendable cash). Withdrawals from a goal = income-type transaction with the label → subtract in the aggregate (sum expenses − incomes per label).
- Demo role: GoalManager mutations disabled.

## 8. Testing

- Vitest: pace-needed math (`(target − saved) / monthsRemaining`), progress delta patching, slug validation.
- Playwright: goals card on dashboard (`data-testid="goals-card"`, `amountMasks`), GoalManager modal snapshot, three viewports; seed a fixture goal. Add to `e2e/dashboard.spec.ts`.

## 9. Effort & risk

**L.** New model + CRUD + modal + optimistic wiring + SQLite label filtering. The label-derived design is the key scope-limiter — no new transaction subtype, no transfer machinery. Risk: label-filter performance on SQLite (bounded fetch, dev-only concern — see backlog 2j).
