# 33 — Privacy Mode (Blur Amounts)

**UX & PWA polish** · Effort: **S** · Inspired by: banking apps' balance-hide toggle (Maybank, Revolut) · Backlog: — · Depends on: —

## 1. Summary & inspiration

Every Malaysian banking app has the eye icon: tap to blur balances before opening the app on public transport or screen-sharing. One toggle, all currency amounts become `RM ••••` (or a blur), state persists per device. Trivial to build, disproportionately appreciated.

## 2. UX design

- **Toggle:** an eye/eye-off icon button in `NavBar` (desktop sidebar footer + mobile: in the top area near `SyncStatusBar`, or as the 5th bottom-nav slot if one is free — sidebar footer + a dashboard header icon is the safe placement). `aria-label="Hide amounts"` / `"Show amounts"`; `aria-pressed`.
- **Effect:** all currency figures render blurred (`blur-sm select-none` + `transition`) or masked (`RM ••••`). **Blur, not masking, is the right mechanism** here (see Client layer — masking would fight `useCountUp` and `amountMasks`). Tapping any blurred amount does *not* reveal it (no per-item peek in v1 — global toggle only, keeps the mental model binary).
- Charts: axis labels and tooltips also hide (tooltips suppressed entirely while private; Y-axis ticks hidden) — a blurred bar chart shape is fine to show.
- Notes (potentially sensitive, see feature 10): not blurred in v1 — amounts only, matching the banking-app convention.
- State persists in `localStorage`; defaults off; syncs across tabs via the `storage` event.

## 3. Data model

None.

## 4. Server layer

None. Purely presentational — data still arrives; this is a shoulder-surfing shield, not a security boundary (say so in no UI copy — nobody expects otherwise from the banking-app pattern).

## 5. Client layer

- New `context/PrivacyContext.tsx` (tiny: `{ isPrivate, toggle }`, localStorage-backed, `storage`-event listener) mounted in `Providers`. A context (not per-component localStorage reads) so the toggle re-renders everything at once.
- **The leverage point:** currency displays are consistently rendered with the `tabular-nums` class (that's how `amountMasks` finds them in e2e). Implementation: a global CSS hook — `<html data-private>` set by the context, plus one rule: `[data-private] .tabular-nums { filter: blur(6px); user-select: none; }`. Zero component changes for 90% of coverage; components whose amounts don't carry `tabular-nums` get an `<Amount>` wrapper or the class added (audit: stat cards, chart center labels, budget lines — CLAUDE.md notes `.tabular-nums` masking convention already covers currency broadly).
- Chart tooltips/axes: charts read `isPrivate` via context and pass `tick={false}` / skip tooltip rendering; `useCountUp` numbers keep animating under blur harmlessly.
- The toggle button in `NavBar` (client component already).

## 6. Offline considerations

None — localStorage + CSS. Works identically offline.

## 7. Edge cases & interactions

- Quick-add input: the user is *typing* an amount — never blur inputs (`input`/`textarea` excluded by the selector scope).
- CSV export/backup while private: exports real data (of course); no interaction.
- Blur is CSS — DevTools reveals values. Fine: threat model is shoulder-surfing.
- `prefers-reduced-motion`: blur transition is subtle; respect `useReducedMotion` conventions by skipping the transition, not the blur.
- PDF/print (feature 05's report): print while private should print blurred? Choose: print always reveals (a deliberate act) — force-remove the attribute in `@media print`. Simpler and least surprising.
- The count-up animation with blur: values illegible anyway — no change needed.

## 8. Testing

- Vitest: context persistence/toggle logic (jsdom docblock file, like `lib/sync.test.ts`'s pattern).
- Playwright: one dedicated snapshot — dashboard with privacy on (desktop only, one viewport is enough; blurred pixels are stable because `amountMasks` regions were the volatile parts and they're now uniformly blurred — still keep the masks applied for safety). Existing snapshots unaffected (default off).

## 9. Effort & risk

**S.** The `data-private` + `.tabular-nums` CSS hook makes this nearly free — the same convention that keeps e2e stable delivers privacy mode. The only real work is auditing stragglers that show currency without the class.
