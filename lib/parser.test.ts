import { describe, it, expect } from "vitest";
import { parseExpenseInput } from "./parser";

describe("parseExpenseInput", () => {
  it("parses a plain category + amount", () => {
    expect(parseExpenseInput("food 20")).toEqual({
      category: "Food",
      amount: 20,
      type: "expense",
      note: undefined,
      labels: [],
    });
  });

  it("defaults to Misc when nothing precedes the amount", () => {
    const result = parseExpenseInput("20");
    expect(result?.category).toBe("Misc");
    expect(result?.amount).toBe(20);
  });

  it("capitalizes each word of a multi-word category", () => {
    const result = parseExpenseInput("grab food 20");
    expect(result?.category).toBe("Grab Food");
  });

  it.each([
    ["rm15", 15],
    ["$20", 20],
    ["€12.50", 12.5],
    ["usd10", 10],
  ])("strips currency prefix %s -> %d", (token, expected) => {
    const result = parseExpenseInput(`food ${token}`);
    expect(result?.amount).toBe(expected);
  });

  it("strips thousands separators", () => {
    const result = parseExpenseInput("salary 1,200");
    expect(result?.amount).toBe(1200);
  });

  it("picks the first numeric token as the amount", () => {
    const result = parseExpenseInput("food 20 note 30");
    expect(result?.amount).toBe(20);
    expect(result?.note).toBe("note 30");
  });

  it("detects income only from the first category token", () => {
    expect(parseExpenseInput("salary 5000")?.type).toBe("income");
    // "payment" is an income keyword but isn't the first token here, so this stays an expense.
    expect(parseExpenseInput("late payment 20")?.type).toBe("expense");
  });

  it("parses #label tokens, lowercased and stripped from the note", () => {
    const result = parseExpenseInput("coffee 4.5 starbucks #date #Work");
    expect(result?.note).toBe("starbucks");
    expect(result?.labels).toEqual(["date", "work"]);
  });

  it("returns no note when nothing follows the amount", () => {
    const result = parseExpenseInput("food 20");
    expect(result?.note).toBeUndefined();
  });

  it("rejects a zero or negative numeric token, falling through to the next candidate", () => {
    const result = parseExpenseInput("food -5 20");
    expect(result?.amount).toBe(20);
    expect(result?.category).toBe("Food -5");
  });

  it("returns null when no numeric token exists", () => {
    expect(parseExpenseInput("just some words")).toBeNull();
  });

  describe("math expressions in the amount", () => {
    it.each([
      ["food 12+8.5", 20.5],
      ["share 84.60/3", 28.2],
      ["grab (23+9)/2", 16],
      ["lunch 84.60/3+12.50", 40.7],
    ])("evaluates %s -> %d", (input, expected) => {
      expect(parseExpenseInput(input)?.amount).toBe(expected);
    });

    it("strips a currency prefix before evaluating", () => {
      expect(parseExpenseInput("food rm12+3")?.amount).toBe(15);
    });

    it("strips thousands separators before evaluating and keeps income detection", () => {
      const result = parseExpenseInput("salary 1,200+300");
      expect(result?.amount).toBe(1500);
      expect(result?.type).toBe("income");
    });

    it("keeps note and label extraction around an expression amount", () => {
      const result = parseExpenseInput("lunch 84.60/3+12.50 kfc #work");
      expect(result?.amount).toBe(40.7);
      expect(result?.category).toBe("Lunch");
      expect(result?.note).toBe("kfc");
      expect(result?.labels).toEqual(["work"]);
    });

    it("falls through past an invalid expression to the next numeric token", () => {
      const result = parseExpenseInput("food 12+ 20");
      expect(result?.amount).toBe(20);
      expect(result?.category).toBe("Food 12+");
    });

    it("keeps mixed alphanumeric tokens as notes, not expressions", () => {
      const result = parseExpenseInput("food 20 2-in-1");
      expect(result?.amount).toBe(20);
      expect(result?.note).toBe("2-in-1");
    });

    it("does not evaluate across spaces (no-internal-spaces rule)", () => {
      const result = parseExpenseInput("coffee 12 + 8");
      expect(result?.amount).toBe(12);
      expect(result?.note).toBe("+ 8");
    });
  });

  it("returns null for empty or whitespace-only input", () => {
    expect(parseExpenseInput("")).toBeNull();
    expect(parseExpenseInput("   ")).toBeNull();
  });
});
