# 29 — PWA Install Prompt + App Shortcuts

**UX & PWA polish** · Effort: **S** · Inspired by: native-app parity; Twitter/Starbucks PWA onboarding patterns · Backlog: — · Depends on: —

## 1. Summary & inspiration

The PWA plumbing exists (`public/manifest.json` with standalone display + maskable icons, a registered service worker) but nothing invites installation — no `beforeinstallprompt` handling, no iOS guidance, empty `screenshots: []`, no `shortcuts`. For a daily-entry app, home-screen presence is *the* retention feature; a few small additions complete it.

## 2. UX design

- **Install banner:** a dismissible card at the bottom of the dashboard ("Install Expense Tracker — add to your home screen for one-tap expense entry") shown when: the `beforeinstallprompt` event fired (Chromium), the app isn't already installed (`display-mode: standalone` media query is false), and the user hasn't dismissed it (localStorage, re-offer after 30 days). Tapping calls the stashed event's `prompt()`.
- **iOS path:** Safari has no install event — detect iOS Safari (not standalone) and show the same card with a 2-step visual hint ("Share → Add to Home Screen") in a small sheet.
- **Manifest shortcuts** (long-press app icon): "Add expense" → `/dashboard?quickadd=1`, "Transactions" → `/transactions`.
- **Manifest screenshots:** two real screenshots (mobile + desktop) so Chromium's richer install dialog renders; assets from the existing Playwright suite output are perfect source material.
- Post-install: `appinstalled` event → hide banner, success toast.

## 3. Data model

None. Dismissal state in `localStorage`.

## 4. Server layer

None. Static asset changes only:

- `public/manifest.json`: add `shortcuts` (name, url, 96px icons) and `screenshots` (with `form_factor: "wide"` for the desktop one); files under `public/screenshots/`.
- `?quickadd=1` handling is client-side (below).

## 5. Client layer

- New `components/InstallPrompt.tsx` (client, rendered in the dashboard layout below the content): `useEffect` capturing `beforeinstallprompt` (must `preventDefault()` to defer it), state machine (eligible / dismissed / installed), iOS detection via UA + `navigator.standalone`.
- New `hooks/useInstallPrompt.ts` holding the event ref + `promptInstall()` — keeps the component thin and testable.
- Quick-add shortcut: `app/(dashboard)/dashboard/page.tsx` passes the `quickadd` search param down; `DashboardContent` opens `QuickAddSheet` on mount when set (and `router.replace` to strip the param so refresh doesn't reopen).
- The SW already satisfies installability's offline criterion — no SW changes.

## 6. Offline considerations

None beyond what exists — installability *requires* the current SW, which is already in place.

## 7. Edge cases & interactions

- `beforeinstallprompt` fires once per page load at Chromium's discretion — never assume it; the banner renders only after capture.
- Already-standalone detection must check both `matchMedia("(display-mode: standalone)")` and iOS's `navigator.standalone`.
- The banner must not fight the mobile bottom nav or the toast container — place it in-flow at the top of the dashboard content (like `SyncStatusBar`), not fixed.
- `?quickadd=1` on a read-only past month: the param opens the sheet only when quick-add would render anyway (current month) — guard with the existing `readOnlyMonth` logic.
- Manifest edits are cached by the SW's navigation caching — bump verification: hard-reload + reinstall test after changes (and remember the dev SW gotcha).
- Firefox/desktop Safari: no install event — the banner simply never shows (fine).

## 8. Testing

- Vitest: `useInstallPrompt` state machine with a synthetic event (jsdom docblock), dismissal window math.
- Playwright: banner snapshot with the event synthetically dispatched (`page.evaluate(() => window.dispatchEvent(...))` won't be a real `BeforeInstallPromptEvent` — instead expose a test hook or snapshot the iOS-variant card, which is pure UI); functional check that `?quickadd=1` opens the sheet. Add the banner's testid to existing full-page masks if it can appear there (better: suppress via localStorage in `e2e/helpers.ts` setup so existing snapshots don't churn).

## 9. Effort & risk

**S.** Static manifest work + one component + one hook. The main trap is snapshot churn from a conditionally-appearing banner — pre-dismiss it in the e2e setup helper and test it in isolation.
