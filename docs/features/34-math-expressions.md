# 34 — Math Expressions in Quick-Add

**UX & PWA polish** · Effort: **S** · Inspired by: Actual Budget's math-in-amount-fields, Soulver-style entry · Backlog: — · Depends on: —

> **Status: DONE (Jul 2026)** — shipped in commit `41f4094` (quick-add v1): `lib/math-eval.ts` + the `extractNumericValue` expression path in `lib/parser.ts`, with full unit coverage (`lib/math-eval.test.ts`, extended `lib/parser.test.ts`). Also fixed a latent mis-parse (`food 12+8.5` used to parse as 12). Still open: the v1.1 extension to the edit-form/RecurringForm/BudgetManager amount fields (§2 last bullet); the optional placeholder example was skipped (known snapshot-flake surface).

## 1. Summary & inspiration

Splitting a bill or adding up a receipt currently means reaching for a calculator: "my share is 84.60/3 plus the 12.50 parking". Actual Budget lets every amount field evaluate arithmetic. Here it belongs in the parser: `lunch 84.60/3+12.50 #work` → RM40.70. Pure `lib/parser.ts` work — the safest, most test-friendly feature in this roadmap.

## 2. UX design

- Quick-add accepts `+ - * / ( )` in the amount token: `food 12+8.5`, `grab (23+9)/2`, `share 84.60/3`.
- The input's live parse preview (the existing category/amount feedback in `ExpenseInput`) shows the **evaluated** result — `= RM40.70` — before submit, so there's never a surprise commit.
- Invalid math (`12+`, `5/0`) → parser returns null for the amount → same behavior as any unparseable input today (submit disabled / no preview).
- Also honor expressions in the `TransactionList` inline edit form's amount field and `RecurringForm`/`BudgetManager` amount inputs (same evaluator on blur) — v1.1; quick-add first.

## 3. Data model

None.

## 4. Server layer

None. Evaluation is client-side pre-submit; the server receives a plain number validated by `transactionSchema` exactly as today.

## 5. Client layer

All in `lib/`:

- New `lib/math-eval.ts`: `evaluateExpression(expr: string): number | null` — a ~60-line recursive-descent / shunting-yard evaluator over a strict token set (digits, `.`, `+ - * / ( )`). **Never `eval`/`Function`** — whitelist tokenizer + hand-rolled parser; anything outside the token set → null. Guards: division by zero → null, result ≤ 0 → null (matching the parser's existing zero/negative rejection), precision: round to 2dp at the end (float dust like `0.1+0.2`).
- `lib/parser.ts` `parseExpenseInput`: the amount-extraction step currently matches a numeric token; extend to match an *expression* token (a maximal run of expression characters, still stripping the `rm` prefix and thousands-commas first) and feed it through `evaluateExpression`. Careful token boundaries: `#` labels and words must not be swallowed — expression chars are only `[0-9+\-*/().,]`, and the existing note/label extraction runs on the remaining tokens unchanged.
- `components/ExpenseInput.tsx`: no logic change — its preview already renders whatever the parser returns; optionally show the original expression alongside (`84.60/3+12.50 = RM40.70`).

## 6. Offline considerations

None — pure client parsing; the offline mutation path receives the evaluated number like any other.

## 7. Edge cases & interactions

- **The `-` ambiguity:** `food 20-5` is math (15), but a note like "food 2-in-1" contains a dash — the tokenizer only treats a token as an expression if it *fully* matches the expression charset AND contains a digit; mixed alphanumeric tokens stay notes. Unary minus producing negative totals → rejected (≤ 0 guard).
- Thousands separators inside expressions (`1,200+300`): strip commas before tokenizing (parser already strips them for plain numbers — reuse).
- Whitespace within expressions (`12 + 8`): v1 requires no internal spaces (a space ends the token; `12 + 8` would parse amount 12, note "+ 8"). Document in the input's helper text; supporting spaced expressions would make "coffee 3 + friends" ambiguous — the no-space rule is the disambiguator.
- Very long expressions: cap length (64 chars) and nesting depth (8) — trivial DoS hygiene.
- Income keywords, labels, type toggle: untouched — evaluation happens strictly inside amount extraction.

## 8. Testing

- Vitest — the heart of this feature: `lib/math-eval.test.ts` (precedence, parens, division-by-zero, negatives, float rounding, injection attempts like `1;alert(1)`, length caps) and new `lib/parser.test.ts` cases (expression amounts with labels/notes/income keywords, the dash-in-note non-ambiguity, no-space rule).
- Playwright: none needed beyond existing quick-add coverage (no visual change); optionally one functional assert: type `coffee 12/2`, submit, row shows RM6.00.

## 9. Effort & risk

**S** — and the best effort-to-delight ratio in the roadmap. The evaluator must be a strict whitelist parser (no `eval` under any pressure), and the no-internal-spaces rule keeps the grammar unambiguous. Ship first.
