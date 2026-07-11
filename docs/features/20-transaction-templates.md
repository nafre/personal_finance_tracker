# 20 — Transaction Templates / Favorites

**Data & automation** · Effort: **M** · Inspired by: Money Manager's favorites, Toshl's repeat entries · Backlog: **1k** · Depends on: —

## 1. Summary & inspiration

The morning coffee is the same transaction every time — category, amount, note, labels. The category chips in `ExpenseInput` prefill the category but still demand the amount. A template is one tap for the *complete* transaction. Backlog 1k scoped a two-phase approach: derived templates first (no schema), explicit saved templates second. This plan delivers both phases.

## 2. UX design

- **Phase 1 — derived:** a second chip row (or a merged, sectioned row) in `ExpenseInput` on the current-month dashboard: top 3 repeated `(category, amount, note)` tuples from recent history, rendered as "☕ Coffee RM6.50" chips. Tapping **prefills the input text** (`coffee 6.50 kopi #work`) — user confirms with Enter, preserving the review moment (backlog 1k's design).
- **Phase 2 — explicit:** a ⭐ "Save as template" action in `TransactionList`'s row menu → names it → pinned templates render before derived ones (star icon distinguishes them). Manage (rename/reorder/delete) in Settings → a small "Templates" section under the Categories tab.
- Long-press (touch) / hover menu on a pinned chip: "Add instantly" — skips the confirm for the truly ritual entries. Instant-add uses the exact quick-add submit path.
- Chips hidden on `readOnlyMonth` (they ride the quick-add, which is already hidden).

## 3. Data model

Phase 1: none. Phase 2 (both schemas):

```prisma
model Template {
  id        String   @id @default(cuid())
  userId    String
  name      String
  category  String
  amount    Float
  type      String   @default("expense")
  note      String?
  labels    String[] @default([])  // SQLite: JSON string
  sortOrder Int      @default(0)
  createdAt DateTime @default(now())

  @@unique([userId, name])
  @@index([userId])
  @@map("templates")
}
```

SQLite `labels` via `parseBudgetArray`/`encodeBudgetArray` (generic array codecs in `lib/db-adapter.ts`). `deleteUser` cascade extended.

## 4. Server layer

- Phase 1: none — derivation is client-side over data already in props.
- Phase 2: `templateSchema` in `lib/validation.ts`; `getTemplates()`, `saveTemplate(data, id?)`, `deleteTemplate(id)`, `reorderTemplates(ids[])` in `lib/actions.ts`. Dashboard server page fetches `getTemplates()` in parallel → `initialTemplates`.

## 5. Client layer

- **Derivation memo** in `hooks/useDashboardState.ts` (backlog 1k's suggested home): group `mergedTransactions` (plus last month if available via props) by `(category, amount, normalizedNote)`, count ≥ 3, top 3 by recency-weighted count. Pure helper `deriveTemplates(txs)` in `lib/templates.ts` for testability.
- `components/ExpenseInput.tsx`: chips row accepts `templates: TemplateChip[]`; tap → build input text via a `templateToInputText` helper (inverse of `parseExpenseInput` — unit-test the round-trip: parse(toText(t)) ≡ t).
- Instant-add path calls the same `handleSubmit` flow — **not** a separate action — so offline routing, toasts, and optimistic updates come free.
- Settings management UI: small list under Categories tab (no new tab needed).

## 6. Offline considerations

Template *use* is just quick-add — fully offline-capable. Template CRUD (Phase 2) is online-only, consistent with settings mutations. Derived templates work offline by construction (client-side memo).

## 7. Edge cases & interactions

- Round-trip fidelity: amounts with cents, notes containing digits ("2x kopi") must survive `templateToInputText` → parser; where the parser would misread (note starts with a number), fall back to prefilling the structured state directly instead of text (extend `ExpenseInput` with a `prefillParsed` setter).
- Rules engine (feature 19): rules run after parsing — a template with an explicit category won't be overridden (explicit-wins rule).
- Derived chip near-duplicates ("coffee 6.50" vs "coffee 6.90"): group by category+note first, take modal amount — keep the heuristic in one tested function.
- Deleted category referenced by a template: chip still works (free-text category), flag in settings list.
- Duplicate detection (feature 22): instant-add of the same template twice in a minute *should* trigger the dup warning — do not exempt templates.

## 8. Testing

- Vitest: `lib/templates.test.ts` — derivation grouping/thresholds, `templateToInputText` round-trip against `parseExpenseInput` (property-style over fixture set).
- Playwright: quick-add area snapshot gains a chip row → re-baseline dashboard quick-add snapshots; seed fixture history so derived chips are deterministic; settings template list snapshot.

## 9. Effort & risk

**M.** Phase 1 is S and shippable alone; Phase 2 adds the model + settings UI. Risk concentrates in text round-tripping through the parser — the `prefillParsed` fallback removes the failure mode. Supersedes backlog 1k.
