import { describe, it, expect, vi } from "vitest";

// db-adapter imports @/lib/db, which eagerly constructs a Prisma client —
// stub it out; these tests only exercise the pure search helpers.
vi.mock("@/lib/db", () => ({ db: {} }));

// IS_SQLITE is computed from DATABASE_URL at module load, so each dialect
// needs a fresh module instance with the env stubbed first.
async function loadAdapter(databaseUrl: string) {
  vi.resetModules();
  vi.stubEnv("DATABASE_URL", databaseUrl);
  return await import("@/lib/db-adapter");
}

describe("parseAmountQuery", () => {
  it("parses plain numbers", async () => {
    const { parseAmountQuery } = await loadAdapter("");
    expect(parseAmountQuery("45")).toBe(45);
    expect(parseAmountQuery("45.50")).toBe(45.5);
  });

  it("strips an rm prefix and commas", async () => {
    const { parseAmountQuery } = await loadAdapter("");
    expect(parseAmountQuery("rm45")).toBe(45);
    expect(parseAmountQuery("RM 1,200.50")).toBe(1200.5);
    expect(parseAmountQuery("1,200")).toBe(1200);
  });

  it("rejects non-numeric, zero, and mixed tokens", async () => {
    const { parseAmountQuery } = await loadAdapter("");
    expect(parseAmountQuery("grab")).toBeNull();
    expect(parseAmountQuery("45abc")).toBeNull();
    expect(parseAmountQuery("-5")).toBeNull();
    expect(parseAmountQuery("0")).toBeNull();
    expect(parseAmountQuery("")).toBeNull();
  });
});

describe("getSearchFilter (Postgres)", () => {
  it("returns a case-insensitive OR across note, category, and exact label", async () => {
    const { getSearchFilter } = await loadAdapter("");
    expect(getSearchFilter("grab")).toEqual({
      OR: [
        { note: { contains: "grab", mode: "insensitive" } },
        { category: { contains: "grab", mode: "insensitive" } },
        { labels: { has: "grab" } },
      ],
    });
  });

  it("adds an exact amount clause for numeric queries", async () => {
    const { getSearchFilter } = await loadAdapter("");
    const filter = getSearchFilter("45") as { OR: unknown[] };
    expect(filter.OR).toContainEqual({ amount: 45 });
    expect(filter.OR).toHaveLength(4);
  });

  it("returns {} for an empty query", async () => {
    const { getSearchFilter } = await loadAdapter("");
    expect(getSearchFilter()).toEqual({});
    expect(getSearchFilter("")).toEqual({});
  });
});

describe("getSearchFilter (SQLite)", () => {
  it("returns {} so the caller filters in JS", async () => {
    const { getSearchFilter } = await loadAdapter("file:./dev.db");
    expect(getSearchFilter("grab")).toEqual({});
  });
});

describe("matchesSearch", () => {
  const tx = {
    note: "Grab ride home",
    category: "Transport",
    labels: ["Work", "travel"],
    amount: 45.5,
  };

  it("matches note substring case-insensitively", async () => {
    const { matchesSearch } = await loadAdapter("file:./dev.db");
    expect(matchesSearch(tx, "grab")).toBe(true);
    expect(matchesSearch(tx, "RIDE")).toBe(true);
  });

  it("matches category substring case-insensitively", async () => {
    const { matchesSearch } = await loadAdapter("file:./dev.db");
    expect(matchesSearch(tx, "transp")).toBe(true);
  });

  it("matches labels exactly (case-insensitive), not by substring", async () => {
    const { matchesSearch } = await loadAdapter("file:./dev.db");
    expect(matchesSearch(tx, "work")).toBe(true);
    // "trav" is not an exact label — but it's a substring of nothing else here
    expect(matchesSearch({ ...tx, note: "", category: "Food" }, "trav")).toBe(false);
  });

  it("matches exact amount for numeric queries", async () => {
    const { matchesSearch } = await loadAdapter("file:./dev.db");
    expect(matchesSearch({ ...tx, note: "", category: "Food", labels: [] }, "45.50")).toBe(true);
    expect(matchesSearch({ ...tx, note: "", category: "Food", labels: [] }, "45")).toBe(false);
  });

  it("handles a null note", async () => {
    const { matchesSearch } = await loadAdapter("file:./dev.db");
    expect(matchesSearch({ ...tx, note: null }, "grab")).toBe(false);
  });
});
