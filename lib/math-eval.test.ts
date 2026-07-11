import { describe, it, expect } from "vitest";
import { evaluateExpression } from "./math-eval";

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
