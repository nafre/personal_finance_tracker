# 35 — Swipe Actions on Mobile Rows

**UX & PWA polish** · Effort: **M** · Inspired by: iOS Mail, Spendee's swipeable rows · Backlog: — · Depends on: —

## 1. Summary & inspiration

On mobile, edit and delete hide behind small icon taps. The native-feeling gesture: swipe a transaction row left to reveal Delete, right to reveal Edit (or a single left-swipe revealing both buttons — the less error-prone variant, and the one recommended here). Pairs naturally with the app's installed-PWA ambitions (feature 29): installed apps are judged by native gesture fluency.

## 2. UX design

- **Touch devices only** (`(hover: none)` media detection — the same discriminator the touch-target CSS already uses). Desktop keeps hover icons; no dual affordances.
- Swipe left on a `TransactionRow` → row content slides, revealing a two-button tray pinned right: **Edit** (slate) and **Delete** (rose). Tap elsewhere or swipe back → closes. Only one row open at a time (opening another closes the first).
- Delete from the tray uses the existing inline two-step confirm (the tray Delete becomes "Confirm?" in place — same convention, no native dialogs).
- Full-swipe-to-delete (the iOS Mail long swipe): **not** in v1 — too destructive without the confirm; the tray keeps the ceremony.
- Respects `readOnly` (`TransactionList` prop): swipe disabled entirely on read-only lists (past-month dashboard).
- Subtle affordance discovery: first-ever visit (localStorage flag) shows a brief hint shimmer on the top row.

## 3. Data model

None.

## 4. Server layer

None — the tray buttons invoke the exact existing `handleSave`-entry (edit mode) and `handleDelete` paths, offline-awareness included.

## 5. Client layer

- New `hooks/useSwipeReveal.ts`: pointer-event state machine (pointerdown → track deltaX → threshold/velocity decision on pointerup; `touch-action: pan-y` on the row so vertical scroll never fights the gesture; horizontal intent detected via an initial-angle check before capturing). Returns `{ offset, isOpen, bind }`. No gesture library — the needs are ~80 lines, and the repo's convention is dependency-frugal (toasts, dialogs are hand-rolled).
- `components/TransactionList.tsx` / `TransactionRow`: wrap row content in a translating container (`transform: translateX(offset)`, `transition` on release); tray absolutely positioned behind. `TransactionRow` is `React.memo` — the open-row coordination goes through a single `openRowId` state in the list with stable callbacks (same memo-discipline as feature 23's selection).
- Animation: `transition-transform duration-200`; honor `useReducedMotion` (snap without animating).
- Edit action opens the existing inline edit form (today's pencil path).

## 6. Offline considerations

None new — tray actions call the already offline-aware handlers (`applyLocalMutation` branch included).

## 7. Edge cases & interactions

- **Scroll vs swipe** is the whole battle: capture the gesture only when the initial movement is decisively horizontal (|dx| > |dy| and dx < −10px); otherwise let the browser scroll. `touch-action: pan-y` declared up front is what prevents jank.
- Bulk-select mode (feature 23): swiping disabled while selecting (modes conflict on the same surface).
- Pending rows (`pending_*`): swipe works — edit/delete of pending items is already supported through the offline paths.
- The row's existing tap targets (labels, category) remain tappable — a completed swipe suppresses the click that follows it (`preventDefault` on the synthesized click after a drag; standard ghost-click guard).
- RTL: not applicable (app is LTR-only) — note it and move on.
- iOS Safari edge-swipe (back navigation) at screen edges: rows inset from the edge by the page padding — acceptable overlap; don't fight the system gesture.

## 8. Testing

- Vitest: the state-machine decisions in `useSwipeReveal` (threshold, velocity, angle rejection) — extract the pure decision function `resolveSwipe(deltas)`; test in node without DOM.
- Playwright: gesture simulation via `page.touchscreen` / dispatched pointer events on the **mobile project** only — one functional test (swipe opens tray, Edit opens form) and one snapshot of the open-tray state. Desktop snapshots untouched (feature is touch-gated).

## 9. Effort & risk

**M.** The gesture math is well-trodden but detail-sensitive (scroll interference, ghost clicks, memo discipline). The `(hover: none)` gating keeps the desktop suite stable and the blast radius mobile-only.
