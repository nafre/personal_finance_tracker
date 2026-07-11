# 26 — Full JSON Backup & Restore

**Data & automation** · Effort: **M** · Inspired by: Actual Budget's export/restore, Firefly III's data export · Backlog: **6c** · Depends on: —

## 1. Summary & inspiration

CSV export covers transactions; a *backup* covers everything — categories, budgets, recurring rules, (goals/templates/rules as they land). For a self-hosted-ish personal finance app, "my data is one file I can keep" is a trust feature. Backlog 6c scoped the export half; restore is what makes it a real backup rather than a souvenir.

## 2. UX design

- **Settings → Account tab**, new "Data" section:
  - **Download backup** button → `expense-tracker-backup-YYYY-MM-DD.json`.
  - **Restore from backup** → file picker → summary preview ("2,431 transactions · 14 categories · 6 budgets · 3 recurring rules, exported 2026-06-01") → mode choice: **Merge** (skip records whose IDs already exist) or **Replace all** (wipe user data first — double-confirm with typed "REPLACE" input; the one place that ceremony is warranted).
  - Restore ends with a summary toast and a `router.refresh()`.
- Copy notes: attachments (feature 25) are not included; passwords/users are never included.

## 3. Data model

None. The backup format is a versioned envelope:

```json
{ "app": "expense-tracker", "version": 1, "exportedAt": "…",
  "transactions": [...], "categories": [...], "budgets": [...], "recurring": [...] }
```

`version` gates future migrations; unknown top-level keys are ignored on restore (forward-tolerant). Server IDs (cuids) are preserved — they're the merge keys.

## 4. Server layer

- **Export:** `GET /api/backup` route (streaming a large JSON body fits a route better than a server action; `/api/export` precedent). Session-checked; queries all four models for the user (bounded `take: 50_000` on transactions with a warning field if truncated); arrays pass through `normalizeTx`/`normalizeBudget` so the file format is dialect-independent (real arrays, ISO dates) — a SQLite-mode backup restores cleanly into Postgres and vice versa. `Content-Disposition: attachment`.
- **Restore:** `restoreBackup(payload, mode)` server action:
  - Zod: envelope schema with per-model array schemas (reuse `transactionSchema` etc. loosened to accept `id`/`createdAt`); overall size cap (~10 MB) and per-model count caps.
  - `Replace`: one `db.$transaction` — `deleteMany` per model (transactions, budgets, recurring, non-default categories) then chunked `createMany` (500/chunk) with dialect encoding via `encodeLabels`/`encodeBudgetArray`.
  - `Merge`: fetch existing ID sets (`select: { id: true }`), insert only unseen IDs.
  - Force `userId` to the session user on every record — a backup from another account restores as *your* data, never cross-writes.
- `revalidatePath` both pages after restore.

## 5. Client layer

- `components/BackupSection.tsx` in the Account tab (`SettingsTabs` passes role — hide restore for demo).
- Client parses the file for the preview (counts + exportedAt) before calling the action; the action re-validates from scratch (client preview is UX, not trust).
- Restore of >5k transactions: chunked action calls with a progress bar (same chunking pattern as feature 18).

## 6. Offline considerations

Online-only (settings-class). After a Replace restore, the IDB mirror is stale — trigger `reconcileAfterSync(userId)` (exists in `lib/sync.ts`) post-restore so ghost records purge without a manual cache clear; pending offline ops from before a Replace are dropped with a warning if `pendingCount > 0` ("Sync pending changes first").

## 7. Edge cases & interactions

- **Replace + pending sync queue** is the sharp edge: block Replace while `pendingCount > 0` (the `useSyncContext` value is right there).
- Duplicate `@@unique([userId, name])` collisions on Merge (category/budget names with different IDs): skip-and-report, don't fail the batch.
- `clientId` uniqueness on transactions: strip `clientId` on restore (it's a sync artifact, globally unique-constrained).
- Default categories: Replace re-seeds via existing `addDefaultCategories` semantics if the backup lacks them? No — restore exactly what's in the file; the app tolerates their absence and Settings has "restore defaults" already.
- Version 2 formats later (goals, rules, templates): additive keys; restore v1 files forever.
- This feature is also the safety story for risky operations elsewhere (import, bulk edit): docs for those point here ("download a backup first").

## 8. Testing

- Vitest: envelope schema acceptance/rejection, merge-set diffing, userId-forcing, clientId stripping — pure helpers in `lib/backup.ts`.
- Playwright: Data section snapshot in `e2e/settings.spec.ts`; functional round-trip on SQLite dev (export → wipe → restore → assert counts) as a non-snapshot test.

## 9. Effort & risk

**M.** Export is an afternoon; restore's transactionality and the pending-queue guard are the careful parts. The dialect-normalized format (arrays + ISO dates) is what makes the file a true escape hatch. Supersedes backlog 6c.
