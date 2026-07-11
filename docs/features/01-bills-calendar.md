# 01 — Bills & Recurring Calendar

**Analytics & insights** · Effort: **M** · Inspired by: Monarch's bills calendar, Money Manager's calendar tab · Backlog: — · Depends on: —

## 1. Summary & inspiration

Monarch and Money Manager both anchor their "when does money leave" story on a month calendar: each day cell shows the bills due that day plus a dot/amount for actual spend. This app already computes everything needed — `getNextDueDate`/`getRecurringStatus` in `lib/utils.ts` project recurring due dates, and `dailyData` carries per-day spend — but only surfaces it as a list (recurring section) and an area chart (trend). A calendar view answers "what's hitting my account on the 25th?" at a glance and gives the due-week card a natural "see full calendar" expansion.

## 2. UX design

- New collapsible **Calendar** card on the dashboard month view, below the recurring section (or a tab toggle on the trend chart card: "Trend | Calendar").
- Classic 7-column month grid. Each day cell shows: day number, a spend intensity dot (sized/colored by that day's expense total from `dailyData`), and up to 2 recurring-due chips (icon + name); overflow becomes "+N".
- Tapping a day opens a small popover (reuse `useDialogBehavior` on mobile as a sheet) listing that day's transactions and due bills, with links to `/transactions?from=&to=` for the day.
- Recurring chips carry the status color (`due` amber, `overdue` rose, `upcoming` slate) from `getRecurringStatus`.
- Past months: calendar still renders (historical spend + which bills were posted), but no Post/Skip actions — consistent with `readOnlyMonth`.
- Mobile (390px): cells shrink to day number + dot only; chips move into the day popover.

## 3. Data model

None. Everything derives from existing props: `initialRecurring` (project each active rule's due dates that fall inside the viewed month by iterating `getNextDueDate` forward from `lastRun`/`startDate`) and `dailyData`/`mergedTransactions` for actuals.

## 4. Server layer

None required. The dashboard server page already fetches `getRecurringTransactions()` and `getDashboardData(month, year)`.

One pure helper is needed: `enumerateDueDatesInMonth(rule, month, year): Date[]` in `lib/utils.ts` — walks the rule's schedule (daily/weekly/monthly/yearly from `startDate`, respecting `endDate` and `isActive`) and returns occurrences within the month. Daily rules should collapse to a single "daily" chip rather than 30 chips.

## 5. Client layer

- New `components/RecurringCalendar.tsx` (lazy-load with `dynamic(..., { ssr: false })` like the charts — it's below the fold).
- Consumes `initialRecurring`, `dailyData`, and `mergedTransactions` from `useDashboardState` via props from `DashboardContent`.
- Day-cell popover reuses `formatCurrency`, `formatDateShort`; per-category colors from `initialCategories`.
- Add a memo in `useDashboardState` mapping `day → { spend, dueRules[] }` so the grid render is O(31).

## 6. Offline considerations

Read-only feature — no sync-queue impact. Pending transactions already live in `mergedTransactions`, so an offline-added expense shows up on its day cell immediately.

## 7. Edge cases & interactions

- Months where a monthly rule's day exceeds the month length (31st in Feb) — `getNextDueDate` already clamps; the helper must match its behavior exactly (share code, don't duplicate).
- `excludeFromStats`: the spend dot is a **pattern** stat → use chart-basis `dailyData`. The day popover lists all transactions (it's a ledger view) with the existing "Off-chart" badge.
- Rules created mid-month: no occurrences before `startDate`.
- Ended rules (`endDate` passed): show occurrences up to the end date, then nothing.

## 8. Testing

- Vitest: `enumerateDueDatesInMonth` in `lib/utils.test.ts` — monthly clamp (Jan 31 → Feb 28), weekly crossing month boundary, yearly rule not in month, ended rule, inactive rule, daily collapse. Use `vi.setSystemTime()` per the existing convention.
- Playwright: add a calendar test to `e2e/dashboard.spec.ts` navigating to a **fixed past month** (stable data, like the pace-chart tests), `data-testid="recurring-calendar"`, screenshot at all three viewports with `amountMasks(page)`. The current-month full-page snapshot must mask the card (today-highlight drifts daily).

## 9. Effort & risk

**M.** The grid and popover are straightforward; the risk is subtle drift between `enumerateDueDatesInMonth` and `getNextDueDate` (double-posting confusion if the calendar shows a due date the row logic disagrees with). Mitigate by implementing enumeration *on top of* `getNextDueDate` rather than re-deriving schedule math.
