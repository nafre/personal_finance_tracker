import { describe, it, expect } from "vitest";
import {
  evaluateExpression,
  evaluateAmountInput,
  normalizeAmountOnBlur,
} from "./math-eval";

describe("evaluateExpression", () => {
  describe("arithmetic", () => {
    it.each([
      ["2+3", 5],
      ["20-5", 15],
      ["3*4", 12],
      ["12/4", 3],
      ["2+3*4", 14], // precedence
      ["20-6/2", 17],
      ["(2+3)*4", 20], // parens
      ["(23+9)/2", 16],
      ["((2+3)*4)/10", 2], // nested parens
      ["1+2+3+4", 10], // chained same-precedence
      ["100/5/2", 10], // left-associative division
      ["84.60/3", 28.2],
      ["84.60/3+12.50", 40.7],
      ["12+8.5", 20.5],
    ])("%s = %d", (expr, expected) => {
      expect(evaluateExpression(expr)).toBe(expected);
    });

    it("handles unary minus", () => {
      expect(evaluateExpression("-(3-5)")).toBe(2);
      expect(evaluateExpression("--5")).toBe(5);
      expect(evaluateExpression("2*-3")).toBe(-6);
    });

    it("returns negative and zero results (sign policy is the caller's)", () => {
      expect(evaluateExpression("2-5")).toBe(-3);
      expect(evaluateExpression("-5")).toBe(-5);
      expect(evaluateExpression("3-3")).toBe(0);
    });
  });

  describe("rounding", () => {
    it("rounds float dust to 2dp", () => {
      expect(evaluateExpression("0.1+0.2")).toBe(0.3);
    });

    it("rounds repeating decimals to 2dp", () => {
      expect(evaluateExpression("10/3")).toBe(3.33);
      expect(evaluateExpression("20/3")).toBe(6.67);
    });
  });

  describe("invalid input returns null", () => {
    it.each([
      ["", "empty"],
      ["12+", "trailing operator"],
      ["++5", "doubled operator"],
      ["(2+3", "unclosed paren"],
      ["2+3)", "trailing close paren"],
      ["()", "empty parens"],
      ["2..5", "double decimal point"],
      ["1.2.3", "multi-dot number"],
      ["12.", "trailing decimal point"],
      ["12 + 8", "internal spaces"],
      ["1;alert(1)", "injection-shaped input"],
      ["1e9", "exponent notation"],
      ["abc", "letters"],
      ["+-*/", "operators without digits"],
    ])("%s (%s)", (expr) => {
      expect(evaluateExpression(expr)).toBeNull();
    });

    it("rejects division by zero, including computed zero", () => {
      expect(evaluateExpression("5/0")).toBeNull();
      expect(evaluateExpression("5/(3-3)")).toBeNull();
    });

    it("rejects expressions over the length cap", () => {
      const long = "1+" .repeat(40) + "1"; // 81 chars
      expect(evaluateExpression(long)).toBeNull();
      const atCap = "1+1+1+1+1+1+1+1+1+1+1+1+1+1+1+1+1+1+1+1+1+1+1+1+1+1+1+1+1+1+1+1"; // 63 chars
      expect(evaluateExpression(atCap)).toBe(32);
    });

    it("rejects parens nested beyond the depth cap", () => {
      expect(evaluateExpression("(".repeat(9) + "1" + ")".repeat(9))).toBeNull();
      expect(evaluateExpression("(".repeat(8) + "1" + ")".repeat(8))).toBe(1);
    });
  });
});

describe("evaluateAmountInput", () => {
  it("passes plain numbers through", () => {
    expect(evaluateAmountInput("12.50")).toBe(12.5);
    expect(evaluateAmountInput("20")).toBe(20);
  });

  it("evaluates expressions", () => {
    expect(evaluateAmountInput("84.60/3+12.50")).toBe(40.7);
    expect(evaluateAmountInput("(23+9)/2")).toBe(16);
  });

  it("allows internal whitespace (no token ambiguity in a lone field)", () => {
    expect(evaluateAmountInput("12 + 8.5")).toBe(20.5);
    expect(evaluateAmountInput(" 20 ")).toBe(20);
  });

  it("strips thousands separators", () => {
    expect(evaluateAmountInput("1,200+300")).toBe(1500);
    expect(evaluateAmountInput("1,200")).toBe(1200);
  });

  it("returns null for empty or non-numeric input", () => {
    expect(evaluateAmountInput("")).toBeNull();
    expect(evaluateAmountInput("   ")).toBeNull();
    expect(evaluateAmountInput("abc")).toBeNull();
    expect(evaluateAmountInput("12abc")).toBeNull();
    expect(evaluateAmountInput("12+")).toBeNull();
    expect(evaluateAmountInput("5/0")).toBeNull();
  });

  it("returns negatives and zero (sign policy is the caller's)", () => {
    expect(evaluateAmountInput("2-5")).toBe(-3);
    expect(evaluateAmountInput("3-3")).toBe(0);
  });
});

describe("normalizeAmountOnBlur", () => {
  it("replaces a valid expression with its evaluated value", () => {
    expect(normalizeAmountOnBlur("84.60/3+12.50")).toBe("40.7");
    expect(normalizeAmountOnBlur("12 + 8")).toBe("20");
    expect(normalizeAmountOnBlur("(23+9)/2")).toBe("16");
  });

  it("leaves plain numbers untouched (no trailing-zero loss)", () => {
    expect(normalizeAmountOnBlur("12.50")).toBe("12.50");
    expect(normalizeAmountOnBlur("20")).toBe("20");
    expect(normalizeAmountOnBlur("")).toBe("");
  });

  it("leaves invalid input untouched for submit-time validation", () => {
    expect(normalizeAmountOnBlur("12+")).toBe("12+");
    expect(normalizeAmountOnBlur("5/0")).toBe("5/0");
    expect(normalizeAmountOnBlur("abc-def")).toBe("abc-def");
  });
});
