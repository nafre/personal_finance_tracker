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

  it("returns null for empty or whitespace-only input", () => {
    expect(parseExpenseInput("")).toBeNull();
    expect(parseExpenseInput("   ")).toBeNull();
  });
});
