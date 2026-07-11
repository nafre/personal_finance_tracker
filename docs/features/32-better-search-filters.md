# 32 — Better Search & Filters

**UX & PWA polish** · Effort: **S** · Inspired by: Lunch Money's filter bar, Firefly III's search · Backlog: — · Depends on: — (feeds 31 command palette)

## 1. Summary & inspiration

Current search (`q`) is a substring match on `note` only — and **case-sensitive on Postgres** (`contains` without `mode: "insensitive"`), so "Grab" misses "grab". The filter bar also lacks two obvious axes: transaction **type** (income/expense) and **amount range**. Small server changes, big daily-use payoff, and feature 31 builds directly on the improved `q`.

## 2. UX design

- **Search** matches across note **and** category **and** labels, case-insensitively. Placeholder text updates to "Search notes, categories, labels…". Amount search: if the query parses as a number, also match exact amount (searching "45" finds RM45.00) — cheap and surprisingly useful.
- **Type filter:** a three-state segmented pill (All / Expense / Income) in the filter bar, mirroring the summary strip's semantics.
- **Amount range:** min/max inputs in a collapsible "More filters" row (with the existing date-range inputs moving there too — the bar is getting crowded at 390px).
- All new filters serialize to URL params (`type`, `min`, `max`) like the existing ones — SWR keying, shareable URLs, and CSV export scoping come free by following the pattern.

## 3. Data model

None. (No new indexes needed at current scale; `[userId, type, date]` already exists for the type filter.)

## 4. Server layer

`lib/actions.ts` `getTransactions` filter build:

- **Case-insensitive multi-field `q`:**
  - Postgres: `OR: [{ note: { contains: q, mode: "insensitive" } }, { category: { contains: q, mode: "insensitive" } }, { labels: { has: q } }]` — note `has` is exact-match on array elements; for substring label matching use `hasSome` won't help either → pragmatic: exact-case-insensitive label match by testing lowercased `q` against `getUsedLabels()`-style values, or accept exact `has` (labels are short tags; exact match is fine — document it).
  - SQLite: `contains` is already case-insensitive for ASCII in SQLite's `LIKE`; labels are JSON strings → the existing JS-side filter path extends to check `parseLabels` values and category (the `getLabelFilter`/JS-filter pattern; keep it bounded per backlog 2j).
  - Numeric `q`: add `{ amount: parsed }` to the OR.
- **Type:** `type: filters.type` when `"income" | "expense"`.
- **Amount range:** `amount: { gte: min, lte: max }`.
- Zod-validate the new params. **`/api/export`** accepts and forwards the same three params (it currently mirrors the filter set — keep them in lockstep, plus the param-validation precedent from backlog 6d).

## 5. Client layer

- `app/(dashboard)/transactions/page.tsx`: extend the filter object (SWR key includes new fields automatically once in the object), the segmented type pill, the "More filters" collapsible, `clearAllFilters` covers new params, `handleExport` forwards them.
- Filter-bar layout at 390px: the collapsible row is the mobile answer — visual check at all three viewports (the Jul 2026 polish pass standards).
- The summary strip (count/income/expense/net) already reflects whatever the filter returns — no change.

## 6. Offline considerations

Server-backed like all transactions-page filtering; no change to the offline story. (Feature 31's IDB fallback is where offline search lives.)

## 7. Edge cases & interactions

- Postgres `mode: "insensitive"` doesn't exist on SQLite Prisma inputs — the filter construction must branch via `IS_SQLITE` (put the `q`-clause builder in `lib/db-adapter.ts` as `getSearchFilter(q)`, alongside `getLabelFilter` — same centralization convention).
- Numeric queries with currency formatting ("rm45", "1,200"): normalize with the same stripping rules as `lib/parser.ts` (reuse its number extraction if exported; otherwise a small shared helper).
- `min > max`: swap silently or show inline hint — pick swap (forgiving).
- Type filter + label/category filters compose (AND) — already how the where-object merges.
- CSV filename: unchanged (month/range naming stays).

## 8. Testing

- Vitest: the shared numeric-normalization helper; `getSearchFilter`'s SQLite JS-predicate variant if returned as a function.
- Playwright: filter bar snapshot changes (pill + More filters) → re-baseline `e2e/transactions.spec.ts` filter-bar tests at three viewports; functional assertions: case-insensitive hit, type filter narrows the summary strip, amount range.

## 9. Effort & risk

**S.** A handful of where-clause branches and one collapsible row. The dialect branching is the only trap — keep it in `lib/db-adapter.ts` where the codebase already solves this class of problem.
