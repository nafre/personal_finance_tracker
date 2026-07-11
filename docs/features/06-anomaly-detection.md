# 06 — Anomaly & Large-Transaction Flags

**Analytics & insights** · Effort: **M** · Inspired by: Copilot's "unusual spending" alerts, Monarch's transaction review · Backlog: — · Depends on: —

## 1. Summary & inspiration

Copilot flags transactions and category months that deviate from your own baseline ("Dining is 2× your usual"). No ML needed — robust statistics (median + MAD, or trailing-mean z-score) over the user's own history catch the interesting cases: a fat-fingered `food 200` instead of `food 20`, a category quietly doubling, a duplicate charge.

## 2. UX design

Two surfaces:

1. **Row flag:** an amber `⚡ Unusual` badge on `TransactionList` rows whose amount is an outlier for their category (≥ k·MAD above the category median, minimum sample 5). Tooltip: "3× your typical Food expense (median RM18)". Purely informational — dismissable per transaction via an ✕ that stores the ID in localStorage (no schema change for dismissals in v1).
2. **Insight card:** a "This month vs usual" section inside `SpendingInsights` (or a sibling card): categories whose month-to-date total exceeds their trailing-3-month average by > 50% and > RM50 absolute (both gates, to avoid flagging RM4→RM7). Max 3 items, sorted by absolute excess, each linking to `/transactions?month=&year=&category=X`.

Current month only (it's a "pay attention now" feature); hidden on `readOnlyMonth`.

## 3. Data model

None in v1 (localStorage dismissals). If per-device dismissal proves annoying, v2 adds `dismissedFlags String[] @default([])` to `Transaction` — on SQLite a JSON string via new `parseBudgetArray`-style helpers in `lib/db-adapter.ts`.

## 4. Server layer

The row flag needs per-category baselines the dashboard doesn't currently fetch:

- Add `getCategoryBaselines()` to `lib/actions.ts`: `groupBy` won't produce medians, so fetch the last 6 months of expenses as `{ category, amount }` (`select` only those two fields, bounded `take: 5000`) and compute `{ category → { median, mad, count } }` in TS. Chart basis (`excludeFromStats: false`) — anomalies are a pattern stat.
- Fetch it on the dashboard server page in parallel (current month only) and pass as `initialBaselines`.

Category-spike detection needs trailing months' category totals: reuse the already-fetched `prevCategoryData` for month-1 and extend to trailing-3 by fetching two more `groupBy(["category"])` months inside the same action (cheap, indexed on `[userId, category]`).

## 5. Client layer

- New pure module `lib/anomaly.ts`: `isOutlier(amount, baseline, k = 3.5)`, `computeCategorySpikes(current, trailing[])` — unit-testable like `lib/parser.ts`.
- `TransactionList`: accept optional `baselines` prop; render the badge (same styling family as the "Pending"/"Off-chart" badges). Dashboard passes it; the transactions page can skip it in v1.
- `SpendingInsights`: accept `spikes` prop, render the section.
- `useDashboardState`: memo mapping transactions → flag set; recompute on optimistic add so a just-typed outlier flags immediately (great UX for typo-catching).

## 6. Offline considerations

Flags are derived client-side from server-fetched baselines — works for pending transactions too (they're in the merged list). Baselines go stale offline; acceptable.

## 7. Edge cases & interactions

- New categories (< 5 samples): never flag — the minimum-sample gate.
- MAD = 0 (all identical amounts, e.g. a RM15 subscription category): fall back to "flag if > 2× median".
- Income: skip entirely (salary is "unusual" by design).
- `excludeFromStats` rows: excluded from baselines and never flagged (they're already declared atypical).
- Recurring-posted transactions: their amounts are fixed by the rule — exclude from *flagging* (match by category+amount to active rules) to avoid flagging rent every month, but keep them in baselines.
- Tone: badges must read as "worth a glance", not red-alert — amber, dismissable, never blocking.

## 8. Testing

- Vitest: `lib/anomaly.test.ts` — MAD math, zero-MAD fallback, sample-size gate, spike gates (percentage AND absolute), recurring exclusion.
- Playwright: seed-dependent and month-relative → presence-only test with a `data-testid="anomaly-section"`; mask in current-month full-page snapshot (contents drift with the day).

## 9. Effort & risk

**M.** The statistics are trivial; the real work is tuning thresholds so flags feel smart, not noisy. Ship behind conservative gates (k=3.5, both spike gates) and loosen later.
