# 28 — Light/Dark Theme Toggle

**UX & PWA polish** · Effort: **L** · Inspired by: table stakes in every modern app · Backlog: — · Depends on: —

## 1. Summary & inspiration

The app is hardcoded dark: `app/layout.tsx` renders `<html className="dark …">` unconditionally, and the entire palette is authored in dark slate tones. The Tailwind v4 `dark` variant (`@custom-variant dark (&:is(.dark *))` in `app/globals.css`) already exists but is vestigial — there is no light palette to fall back to. This is the largest-surface UX feature here because it touches every component's colors and re-baselines the entire visual regression suite.

## 2. UX design

- **Settings → Account tab:** a three-way theme control — System / Light / Dark (segmented pill). Also a compact sun/moon toggle in `NavBar`'s sidebar footer for quick switching.
- Default: **Dark** for existing users (zero visual change on upgrade), **System** for fresh installs.
- No flash-of-wrong-theme: an inline `<script>` in `app/layout.tsx` `<head>` reads `localStorage.theme` (or `matchMedia("(prefers-color-scheme: dark)")` for System) and sets the `dark` class before first paint — the standard next-themes-style bootstrap, hand-rolled (~10 lines, no new dependency).
- `manifest.json` `theme_color` and the metadata `themeColor` become media-query pairs (`prefers-color-scheme`) so the browser chrome matches.

## 3. Data model

None — theme is a device preference, `localStorage.theme` (`"light" | "dark" | "system"`). Not synced across devices (correct: devices legitimately differ).

## 4. Server layer

None. The `<html>` class is set client-side pre-paint; server-rendered HTML ships class-less plus the bootstrap script (avoid hydration mismatch by setting the class in the script, not via React state — React never owns that attribute; use `suppressHydrationWarning` on `<html>`).

## 5. Client layer

The real work is **authoring the light palette**:

- `app/globals.css` `@theme` block: audit every color token; add light-mode values. Strategy: keep utilities semantic where possible — the codebase uses raw `slate-*` classes heavily (per the styling conventions), so the practical approach is the Tailwind idiom in reverse: base classes become the **light** values and `dark:` variants restore today's exact dark values (`bg-white dark:bg-slate-900`). That's a sweep across every component — mechanical but wide (~40 components).
- Alternative (lower churn, recommended): define semantic tokens (`--color-surface`, `--color-surface-raised`, `--color-text`, `--color-text-muted`, `--color-border`) in `@theme`, flip their values under `.dark`/`:root`, and migrate components to the tokens **only where slate classes appear**. Same sweep size, but future theme edits become one-file changes.
- New `hooks/useTheme.ts` (`theme, setTheme`, resolves System via `matchMedia` + change listener) + the settings/nav controls.
- Charts: Recharts components use explicit colors — grid/tooltip/axis colors must switch to CSS-variable-driven values (`stroke="var(--color-border)"`).
- The SW dev-gotcha applies in force: unregister SW + clear caches before every visual verification of this work (memory note: it re-registers each load; also purge `.next/dev` if utility classes seem missing).

## 6. Offline considerations

None functionally. `localStorage` works offline; the bootstrap script is part of the cached shell.

## 7. Edge cases & interactions

- **Visual regression suite:** all 91 snapshots are dark; keep dark as the tested default so the diff is only genuinely-changed pixels. Add light-mode coverage as a *small* dedicated set (login + dashboard full-page at desktop, forced via `localStorage` init in the test), not a 2× matrix (snapshot count discipline).
- `stringToColor` label hues and stored category colors: chosen for dark backgrounds — verify contrast on light surfaces; may need a lightness clamp per theme (small helper adjusting L in HSL by theme).
- The amber Pending badge, rose/emerald deltas, brand tokens: check WCAG AA contrast in both themes.
- iOS `theme-color` + `apple-mobile-web-app-status-bar-style`: pair with the manifest updates.
- Print styles (feature 05's report): print should force light.

## 8. Testing

- Vitest: `useTheme` resolution logic (system fallback, listener) if extracted pure; otherwise none.
- Playwright: full re-baseline is **expected** — run `npm run test:ui` first to confirm dark mode is pixel-identical (it must be: base/`dark:` pairs preserve today's values), then add the small light-mode spec. Any dark-mode diff at this stage is a bug, not a re-baseline candidate — that's the safety rail for the whole sweep.

## 9. Effort & risk

**L** — the widest-touch feature in this roadmap. Sequence it last among UI work (every other feature's snapshots would otherwise churn twice). The "dark must stay pixel-identical" invariant turns the visual suite from a burden into the sweep's verification tool.
