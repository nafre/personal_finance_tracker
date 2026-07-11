# 21 — Auto-Post Recurring Rules (Vercel Cron)

**Data & automation** · Effort: **M** · Inspired by: every subscription tracker; YNAB's scheduled transactions · Backlog: **1m** · Depends on: — (unlocks 30 Web Push's bill notifications)

## 1. Summary & inspiration

Recurring rules currently require opening the app and pressing Post (or Backfill after falling behind). An opt-in `autoPost` flag plus a daily cron makes rent/subscriptions post themselves — the ledger stays current without ritual. Backlog 1m scoped exactly this, and noted the key gift: **idempotency comes free** because `postRecurringTransaction` advances `lastRun` atomically.

## 2. UX design

- `RecurringForm` gains an **"Post automatically when due"** checkbox (default off; copy: "Posts on the due date without asking").
- `RecurringRow` shows a small ⚡ badge on auto-post rules; the status logic is unchanged (an auto-post rule that cron already handled shows as posted/upcoming naturally).
- Posted-by-cron transactions get note suffix `" (auto)"`? No — keep data clean; instead the transaction is identical to a manual post. Users see results in the list as usual.
- Failure visibility: if cron can't post (e.g. validation edge), the rule simply stays due — the existing due/overdue badges are the alert. (Push notification on auto-post success/failure arrives with feature 30.)

## 3. Data model

Both schemas (backlog 1m's exact change):

```prisma
model RecurringTransaction {
  ...
  autoPost Boolean @default(false)
}
```

## 4. Server layer

- `recurringSchema` in `lib/validation.ts` gains `autoPost: z.boolean().optional()`; `createRecurringTransaction`/`updateRecurringTransaction` pass it through.
- **New route `app/api/cron/route.ts`** (GET):
  - Auth: `Authorization: Bearer ${CRON_SECRET}` (Vercel Cron's convention); constant-time compare; 401 otherwise. Add `CRON_SECRET` to `.env.example`.
  - Logic: for **all users** (cron has no session): `findMany` active `autoPost` rules; for each, compute due state with the same `getNextDueDate`/`getRecurringStatus`/`countMissedPeriods` helpers from `lib/utils.ts`; if due → call the internal posting logic; if ≥ 2 periods behind → the backfill logic (reuse; cap `MAX_BACKFILL`).
  - **Refactor required:** `postRecurringTransaction`/`backfillRecurringTransaction` are session-guarded server actions. Extract their cores into `_postRecurring(db, rule)` / `_backfillRecurring(db, rule)` private helpers taking an explicit rule (already ownership-resolved), called by both the actions (after auth) and the cron route. No behavior change to the actions.
  - Response: `{ posted: n, backfilled: n, errors: [...] }` for log inspection; per-rule try/catch so one bad rule doesn't halt the sweep.
- **`vercel.json`:** `{ "crons": [{ "path": "/api/cron", "schedule": "0 1 * * *" }] }` — daily 01:00 UTC (09:00 MYT, after the day has started locally).
- `proxy.ts`: exempt `/api/cron` from session protection (it has its own auth).

## 5. Client layer

- `components/recurring/RecurringForm.tsx`: checkbox.
- `components/recurring/RecurringRow.tsx`: ⚡ indicator.
- No optimistic complexity — cron-posted rows arrive via normal server rendering on next visit; `RecurringList` already syncs from `initialRecurring` after revalidation.

## 6. Offline considerations

None — cron is server-side by definition. The IDB mirror picks up cron-posted transactions through the normal seed-on-load path (`seedIDBFromServer` never overwrites pending records).

## 7. Edge cases & interactions

- **Idempotency:** re-runs post nothing (due-state recompute after `lastRun` advance) — backlog 1m's point; still add a test.
- Timezone: due-date math in `lib/utils.ts` runs in the server's TZ (UTC on Vercel) while users think in MYT — running at 09:00 MYT means "due today (MYT)" dates have arrived in UTC too for `frequency` granularity of days. Document the 1-hour window subtlety; daily rules are the sensitive case.
- Rules both `autoPost` and manually posted the same morning: `lastRun` advance makes the second actor a no-op.
- `endDate` reached / `isActive` false: excluded by the query + status check (double guard).
- Multi-user: sweep iterates all users' rules — bound with `take` batches if the table ever grows; fine at current scale.
- Local dev: no Vercel Cron — document `curl -H "Authorization: Bearer $CRON_SECRET" localhost:3000/api/cron` for manual testing.
- Demo user's rules: allowed (posts to demo data; harmless and makes the demo look alive).

## 8. Testing

- Vitest: due-state selection logic if extracted pure (`selectDueAutoPostRules(rules, now)`); idempotency covered by existing `lastRun` unit tests plus a new double-run case.
- Playwright: `RecurringForm`/`RecurringRow` snapshots re-baselined (checkbox + badge). Cron route: manual curl verification in dev + a functional assertion is optional (route needs seeded due rules).

## 9. Effort & risk

**M.** The action-core extraction is the only delicate refactor — keep the public actions byte-identical in behavior. Everything else is a small column, a checkbox, and a well-guarded route. Supersedes backlog 1m.
