# 10 — Merchant / Note Analytics

**Analytics & insights** · Effort: **S** · Inspired by: Monarch's merchants view, Copilot's recurring-merchant detection · Backlog: — · Depends on: —

## 1. Summary & inspiration

Monarch aggregates by merchant ("Starbucks: 12 visits, RM180 this year"), which is often more actionable than category ("Food: RM900"). This app has no merchant field, but the `note` column plays that role in practice (`coffee 15 starbucks #work` → note "starbucks"). Normalizing and aggregating notes gets 80% of merchant analytics with zero schema change.

## 2. UX design

- **Dashboard (month view):** a "Frequent spots" mini-card in/next to `SpendingInsights`: top 5 normalized notes by total — "starbucks × 6 · RM90", each row linking to `/transactions?q=starbucks&month=&year=`.
- **Category drilldown (feature 04):** "Top notes" section reuses the same aggregation scoped to the category.
- Rows show count, total, and average; a small "↗ vs last month" arrow when the same note existed in `prevMonth` data (v2 — needs prev-month notes fetched; skip in v1).
- Notes are user-typed and sometimes empty — the card renders only when ≥ 3 distinct non-empty notes exist in the month (avoid a sad two-row card).

## 3. Data model

None. (A real `merchant` column is deliberately out of scope — the parser has no reliable way to split merchant from note, and a rules engine (feature 19) can standardize notes instead.)

## 4. Server layer

None for month view — the month's transactions are already in `DashboardContent` props (`initialTransactions` holds the month's rows; verify the fetch isn't capped below the month size — if `getDashboardData` limits its transaction list, add a `noteTotals` aggregate to `_fetchDashboardData` instead: `groupBy(["note"])` with `where: { excludeFromStats: false, note: { not: null } }`, `orderBy _sum.amount desc`, `take: 10`).

Recommendation: do the `groupBy` server-side from the start — it's one indexed query, immune to any client-side list cap, and returns exactly 10 rows.

## 5. Client layer

- Pure normalizer in new `lib/merchant.ts`: `normalizeNote(note)` — lowercase, trim, collapse whitespace, strip trailing digits ("grab 2x" → "grab"). Aggregation groups by the normalized key but displays the most frequent original casing.
- New small `components/FrequentSpots.tsx` (no chart lib; styled rows like `SpendingInsights` bars).
- Wire through `useDashboardState` as a memo if client-side, or as an `initialNoteTotals` prop if server-side (preferred, per above).

## 6. Offline considerations

Read-only. With the server-side aggregate, pending offline transactions won't appear in the card until synced — acceptable for an analytics card.

## 7. Edge cases & interactions

- Chart basis (`excludeFromStats: false`) — it's a pattern stat.
- Notes that are sentences ("dinner with sam at that place") aggregate as noise — the ≥ 2 occurrences threshold per row keeps one-off notes out; only show notes with `count ≥ 2`.
- Case/whitespace variants ("Starbucks", "starbucks ") must merge — that's the normalizer's job; if aggregating server-side, `groupBy` sees raw notes, so either normalize in a TS post-pass over the top-50 raw groups (fine) or accept minor splits (not fine — do the post-pass).
- Search-link handoff: `/transactions?q=` is substring-on-note and case-sensitive on Postgres today — feature 32 (better search) fixes case-insensitivity; until then link with the displayed casing.
- Privacy: notes can be personal; this card must blur under privacy mode (feature 33) like amounts.

## 8. Testing

- Vitest: `lib/merchant.test.ts` — normalization cases, variant merging, threshold, display-casing pick.
- Playwright: seed-dependent contents → `data-testid="frequent-spots"`, dedicated fixed-past-month snapshot; current-month full-page already masks drifting cards — add this one to the mask list if shown on current month.

## 9. Effort & risk

**S.** One `groupBy`, one normalizer, one card. Risk is aggregation quality on messy notes — the count≥2 threshold and post-pass normalization keep the card honest, and feature 19's note-standardizing rules improve it over time.
