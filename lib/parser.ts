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

// Strip currency symbols / prefixes from a token and return the numeric value
function extractNumericValue(token: string): number | null {
  // Remove common currency prefixes: rm, $, €, £, ¥, ₹, usd, etc.
  const cleaned = token.replace(/^[a-z$€£¥₹]+/i, "").replace(/,/g, "");
  if (!cleaned) return null;
  const num = parseFloat(cleaned);
  return isNaN(num) || num <= 0 ? null : num;
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

  // Split #label tokens from note tokens
  const labels: string[] = [];
  const noteTokens: string[] = [];
  for (const tok of afterAmountTokens) {
    if (tok.startsWith("#") && tok.length > 1) {
      labels.push(tok.slice(1).toLowerCase());
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

  // Determine type based on first category word
  const firstWord = (categoryTokens[0] ?? "").toLowerCase();
  const type: "income" | "expense" = INCOME_KEYWORDS.has(firstWord)
    ? "income"
    : "expense";

  return { category, amount, type, note, labels };
}
