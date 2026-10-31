import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  formatCurrency,
  getNextDueDate,
  getRecurringStatus,
  isPostedThisPeriod,
  toMonthlyAmount,
  countRemainingPayments,
  countMissedPeriods,
  MAX_BACKFILL,
  getMonthName,
  getCurrentMonthYear,
  getPrevMonth,
  getNextMonth,
  enumerateMonths,
  stringToColor,
  formatDate,
  formatDateShort,
  rankCategoriesByUsage,
  stepAnchored,
  getRuleNextDue,
  getRuleStatus,
  getInstallmentAmount,
  splitInstallmentAmount,
  getRuleOverdueDates,
  nextDayOfMonth,
  type RuleSchedule,
} from "./utils";

describe("formatCurrency", () => {
  it("prefixes RM, adds a thousands separator, and always shows 2 decimals", () => {
    expect(formatCurrency(1234.5)).toBe("RM1,234.50");
    expect(formatCurrency(1000)).toBe("RM1,000.00");
    expect(formatCurrency(0)).toBe("RM0.00");
  });
});

describe("getNextDueDate", () => {
  it("falls back to startDate when lastRun is null", () => {
    const start = new Date(2026, 2, 10);
    const result = getNextDueDate("monthly", start, null);
    expect(result.getTime()).toBe(start.getTime());
  });

  it.each([
    ["daily", new Date(2026, 0, 16)],
    ["weekly", new Date(2026, 0, 22)],
    ["monthly", new Date(2026, 1, 15)],
    ["yearly", new Date(2027, 0, 15)],
  ] as const)("increments a %s rule by one period from lastRun", (frequency, expected) => {
    const lastRun = new Date(2026, 0, 15);
    const result = getNextDueDate(frequency, lastRun, lastRun);
    expect(result.getTime()).toBe(expected.getTime());
  });

  it("overflows into the next month when the month doesn't have that many days", () => {
    // Jan 31 + 1 month: Feb 2026 has 28 days, so this overflows to Mar 3.
    const lastRun = new Date(2026, 0, 31);
    const result = getNextDueDate("monthly", lastRun, lastRun);
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(2); // March
    expect(result.getDate()).toBe(3);
  });
});

describe("getRecurringStatus", () => {
  const FIXED_NOW = new Date(2026, 5, 15, 12, 0, 0);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("is upcoming when the due date is in the future", () => {
    expect(getRecurringStatus(new Date(2026, 5, 20), null)).toBe("upcoming");
  });

  it("is due when the due date is today", () => {
    expect(getRecurringStatus(new Date(2026, 5, 15), null)).toBe("due");
  });

  it("is overdue when the due date has passed", () => {
    expect(getRecurringStatus(new Date(2026, 5, 10), null)).toBe("overdue");
  });

  it("stays overdue (not ended) while the missed due date is still within endDate", () => {
    expect(getRecurringStatus(new Date(2026, 5, 10), new Date(2026, 5, 30))).toBe("overdue");
  });

  it("is ended once the due date itself falls beyond endDate", () => {
    expect(getRecurringStatus(new Date(2026, 5, 20), new Date(2026, 5, 18))).toBe("ended");
  });
});

describe("isPostedThisPeriod", () => {
  const FIXED_NOW = new Date(2026, 5, 15, 12, 0, 0);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns false when lastRun is null", () => {
    expect(isPostedThisPeriod("daily", null)).toBe(false);
  });

  it("daily: true only for the same calendar day", () => {
    expect(isPostedThisPeriod("daily", new Date(2026, 5, 15, 0, 1))).toBe(true);
    expect(isPostedThisPeriod("daily", new Date(2026, 5, 14, 23, 59))).toBe(false);
  });

  it("weekly: true within the last 7 days", () => {
    expect(isPostedThisPeriod("weekly", new Date(2026, 5, 10))).toBe(true);
    expect(isPostedThisPeriod("weekly", new Date(2026, 5, 7))).toBe(false);
  });

  it("monthly: true within the same calendar month", () => {
    expect(isPostedThisPeriod("monthly", new Date(2026, 5, 1))).toBe(true);
    expect(isPostedThisPeriod("monthly", new Date(2026, 4, 30))).toBe(false);
  });

  it("yearly: true within the same calendar year", () => {
    expect(isPostedThisPeriod("yearly", new Date(2026, 0, 1))).toBe(true);
    expect(isPostedThisPeriod("yearly", new Date(2025, 11, 31))).toBe(false);
  });
});

describe("toMonthlyAmount", () => {
  it("converts each frequency to a monthly-equivalent amount", () => {
    expect(toMonthlyAmount("daily", 12)).toBeCloseTo(12 * (365 / 12));
    expect(toMonthlyAmount("weekly", 12)).toBeCloseTo(12 * (52 / 12));
    expect(toMonthlyAmount("monthly", 12)).toBe(12);
    expect(toMonthlyAmount("yearly", 120)).toBeCloseTo(10);
  });
});

describe("countRemainingPayments", () => {
  it("counts inclusive occurrences between nextDue and endDate", () => {
    const nextDue = new Date(2026, 0, 1);
    const endDate = new Date(2026, 2, 1);
    expect(countRemainingPayments("monthly", nextDue, endDate)).toBe(3); // Jan 1, Feb 1, Mar 1
  });

  it("returns 0 when nextDue is already past endDate", () => {
    const nextDue = new Date(2026, 3, 1);
    const endDate = new Date(2026, 2, 1);
    expect(countRemainingPayments("monthly", nextDue, endDate)).toBe(0);
  });
});

describe("countMissedPeriods", () => {
  const FIXED_NOW = new Date(2026, 5, 15, 12, 0, 0); // June 15, 2026

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 0 when the rule isn't behind", () => {
    const startDate = new Date(2026, 5, 20); // in the future
    expect(countMissedPeriods("daily", startDate, null, null)).toBe(0);
  });

  it("counts each elapsed period up to and including today", () => {
    // startDate June 10, no lastRun -> due dates June 10..15 inclusive = 6 missed periods
    const startDate = new Date(2026, 5, 10);
    expect(countMissedPeriods("daily", startDate, null, null)).toBe(6);
  });

  it("caps the count at MAX_BACKFILL", () => {
    const startDate = new Date(2026, 0, 1); // over 100 days before FIXED_NOW
    expect(countMissedPeriods("daily", startDate, null, null)).toBe(MAX_BACKFILL);
  });

  it("stops counting at endDate even if more periods have elapsed since", () => {
    const startDate = new Date(2026, 5, 1);
    const endDate = new Date(2026, 5, 5); // well before FIXED_NOW
    expect(countMissedPeriods("daily", startDate, null, endDate)).toBe(5);
  });
});

describe("installment plan helpers", () => {
  const FIXED_NOW = new Date(2026, 5, 15, 12, 0, 0); // June 15, 2026

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const plan = (over: Partial<RuleSchedule> = {}): RuleSchedule => ({
    frequency: "monthly",
    startDate: new Date(2026, 0, 31),
    lastRun: null,
    amount: 33.33,
    installmentCount: 3,
    installmentsPosted: 0,
    installmentTotal: 100,
    ...over,
  });

  it("keeps the charge day pinned to the first charge, clamping short months", () => {
    const feb = stepAnchored("monthly", new Date(2026, 0, 31), 31);
    expect([feb.getMonth(), feb.getDate()]).toEqual([1, 28]);
    const mar = stepAnchored("monthly", feb, 31);
    expect([mar.getMonth(), mar.getDate()]).toEqual([2, 31]);
  });

  it("uses the first charge date until something is posted, then steps from lastRun", () => {
    expect(getRuleNextDue(plan()).getTime()).toBe(new Date(2026, 0, 31).getTime());
    const next = getRuleNextDue(plan({ lastRun: new Date(2026, 1, 28) }));
    expect([next.getMonth(), next.getDate()]).toEqual([2, 31]);
  });

  it("leaves ordinary rules on the existing lastRun chain", () => {
    const rule = plan({ installmentCount: null, lastRun: new Date(2026, 4, 18) });
    expect(getRuleNextDue(rule).getTime()).toBe(
      getNextDueDate("monthly", new Date(2026, 0, 31), new Date(2026, 4, 18)).getTime()
    );
  });

  it("ends a plan by payment count, ignoring endDate", () => {
    expect(getRuleStatus(plan({ installmentsPosted: 3 }))).toBe("ended");
    expect(getRuleStatus(plan({ installmentsPosted: 2, endDate: new Date(2025, 0, 1) }))).toBe("overdue");
    expect(getRuleStatus(plan({ startDate: new Date(2026, 5, 15) }))).toBe("due");
    expect(getRuleStatus(plan({ startDate: new Date(2026, 5, 20) }))).toBe("upcoming");
  });

  it("gives the rounding remainder to the final payment", () => {
    expect(splitInstallmentAmount(100, 3)).toBe(33.33);
    expect(splitInstallmentAmount(1200, 12)).toBe(100);
    expect(getInstallmentAmount(plan(), 1)).toBe(33.33);
    expect(getInstallmentAmount(plan(), 3)).toBe(33.34);
  });

  it("caps overdue dates at the payments left", () => {
    // Jan 31, Feb 28, Mar 31, Apr 30, May 31 have all passed; only 3 payments exist.
    expect(getRuleOverdueDates(plan())).toHaveLength(3);
    expect(getRuleOverdueDates(plan({ installmentsPosted: 2, lastRun: new Date(2026, 1, 28) }))).toHaveLength(1);
  });

  it("stops overdue dates at an explicit `until`", () => {
    const dates = getRuleOverdueDates(plan({ installmentCount: 12 }), new Date(2026, 2, 1));
    expect(dates.map((d) => d.getMonth())).toEqual([0, 1]);
  });

  it("resolves a day-of-month to its next occurrence, today included", () => {
    expect(nextDayOfMonth(15).toISOString()).toBe("2026-06-15T00:00:00.000Z");
    expect(nextDayOfMonth(20).toISOString()).toBe("2026-06-20T00:00:00.000Z");
    expect(nextDayOfMonth(10).toISOString()).toBe("2026-07-10T00:00:00.000Z");
    expect(nextDayOfMonth(31).toISOString()).toBe("2026-06-30T00:00:00.000Z");
    expect(nextDayOfMonth(5, new Date(2026, 11, 20)).toISOString()).toBe("2027-01-05T00:00:00.000Z");
  });
});

describe("getPrevMonth / getNextMonth", () => {
  it("rolls Jan back to Dec of the previous year", () => {
    expect(getPrevMonth(1, 2026)).toEqual({ month: 12, year: 2025 });
  });

  it("rolls Dec forward to Jan of the next year", () => {
    expect(getNextMonth(12, 2025)).toEqual({ month: 1, year: 2026 });
  });

  it("steps within the same year otherwise", () => {
    expect(getPrevMonth(6, 2026)).toEqual({ month: 5, year: 2026 });
    expect(getNextMonth(5, 2026)).toEqual({ month: 6, year: 2026 });
  });
});

describe("enumerateMonths", () => {
  it("lists every month in an inclusive range", () => {
    const start = new Date(2026, 0, 15);
    const end = new Date(2026, 2, 10);
    expect(enumerateMonths(start, end)).toEqual([
      { year: 2026, month: 1 },
      { year: 2026, month: 2 },
      { year: 2026, month: 3 },
    ]);
  });

  it("returns a single entry when start and end share a month", () => {
    const date = new Date(2026, 3, 5);
    expect(enumerateMonths(date, date)).toEqual([{ year: 2026, month: 4 }]);
  });

  it("returns an empty array for an inverted range instead of hanging", () => {
    const start = new Date(2026, 5, 1);
    const end = new Date(2026, 0, 1);
    expect(enumerateMonths(start, end)).toEqual([]);
  });
});

describe("stringToColor", () => {
  const PALETTE = [
    "#6366f1", "#10b981", "#f59e0b", "#ef4444",
    "#8b5cf6", "#06b6d4", "#f97316", "#84cc16",
    "#ec4899", "#14b8a6", "#a16207", "#0891b2",
  ];

  it("is deterministic for the same input", () => {
    expect(stringToColor("date")).toBe(stringToColor("date"));
  });

  it("always returns a color from the palette", () => {
    expect(PALETTE).toContain(stringToColor("work"));
    expect(PALETTE).toContain(stringToColor(""));
  });
});

describe("formatDate / formatDateShort", () => {
  // Constructed via the local-time Date constructor (not an ISO string) so this
  // assertion holds regardless of the test machine's timezone.
  const date = new Date(2026, 6, 4);

  it("formats with month, day, and year", () => {
    expect(formatDate(date)).toBe("Jul 4, 2026");
  });

  it("formats without the year", () => {
    expect(formatDateShort(date)).toBe("Jul 4");
  });
});

describe("getMonthName", () => {
  it("returns the full month name", () => {
    expect(getMonthName(1)).toBe("January");
    expect(getMonthName(12)).toBe("December");
  });
});

describe("getCurrentMonthYear", () => {
  it("reads the current month/year from the system clock", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 10));
    expect(getCurrentMonthYear()).toEqual({ month: 3, year: 2026 });
    vi.useRealTimers();
  });
});

describe("rankCategoriesByUsage", () => {
  const tx = (category: string, date: string, type = "expense") => ({
    category,
    type,
    date,
  });

  it("orders by how often each category is used, not by recency", () => {
    expect(
      rankCategoriesByUsage([
        tx("Transport", "2026-08-03"),
        tx("Food", "2026-08-02"),
        tx("Food", "2026-08-01"),
        tx("Food", "2026-07-30"),
        tx("Bills", "2026-07-29"),
        tx("Bills", "2026-07-28"),
      ])
    ).toEqual(["Food", "Bills", "Transport"]);
  });

  it("breaks count ties on the most recent use", () => {
    expect(
      rankCategoriesByUsage([
        tx("Bills", "2026-07-01"),
        tx("Food", "2026-08-02"),
      ])
    ).toEqual(["Food", "Bills"]);
  });

  it("ignores income and keeps the first-seen spelling of a category", () => {
    expect(
      rankCategoriesByUsage([
        tx("Salary", "2026-08-03", "income"),
        tx("Food", "2026-08-02"),
        tx("food", "2026-08-01"),
      ])
    ).toEqual(["Food"]);
  });

  it("caps the result at the limit", () => {
    const txs = ["a", "b", "c", "d", "e", "f"].map((c) => tx(c, "2026-08-01"));
    expect(rankCategoriesByUsage(txs)).toHaveLength(5);
    expect(rankCategoriesByUsage(txs, 2)).toHaveLength(2);
  });

  it("returns an empty list when there are no expenses", () => {
    expect(rankCategoriesByUsage([])).toEqual([]);
    expect(rankCategoriesByUsage([tx("Salary", "2026-08-03", "income")])).toEqual([]);
  });
});
