# 13 — Sinking Funds

**Budgeting & goals** · Effort: **M** · Inspired by: YNAB's "true expenses" · Backlog: — · Depends on: **11 (Goals)**

## 1. Summary & inspiration

YNAB's core insight: annual/irregular expenses (insurance, car service, holidays) should be saved for monthly, not absorbed as shocks. A sinking fund is a goal with a repeating horizon: "RM1,200 insurance due every March → set aside RM100/mo". This app already knows the irregular commitments — `yearly` recurring rules — so sinking funds can be *derived* and offered, not manually configured from scratch.

## 2. UX design

- **GoalManager** gains a goal `kind`: "one-time" (feature 11) vs **"sinking fund"**. Sinking funds have a target amount + due date and, on completion, **reset** for the next cycle instead of archiving.
- **Suggestion surface:** in the recurring section, yearly (and expensive quarterly-as-yearly) rules get a "Set aside monthly" affordance that pre-creates a sinking fund from the rule: target = rule amount, due = next due date, suggested monthly = `remaining / monthsUntilDue` (reuse `getNextDueDate` + `countRemainingPayments` from `lib/utils.ts`).
- **Dashboard goals card:** sinking funds render with a "RM X/mo to stay on track" line and an on-track/behind badge (compare saved vs elapsed-time-proportional target).
- The monthly set-aside is *informational* in v1 — no auto-transaction. Users contribute via the same labeled-transaction mechanism as goals. (Auto-contribution can later ride feature 21's cron.)

## 3. Data model

Extends the `Goal` model from feature 11 (both schemas):

```prisma
model Goal {
  ...
  kind         String    @default("oneTime") // "oneTime" | "sinking"
  recurringId  String?   // optional link to the RecurringTransaction that seeded it
  cycleStart   DateTime? // start of the current save-up cycle (for reset accounting)
}
```

No arrays → no db-adapter work. `recurringId` is a soft reference (no FK, consistent with the schema's convention); deleting the rule leaves the fund standing.

## 4. Server layer

- `goalSchema` gains `kind`, optional `recurringId`/`cycleStart`.
- `getGoals()` progress for sinking funds counts contributions **since `cycleStart`** (labeled-transaction aggregate with a date floor).
- New `rolloverSinkingFund(id)` action: on/after the due date, set `cycleStart = dueDate`, advance `targetDate` by one year (or the source rule's frequency via `getNextDueDate`), keep status active. Trigger from a "Start next cycle" button on the completed card (manual v1 — explicit beats magic).
- The suggestion affordance needs no new fetch: `initialRecurring` is already on the dashboard.

## 5. Client layer

- `components/goals/GoalManager.tsx`: kind selector; sinking-specific fields (due date required).
- `components/recurring/RecurringRow.tsx`: "Set aside monthly" action on yearly rules **without** an active linked fund (match by `recurringId`); opens GoalManager prefilled.
- Goals card: pace math `neededPerMonth = max(0, (target − saved)) / max(1, monthsUntil(targetDate))` and the on-track comparison — pure helpers in `lib/goal-math.ts` (shared with feature 11's pace hint).

## 6. Offline considerations

Same as goals: contributions are ordinary transactions (fully offline-capable); fund CRUD and cycle rollover are online-only.

## 7. Edge cases & interactions

- Source rule amount changes: fund target does **not** auto-update (snapshot semantics); show a subtle "rule is now RM X" hint with a one-tap "update target".
- Fund completed early: badge flips to ✓, pace line hides; extra contributions keep counting (over-saving is fine).
- Due date passed without completion: badge "behind — due date passed"; "Start next cycle" carries the shortfall forward into the new cycle's target? No — keep cycles independent (simpler mental model); the old shortfall just means the expense hits cash.
- Deleting the fund mid-cycle: contributions remain as transactions (label intact) — nothing dangling.
- `readOnlyMonth`: goals card is global (not month-scoped) — render it, but the contribute affordance follows quick-add's visibility.

## 8. Testing

- Vitest: `lib/goal-math.test.ts` — pace math (zero months left, already complete), cycle-scoped aggregation boundary (contribution exactly at `cycleStart`), rollover date advance via `getNextDueDate`.
- Playwright: covered by the goals-card snapshots (feature 11) plus a sinking-fund fixture variant; RecurringRow gains an icon → re-baseline the recurring-section snapshot.

## 9. Effort & risk

**M** on top of goals. The design's discipline: sinking funds are goals with a cycle, not a new subsystem. Risk is UX confusion between "budget", "goal", and "fund" — the suggestion-from-recurring entry point is what makes the concept self-explanatory; lead with it.
