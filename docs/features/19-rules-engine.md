# 19 — Auto-Categorization Rules Engine

**Data & automation** · Effort: **L** · Inspired by: Firefly III's rule engine, Lunch Money's rules · Backlog: — · Depends on: 18 (soft — import is where rules shine first)

## 1. Summary & inspiration

Firefly III's killer feature: "when note contains *grab* → category Transport, add label #ride". Rules make entry and import self-cleaning. This app's quick-add parser already categorizes explicit input; rules cover what the parser can't know — personal merchant→category mappings — and they're the fix for messy imported bank data (feature 18) and inconsistent notes (feature 10).

## 2. UX design

- **Settings → new "Rules" tab** (extend `SettingsTabs`): ordered rule list with drag handle (or up/down buttons — simpler, no dnd dep), enable toggle, edit, delete (two-step confirm).
- **Rule form:** WHEN — note contains / note matches exactly / amount between / category is (all conditions AND-ed; any may be empty) · THEN — set category / add labels / set off-chart flag / rewrite note (any subset). Live preview: "would match 23 existing transactions" with a sample list.
- **Apply retroactively:** an "Apply to existing" button per rule (two-step confirm) with a result toast ("Updated 23 transactions").
- **At entry:** quick-add applies rules *after* parsing, only filling what the user didn't specify explicitly (explicit input always wins). A subtle "→ Transport (rule)" chip appears in the input's preview so the user sees the rule fire before submit.
- **At import:** feature 18's preview runs rules over parsed rows, showing rule-applied values inline.

## 3. Data model

New model, both schemas:

```prisma
model Rule {
  id          String   @id @default(cuid())
  userId      String
  name        String
  priority    Int                    // evaluation order, ascending
  isActive    Boolean  @default(true)
  // conditions (null = not used)
  noteContains String?
  noteEquals   String?
  amountMin    Float?
  amountMax    Float?
  categoryIs   String?
  // actions (null = not used)
  setCategory  String?
  addLabels    String[] @default([]) // SQLite: JSON string via db-adapter helpers
  setOffChart  Boolean?
  rewriteNote  String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([userId, isActive, priority])
  @@map("rules")
}
```

SQLite: `addLabels String @default("[]")` — parse/encode via new `parseBudgetArray`-style helpers in `lib/db-adapter.ts` (reuse `parseBudgetArray`/`encodeBudgetArray`; they're generic string-array codecs). Flat columns instead of a JSON conditions blob: fewer footguns across dialects, and v1's condition set is small. `deleteUser` cascade adds `rule.deleteMany`.

## 4. Server layer

- **Pure evaluator** `lib/rules.ts`: `applyRules(tx, rules)` → patched fields + `matchedRuleIds`. First-match-wins per *field* (a later rule can still fill a field an earlier rule didn't touch); case-insensitive contains. Shared verbatim by server and client — no drift.
- `lib/validation.ts`: `ruleSchema` (at least one condition AND one action; `rewriteNote` length cap).
- `lib/actions.ts`: `getRules()`, `saveRule(data, id?)`, `deleteRule(id)`, `reorderRules(ids[])`, `applyRuleToExisting(id)` (bounded `findMany` on matching conditions → `updateMany`-per-row loop in a `$transaction`, cap 1,000, return count), `previewRuleMatches(conditions)` (count + 5 samples).
- **Application points:** `addTransaction` and `/api/sync`'s add path run `applyRules` server-side (fetch active rules — cheap, cacheable per request) so offline-queued adds get rules applied at sync time too. `updateTransaction` does *not* auto-apply (edits are deliberate).

## 5. Client layer

- `components/RuleManager.tsx` under the new settings tab; form + list + preview (SWR for the preview call, debounced).
- `components/ExpenseInput.tsx`: fetch active rules once (they're tiny; pass down from the dashboard server page as `initialRules`), run `applyRules` on the parsed draft for the preview chip, and include rule-applied fields in the optimistic payload so the UI matches what the server will store.
- Import preview (feature 18): run `applyRules` over rows client-side before render.

## 6. Offline considerations

The evaluator being pure and shared is the crux: offline adds apply rules **client-side** for optimistic display, and the server re-applies at `/api/sync` time — same module, same result. Rule CRUD is online-only (settings-class).

## 7. Edge cases & interactions

- Explicit user input beats rules: quick-add only lets rules fill category when the parser defaulted to `"Misc"`, and never overrides an explicit `#label` or typed category token.
- Rule chains: v1 rules don't trigger other rules (single pass over the ordered list) — Firefly's cascade complexity isn't worth it here.
- `setCategory` to a category that later gets deleted: rules store name strings like transactions do; stale rules still "work" (free-text category) — the rule list flags names without a `Category` record.
- `applyRuleToExisting` vs budgets/stats: recategorization changes chart aggregates for past months — that's the point; revalidate both paths.
- Regex: **not in v1** (`noteContains`/`noteEquals` only) — no ReDoS surface, no escaping UX.
- Demo role: rules tab read-only.

## 8. Testing

- Vitest: `lib/rules.test.ts` — per-field first-match-wins, condition AND-ing, case-insensitivity, empty-condition guard, parser-interplay (explicit category not overridden).
- Playwright: settings rules tab snapshots (list + form) in `e2e/settings.spec.ts`; functional check that quick-add shows the rule chip.

## 9. Effort & risk

**L.** New model, new settings tab, three application points. The design discipline that keeps it sane: one pure evaluator module, flat condition columns, no regex, no cascades. Build after (or alongside) import — bank-data cleanup is the motivating use case.
