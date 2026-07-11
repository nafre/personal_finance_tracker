# 18 — CSV Import with Mapping & Dedup

**Data & automation** · Effort: **L** · Inspired by: Actual Budget's file import, Firefly III's CSV importer · Backlog: **1l** · Depends on: — (unlocks 19 rules engine's bulk path)

## 1. Summary & inspiration

The companion to the existing CSV export — and the on-ramp for anyone arriving with history in a bank export or another app. Actual's flow is the model: upload → map columns → preview with dedup flags → import. Backlog 1l scoped the essentials (own-format first, client-side parse, preview with checkboxes, batched server action).

## 2. UX design

A 3-step `ImportDialog` (dynamically imported, `useDialogBehavior`, `role="dialog"`), launched from an **Import** button beside Export CSV on `/transactions`:

1. **Upload:** file picker + drag-drop, `.csv` only, ≤ 2 MB. Own-export format (`Date, Category, Type, Amount (RM), Note, Labels`) is auto-detected by header match and skips step 2.
2. **Map columns:** table of CSV headers → target fields (Date, Amount, Category, Type, Note, Labels) with auto-guessing by header name; date-format picker (`YYYY-MM-DD` / `DD/MM/YYYY` / `MM/DD/YYYY`) with a live sample row preview; amount options: "negative = expense" or a separate type column, strip `RM`/commas.
3. **Preview & confirm:** parsed rows in a table — valid rows checked, invalid rows (bad date/amount) unchecked with a reason, **suspected duplicates flagged amber but still selectable** (never silently skipped — backlog 1l's rule). Footer: "Import 143 of 150 rows". Progress bar during submit; summary toast after.

## 3. Data model

None. Imported rows are ordinary `Transaction`s. (Deliberately no `importBatchId` in v1 — "undo import" is served by feature 26's backup-before-import advice; add the batch column later if demanded.)

## 4. Server layer

- New `addTransactions(rows: TransactionInput[])` in `lib/actions.ts` (backlog 1l's shape):
  - Zod: `z.array(transactionSchema).max(500)` — client chunks larger files into sequential 500-row calls.
  - Insert via `createMany` (both dialects support it; on SQLite encode `labels` with `encodeLabels`, and note `createMany` skips Prisma middlewares — build the encoded rows explicitly).
  - One `revalidatePath` pair per call, not per row.
- **Dedup check** `findImportDuplicates(rows)`: for the file's date span, fetch existing `(date, amount, category)` tuples (`select` those fields only) and return indices of matches (±0 day exact-date match on `(date, amount)`; category as a tiebreaker per backlog 1l). Runs once before preview render.
- Parsing stays **client-side** (no file ever hits the server unparsed): hand-rolled CSV parser in `lib/csv.ts` — quoted fields, escaped quotes, CRLF. ~80 lines, zero deps, fully unit-testable. (papaparse is fine too, but the repo's toast/dialog precedent favors no new deps.)

## 5. Client layer

- `components/ImportDialog.tsx` (steps as internal state machine) + `lib/csv.ts` (`parseCsv`, `guessColumnMap`, `parseAmount`, `parseDateWithFormat`, `rowToTransactionInput`).
- Categories in the preview: unknown category strings get a "new" chip; import proceeds with free-text categories (the app already supports category strings without a `Category` record) — offer a "create missing categories" checkbox that calls `addCategory` for each.
- After import: `mutate()` the SWR transactions cache (the page's existing pattern) and refresh.

## 6. Offline considerations

**Online-only** — batch inserts don't fit the single-op sync queue, and importing offline is a niche of a niche. Disable the Import button with a tooltip when `!isOnline` (from `useSyncContext`).

## 7. Edge cases & interactions

- Dates: imported rows keep their historical dates (unlike quick-add's today-anchoring) — `transactionSchema` must accept past dates (it does for edits; verify bounds, reject year < 1970 / future > today+1d).
- Timezones: parse dates as **local midnight**, consistent with how the app's day bucketing works — never `Date.parse` a bare `DD/MM/YYYY`.
- Duplicate flags are advisory; re-importing the same file twice with all boxes checked *will* duplicate — the amber flags + a confirm ("12 flagged duplicates selected") are the guardrails.
- `clientId` upsert dedup (the offline mechanism) does **not** apply here — imports have no temp IDs.
- Large files: 500-row chunks sequentially with progress; abort leaves earlier chunks committed — say so in the progress UI ("imported so far: N").
- Budgets/stat cards after import: server revalidation handles it (no optimistic patching of historical months).
- Demo role: disable import.

## 8. Testing

- Vitest: `lib/csv.test.ts` — quoting/escaping/CRLF, header guessing, all three date formats, amount forms (`-12.50`, `RM1,234.56`, type-column mode), own-format round-trip against the export route's exact header row.
- Playwright: dialog snapshots per step (fixture CSV via `setInputFiles`), three viewports; functional assertion that imported rows appear in the list. Add to `e2e/transactions.spec.ts`.

## 9. Effort & risk

**L.** Three-step UI + parser + batch action + dedup. The parser is the most test-heavy part; the UX risk is the mapping step overwhelming casual users — auto-detection of the own-export format keeps the common case one-click. Supersedes backlog 1l.
