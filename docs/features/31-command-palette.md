# 31 — Command Palette & Global Search

**UX & PWA polish** · Effort: **M** · Inspired by: Linear/Raycast command palettes, Superhuman · Backlog: — · Depends on: 32 (soft — reuses its multi-field search action)

## 1. Summary & inspiration

Cmd+K is the power-user's front door: one keystroke to search transactions, jump to a page, or fire an action. For this app the killer combination is *quick-add from anywhere* — type `> food 20` in the palette on the transactions page and the expense is logged without navigating.

## 2. UX design

- **Open:** `Ctrl/Cmd+K` anywhere (desktop); a search icon in `NavBar` (mobile — palette renders as a full-height sheet there).
- **Modes by prefix:**
  - *(default)* fuzzy search: transactions (by note/category/label/amount), categories ("Food → drilldown/filtered list"), pages ("Settings", "Transactions").
  - `>` action mode: "Add expense…" (hands off text to the quick-add parser with live preview), "Export CSV", "New budget", "New recurring rule", "Toggle theme" (28), "Toggle privacy mode" (33).
- Results grouped with section headers (Actions / Transactions / Categories / Pages); arrow keys + Enter; recent searches (localStorage) when empty.
- Transaction results: tap → `/transactions` with the query applied (or the edit form for that row — v2).

## 3. Data model

None.

## 4. Server layer

- Search reuses feature 32's `getTransactions` multi-field `q` (case-insensitive across note/category/label). Debounced (300ms, matching the transactions page convention), `take: 8` for palette results — add an optional `limit` to the existing filters object rather than a new action.
- Actions/pages/categories are static or already-client-side (categories via `getCategories`) — no server work.

## 5. Client layer

- New `components/CommandPalette.tsx`: dialog via `useDialogBehavior` (Escape/scroll-lock/focus come free) + `role="dialog"` + combobox ARIA pattern (`role="combobox"`/`listbox`/`option`, `aria-activedescendant`).
- Global hotkey: a small `useEffect` in `Providers` (or a dedicated `PaletteProvider` exposing `openPalette()` for the NavBar button); ignore the hotkey when focus is in an input/textarea except the palette's own.
- Fuzzy matching for static entries (pages/actions/categories): a ~30-line subsequence scorer in `lib/fuzzy.ts` — no dependency needed at this scale.
- `>` add-mode: run `parseExpenseInput` live (pure import), show the parsed preview chip (category/amount/type/labels), Enter submits through the **same** flow as `ExpenseInput` — extract its submit logic into a `useAddTransaction()` hook (offline routing, IDB write-through, toasts, optimistic dashboard update when mounted there) so palette and input share one path rather than duplicating the offline branch.
- Lazy-load the palette (`dynamic`, `ssr: false`) — it's dormant until the first open.

## 6. Offline considerations

- Action mode + static search: fully offline.
- Add-mode: offline-capable via the shared `useAddTransaction` hook (`applyLocalMutation` path).
- Transaction search: server-backed → degrade gracefully offline: fall back to searching the IDB mirror (`getTransactionsByMonth`/`getTransactionsInRange` from `lib/idb.ts` over recent months) with an "offline results" hint. This fallback is the palette's quiet superpower — keep it simple (substring over the mirrored month).

## 7. Edge cases & interactions

- Hotkey collisions: `Ctrl+K` is the browser's address-bar focus in some contexts — `preventDefault` inside the app is standard and accepted.
- Palette-add on a **past-month** dashboard: the add still dates *today* (parser semantics) — that's consistent; the optimistic dashboard patch must be skipped when the viewed month ≠ today's month (the dashboard's `handleAdd` may assume current month — verify before wiring; route through a plain refresh in that case).
- The dashboard's `QuickAddSheet` and the palette must not both claim focus patterns — palette closes before navigating/acting.
- Mobile keyboard overlap: full-height sheet with the input pinned top (not bottom) so results aren't under the keyboard.
- `aria` correctness matters more here than anywhere (it's a keyboard feature): follow the combobox pattern strictly.

## 8. Testing

- Vitest: `lib/fuzzy.test.ts` (scoring, ordering); parser-preview reuse is already covered by parser tests.
- Playwright: functional — open via keyboard, type, arrow-select, Enter navigates; add-mode round trip (`> coffee 5` → row exists). Snapshot the open palette (desktop + mobile sheet) with fixture results; palette is closed in all existing snapshots so no churn.

## 9. Effort & risk

**M.** The `useAddTransaction` extraction is the meaningful refactor (and pays down duplication `ExpenseInput` already carries); everything else is contained in one lazy component. Build after feature 32 so search lands once, not twice.
