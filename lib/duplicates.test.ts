import { describe, it, expect, beforeEach } from "vitest";
import {
  recordAdd,
  clearRecentAdds,
  findRecentDuplicate,
  hasSameDayDuplicate,
  groupPossibleDuplicates,
  RECENT_WINDOW_MS,
} from "@/lib/duplicates";

beforeEach(() => {
  clearRecentAdds();
});

describe("findRecentDuplicate", () => {
  it("finds a same (amount, category) add inside the window", () => {
    const t0 = 1_000_000;
    recordAdd({ amount: 20, category: "Food", at: t0 });
    expect(findRecentDuplicate({ amount: 20, category: "Food" }, t0 + 59_000)).not.toBeNull();
  });

  it("misses once the window has elapsed", () => {
    const t0 = 1_000_000;
    recordAdd({ amount: 20, category: "Food", at: t0 });
    expect(findRecentDuplicate({ amount: 20, category: "Food" }, t0 + RECENT_WINDOW_MS + 1)).toBeNull();
  });

  it("matches category case-insensitively but amount exactly", () => {
    const t0 = 1_000_000;
    recordAdd({ amount: 20, category: "Food", at: t0 });
    expect(findRecentDuplicate({ amount: 20, category: "food" }, t0 + 1_000)).not.toBeNull();
    expect(findRecentDuplicate({ amount: 20.01, category: "Food" }, t0 + 1_000)).toBeNull();
    expect(findRecentDuplicate({ amount: 20, category: "Transport" }, t0 + 1_000)).toBeNull();
  });

  it("applies to income too (double-logged salary)", () => {
    const t0 = 1_000_000;
    recordAdd({ amount: 5000, category: "Salary", at: t0 });
    expect(findRecentDuplicate({ amount: 5000, category: "Salary" }, t0 + 5_000)).not.toBeNull();
  });

  it("is empty after clearRecentAdds", () => {
    recordAdd({ amount: 20, category: "Food", at: 1_000_000 });
    clearRecentAdds();
    expect(findRecentDuplicate({ amount: 20, category: "Food" }, 1_001_000)).toBeNull();
  });
});

describe("hasSameDayDuplicate", () => {
  const today = new Date(2026, 6, 12, 15, 0, 0);

  it("hits on a same-day same (amount, category) transaction of any age", () => {
    const recent = [{ amount: 20, category: "Food", date: new Date(2026, 6, 12, 8, 0, 0) }];
    expect(hasSameDayDuplicate({ amount: 20, category: "food" }, recent, today)).toBe(true);
  });

  it("misses different days and different amounts", () => {
    const recent = [
      { amount: 20, category: "Food", date: new Date(2026, 6, 11, 23, 59, 0) },
      { amount: 25, category: "Food", date: new Date(2026, 6, 12, 8, 0, 0) },
    ];
    expect(hasSameDayDuplicate({ amount: 20, category: "Food" }, recent, today)).toBe(false);
  });
});

describe("groupPossibleDuplicates", () => {
  it("groups same (day, amount, category) rows, ignoring notes and ids", () => {
    const groups = groupPossibleDuplicates([
      { id: "a", amount: 20, category: "Food", note: "lunch", date: "2026-07-12T08:00:00" },
      { id: "pending_b", amount: 20, category: "food", note: "nasi", date: "2026-07-12T13:00:00" },
      { id: "c", amount: 20, category: "Food", date: "2026-07-11T08:00:00" }, // different day
      { id: "d", amount: 15, category: "Food", date: "2026-07-12T09:00:00" }, // different amount
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].transactions.map((t) => t.id)).toEqual(["a", "pending_b"]);
  });

  it("returns no groups when everything is unique", () => {
    expect(
      groupPossibleDuplicates([
        { amount: 20, category: "Food", date: "2026-07-12" },
        { amount: 30, category: "Food", date: "2026-07-12" },
      ])
    ).toEqual([]);
  });

  it("recurring backfills on different dates do not group", () => {
    expect(
      groupPossibleDuplicates([
        { amount: 50, category: "Utilities", date: "2026-05-01" },
        { amount: 50, category: "Utilities", date: "2026-06-01" },
        { amount: 50, category: "Utilities", date: "2026-07-01" },
      ])
    ).toEqual([]);
  });
});
