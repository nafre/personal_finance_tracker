// Strict whitelist arithmetic evaluator for quick-add amount expressions
// (e.g. "84.60/3+12.50"). Hand-rolled recursive descent — never eval/Function.
// Returns null on anything invalid: unknown characters, syntax errors,
// division by zero, non-finite results, or inputs beyond the size caps.
// Sign policy (rejecting <= 0 amounts) belongs to the caller; negative and
// zero results are returned so the evaluator stays reusable for other
// amount fields.

const MAX_LENGTH = 64;
const MAX_DEPTH = 8;

type Token = { kind: "num"; value: number } | { kind: "op"; value: string };

interface ParseState {
  tokens: Token[];
  pos: number;
  depth: number;
}

export function evaluateExpression(expr: string): number | null {
  if (!expr || expr.length > MAX_LENGTH) return null;
  if (!/^[\d+\-*/().]+$/.test(expr) || !/\d/.test(expr)) return null;

  const tokens = tokenize(expr);
  if (!tokens) return null;

  const state: ParseState = { tokens, pos: 0, depth: 0 };
  const value = parseExpr(state);
  // Trailing unconsumed tokens (e.g. "12+3)") are a syntax error.
  if (value === null || state.pos !== tokens.length) return null;
  if (!Number.isFinite(value)) return null;

  // Round away float dust (0.1+0.2) — amounts are 2dp currency.
  return Math.round(value * 100) / 100;
}

function tokenize(expr: string): Token[] | null {
  const tokens: Token[] = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (/[\d.]/.test(ch)) {
      let j = i;
      while (j < expr.length && /[\d.]/.test(expr[j])) j++;
      const raw = expr.slice(i, j);
      if (!/^\d+(\.\d+)?$/.test(raw)) return null; // rejects "1.2.3", "12.", "."
      tokens.push({ kind: "num", value: parseFloat(raw) });
      i = j;
    } else if ("+-*/()".includes(ch)) {
      tokens.push({ kind: "op", value: ch });
      i++;
    } else {
      return null;
    }
  }
  return tokens;
}

// expr := term (('+'|'-') term)*
function parseExpr(s: ParseState): number | null {
  let left = parseTerm(s);
  if (left === null) return null;
  while (s.pos < s.tokens.length) {
    const t = s.tokens[s.pos];
    if (t.kind !== "op" || (t.value !== "+" && t.value !== "-")) break;
    s.pos++;
    const right = parseTerm(s);
    if (right === null) return null;
    left = t.value === "+" ? left + right : left - right;
  }
  return left;
}

// term := factor (('*'|'/') factor)*
function parseTerm(s: ParseState): number | null {
  let left = parseFactor(s);
  if (left === null) return null;
  while (s.pos < s.tokens.length) {
    const t = s.tokens[s.pos];
    if (t.kind !== "op" || (t.value !== "*" && t.value !== "/")) break;
    s.pos++;
    const right = parseFactor(s);
    if (right === null) return null;
    if (t.value === "/") {
      if (right === 0) return null;
      left = left / right;
    } else {
      left = left * right;
    }
  }
  return left;
}

// factor := number | '(' expr ')' | '-' factor
function parseFactor(s: ParseState): number | null {
  const t = s.tokens[s.pos];
  if (!t) return null;

  if (t.kind === "num") {
    s.pos++;
    return t.value;
  }

  if (t.value === "-") {
    if (s.depth >= MAX_DEPTH) return null;
    s.pos++;
    s.depth++;
    const v = parseFactor(s);
    s.depth--;
    return v === null ? null : -v;
  }

  if (t.value === "(") {
    if (s.depth >= MAX_DEPTH) return null;
    s.pos++;
    s.depth++;
    const v = parseExpr(s);
    s.depth--;
    if (v === null) return null;
    const close = s.tokens[s.pos];
    if (!close || close.kind !== "op" || close.value !== ")") return null;
    s.pos++;
    return v;
  }

  return null;
}
