import { evaluateExpression } from "./math-eval";

export interface ParsedExpense {
  category: string;
  amount: number;
  type: "income" | "expense";
  note?: string;
  labels: string[];
}

// Keywords that indicate the transaction is income
const INCOME_KEYWORDS = new Set([
  "salary",
  "income",
  "freelance",
  "dividend",
  "bonus",
  "refund",
  "interest",
  "wage",
  "wages",
  "stipend",
  "commission",
  "revenue",
  "payment",
  "earning",
  "earnings",
  "grant",
  "allowance",
  "pension",
  "investment",
  "return",
  "reward",
  "cashback",
  "rebate",
  "reimbursement",
  "sell",
  "sold",
]);

// Strip currency symbols / prefixes from a token and return the numeric value.
// Tokens that are pure arithmetic expressions ("12+8.5", "(23+9)/2") are
// evaluated. Anything else must be a fully-numeric token ("20", "4.5") to be
// accepted — a token with trailing non-numeric characters ("2-in-1", "20abc",
// "2k") is rejected rather than silently truncated to its leading digits via
// parseFloat, which used to produce a wrong amount (e.g. "2-in-1" -> 2)
// instead of falling through to the real numeric token later in the input.
function extractNumericValue(token: string): number | null {
  // Remove common currency prefixes: rm, $, €, £, ¥, ₹, usd, etc.
  const cleaned = token.replace(/^[a-z$€£¥₹]+/i, "").replace(/,/g, "");
  if (!cleaned) return null;
  // Expression path: full charset match + contains a digit + an operator/paren.
  if (
    /^[\d+\-*/().]+$/.test(cleaned) &&
    /\d/.test(cleaned) &&
    /[+\-*/()]/.test(cleaned)
  ) {
    const val = evaluateExpression(cleaned);
    return val === null || val <= 0 ? null : val;
  }
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const num = parseFloat(cleaned);
  return num <= 0 ? null : num;
}

function capitalize(str: string): string {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/**
 * Parse natural language expense input.
 *
 * Format:  [category words] [amount] [optional note] [#label ...]
 * Examples:
 *   "food 20"                    → { category: "Food",      amount: 20,   type: "expense", labels: [] }
 *   "grab rm15 #transport"       → { category: "Grab",      amount: 15,   type: "expense", labels: ["transport"] }
 *   "salary 5000 #work"          → { category: "Salary",    amount: 5000, type: "income",  labels: ["work"] }
 *   "coffee 4.5 starbucks #date" → { category: "Coffee",    amount: 4.5,  type: "expense", note: "starbucks", labels: ["date"] }
 *   "lunch 84.60/3+12.50 #work"  → { category: "Lunch",     amount: 40.7, type: "expense", labels: ["work"] }
 *
 * The amount may be an arithmetic expression (+ - * / and parens) with no
 * internal spaces — tokens are whitespace-split, so "12 + 8" parses the
 * amount as 12 with note "+ 8". That's deliberate: it keeps notes like
 * "coffee 3 + friends" unambiguous.
 */
export function parseExpenseInput(input: string): ParsedExpense | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const tokens = trimmed.split(/\s+/);
  if (tokens.length === 0) return null;

  // Find the first token that looks like a number (possibly with currency prefix)
  let amountIndex = -1;
  let amount = 0;

  for (let i = 0; i < tokens.length; i++) {
    const val = extractNumericValue(tokens[i]);
    if (val !== null) {
      amount = val;
      amountIndex = i;
      break;
    }
  }

  if (amountIndex === -1) return null;

  const categoryTokens = tokens.slice(0, amountIndex);
  const afterAmountTokens = tokens.slice(amountIndex + 1);

  // Split #label tokens from note tokens, deduping repeated tags
  const labels: string[] = [];
  const seenLabels = new Set<string>();
  const noteTokens: string[] = [];
  for (const tok of afterAmountTokens) {
    if (tok.startsWith("#") && tok.length > 1) {
      const label = tok.slice(1).toLowerCase();
      if (!seenLabels.has(label)) {
        seenLabels.add(label);
        labels.push(label);
      }
    } else {
      noteTokens.push(tok);
    }
  }

  // If nothing came before the number, default to "Misc"
  const rawCategory =
    categoryTokens.length > 0 ? categoryTokens.join(" ") : "Misc";

  // Capitalize each word in the category
  const category = rawCategory
    .split(" ")
    .map(capitalize)
    .join(" ");

  const note = noteTokens.join(" ") || undefined;

  // Determine type based on first category word only — scanning every token
  // misclassifies payer-case phrasing ("paid salary 5000" is an expense) as
  // income, since the income noun is still present later in the sentence.
  // See docs/IMPROVEMENTS_BACKLOG.md 5h for the evaluated-and-rejected alternative.
  const firstWord = (categoryTokens[0] ?? "").toLowerCase();
  const type: "income" | "expense" = INCOME_KEYWORDS.has(firstWord)
    ? "income"
    : "expense";

  return { category, amount, type, note, labels };
}
