# UI Polish & Responsiveness Pass — July 2026

A full-app UI review (visual inspection of Playwright snapshots at 390/768/1280px plus a component-level code audit) followed by a polish pass. 28 files changed; `npm run build` and all 67 visual regression tests pass against regenerated baselines. This doc records what changed and the conventions the changes established, so future work stays consistent.

## Conventions established (follow these going forward)

| Convention | Rule |
|---|---|
| **Icons** | Structural UI icons come from `lucide-react` (one stroke family). Emoji are only used as *data* (category icons, the 💸 brand mark with `aria-hidden`). Never emoji for buttons/nav/status. |
| **Brand color** | The indigo/violet brand gradient uses the `brand` token in `tailwind.config.ts` (`brand` `#4f46e5`, `brand-light` `#6366f1`, `brand-violet` `#7c3aed`) — via `bg-gradient-to-br from-brand to-brand-violet` or `theme(colors.brand.*)` in CSS. Don't inline these hex values. |
| **Radius scale** | Cards `rounded-2xl` · controls (buttons/inputs) `rounded-xl` · badges/pills `rounded-full` · small chips `rounded-lg`. Loading skeletons must match the radius of the component they stand in for. |
| **Touch targets** | Icon buttons keep compact desktop visuals but get ≥44px hit areas on touch devices via `[@media(hover:none)]:min-h-11 [@media(hover:none)]:min-w-11` (or `p-2 -m-2` for text links). |
| **Mobile input font** | Form inputs use `text-base sm:text-sm` — 16px on mobile prevents iOS focus-zoom, 14px from `sm` up keeps density. |
| **Icon-only buttons** | Always `aria-label` (plus `title` for hover). Icons themselves get `aria-hidden="true"`. |
| **Destructive actions** | Inline two-step confirm (button swaps to "Delete?/Cancel" pair) — never native `confirm()`. Pattern lives in `TransactionList.tsx` and `RecurringRow.tsx`. |
| **Dialogs/sheets** | Use `hooks/useDialogBehavior.ts` (Escape-to-close, body scroll lock, focus in/restore) + `role="dialog"` + `aria-modal="true"` + a labelled title. |
| **Error/status banners** | Errors get `role="alert"`; transient status (sync bar, success messages) gets `role="status"` / `aria-live="polite"`. |
| **Cancel buttons** | Use `.btn-ghost`. |
| **Palette** | `slate-*` only for neutrals (no `zinc-*`). Meaningful helper text ≥ `text-slate-500` (`text-slate-600` reserved for purely decorative text). |

## What changed, by area

### Foundation
- `tailwind.config.ts` — removed the unused `surface` palette (it contradicted actual usage); added `brand` color tokens.
- `app/globals.css` — `.btn-primary`/`.fab` gradients now reference `theme(colors.brand.*)`; removed unused `--radius` var; FAB offset is safe-area aware (`calc(80px + var(--safe-bottom))`). `--safe-bottom` resolves to `env(safe-area-inset-bottom)` only in installed-PWA mode (`display-mode: standalone`/`fullscreen`) and `0px` in browser tabs — Firefox on Android leaks its dynamic toolbar height into the inset, which showed as a big dead strip under the bottom nav at scroll-top.
- `app/layout.tsx` — removed `maximumScale: 1` from the viewport export (pinch-zoom re-enabled, WCAG).

### Navigation shell
- `components/NavBar.tsx` — emoji nav icons → lucide (`LayoutDashboard`, `ReceiptText`, `Settings`, `LogOut`); mobile bottom nav gets `pb-[var(--safe-bottom)]` (PWA-only safe-area padding, see Foundation); collapse toggle has an extended hit area + `aria-expanded`; sidebar width transition is suppressed until after hydration (no more collapse animation on page load); collapsed-mode links get `aria-label`s.
- `components/MainWrapper.tsx` / `app/(dashboard)/layout.tsx` / `components/DemoBanner.tsx` — DemoBanner moved into the content column as a rounded card (a fixed sidebar previously overlapped it) and passed as a `banner` prop since it's a server component inside a client wrapper.

### Dashboard widgets
- `components/StatCard.tsx` — `icon` prop is now `ReactNode` (callers in `DashboardContent.tsx` pass lucide icons); ▲▼ delta glyphs → `ArrowUp`/`ArrowDown` with an sr-only "vs last month" on mobile; truncated amounts expose the full value via `title`.
- `components/MonthSelector.tsx` — ←→ text arrows → chevron icons in 44px buttons; period toggle options are `whitespace-nowrap` (fixes "All-time" wrapping to two lines at 390px) with `aria-pressed`; the row can wrap gracefully.
- `components/SpendingInsights.tsx` — arrow icons + sr-only context on per-category deltas; "On pace" badge contrast bumped.
- `components/charts/SpendingPieChart.tsx` / `TrendChart.tsx` — empty-state heights now equal chart heights (`h-[280px]` / `h-[200px]`), eliminating layout shift when data arrives.
- `components/SyncStatusBar.tsx` — all states are `role="status"` live regions; Retry/Sync-now links have proper hit areas.

### Transactions
- `components/TransactionList.tsx` — ✏️🗑️ → `Pencil`/`Trash2` with per-row `aria-label`s and touch-size hit areas; delete uses the inline two-step confirm; inline edit form is `grid-cols-1 sm:grid-cols-3` (was an unresponsive 3-col squeeze at 390px); label-remove and budget-exclude controls got icons + ARIA; edit inputs are 16px on mobile; helper-text contrast raised.
- `app/(dashboard)/transactions/page.tsx` — filter bar restructured: selects in a 2-up mobile grid, date inputs have visible **From/To** labels and fixed widths, Clear/Export in their own row; select/filter controls have `aria-label`s.

### Dialogs
- **New:** `hooks/useDialogBehavior.ts` — shared Escape/scroll-lock/focus behavior.
- `components/budgets/BudgetManager.tsx` — dialog semantics; close/delete buttons are labelled lucide icons with hit areas (delete was an ambiguous ×-glyph before); budget rows are keyboard-operable (`role="button"` + Enter/Space); type-picker chips have `aria-pressed`; error is `role="alert"`.
- `components/QuickAddSheet.tsx` — dialog semantics via the same hook.

### Recurring
- `components/recurring/RecurringRow.tsx` — status badge is now visible on mobile (inline next to the name so the right-hand actions don't squeeze the name — previously it was hidden below `sm`, leaving only a colour dot); `zinc-*` → `slate-*`; edit/delete are labelled lucide icons; delete uses inline confirm; "Posted ✓" uses a `Check` icon pill.
- `components/recurring/RecurringList.tsx` / `RecurringForm.tsx` — single dashed "Add recurring" affordance; 16px mobile inputs; `role="alert"` errors; `btn-ghost` cancel.

### Settings
- `components/SettingsTabs.tsx` — proper `role="tablist"`/`role="tab"`/`aria-selected`; 44px tabs. (**Note:** `e2e/settings.spec.ts` was updated to `getByRole("tab", …)` accordingly.)
- `components/CategoryManager.tsx` — colour swatches grew 20px → 28px with visible focus rings and human-readable labels ("Select colour: Teal" — `PRESET_COLORS` is now `{hex, name}[]`); lucide row icons.
- `components/UserManager.tsx` — create form has visible `<label>`s (was placeholder-only); password toggles are keyboard-focusable with `aria-label`s (`Eye`/`EyeOff`); reset/delete buttons labelled.
- `components/ChangePasswordForm.tsx` — show/hide password toggle added (parity with UserManager); `role="alert"` errors.
- `components/CategoryCombobox.tsx` — full ARIA combobox pattern (`role="combobox"`, `aria-expanded`, `aria-activedescendant`, listbox/option roles) exposing the existing keyboard nav to assistive tech.

### Login
- `app/(auth)/login/page.tsx` — brand-token gradient on the logo (`aria-hidden`); "Sign in →" → `ArrowRight` icon; error banner is `role="alert"`.

## Verification
- `npm run build` — clean.
- Live-browser spot-checks (Playwright MCP) at 390/768/1280: period selector, filter bar, recurring row, both dialogs (Escape, focus, scroll lock verified).
- `npm run test:ui` — 67/67 pass; baselines regenerated (intentional visual change).

## Gotcha discovered during verification
`public/sw.js` caches `/_next/static/**` cache-first, so a browser that has the service worker registered will keep serving **stale CSS/JS in dev** even after restarting the dev server and deleting `.next`. Before visually verifying style changes in a live browser, unregister the SW and clear `caches` (key `expense-tracker-v2`), then reload.

## Deliberately out of scope
Light mode / theme toggle, a semantic CSS-var token layer, shared Badge/Button components, focus-trap loops inside dialogs (focus moves in and restores, but Tab can still leave), and inline confirm for budget/user/category deletes (only transaction + recurring deletes were converted).
