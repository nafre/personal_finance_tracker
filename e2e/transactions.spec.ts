import { expect, test } from "@playwright/test";
import { amountMasks, waitForReady } from "./helpers";

test.describe("Transactions page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/transactions");
    await waitForReady(page);
  });

  // ── Full page ─────────────────────────────────────────────────────────────

  test("full page layout", async ({ page }) => {
    await expect(page).toHaveScreenshot("full-page.png", {
      fullPage: true,
      animations: "disabled",
      mask: amountMasks(page),
    });
  });

  // ── Filter bar ────────────────────────────────────────────────────────────

  test("filter bar — month selector and dropdowns", async ({ page }) => {
    const bar = page.locator('[data-testid="filter-bar"]');
    await expect(bar).toHaveScreenshot("filter-bar.png", {
      animations: "disabled",
    });
  });

  // ── Summary strip ─────────────────────────────────────────────────────────

  test("summary strip — count, income, expense, net", async ({ page }) => {
    const strip = page.locator('[data-testid="summary-strip"]');
    await expect(strip).toHaveScreenshot("summary-strip.png", {
      animations: "disabled",
      mask: amountMasks(page),
    });
  });

  // ── Transaction list ──────────────────────────────────────────────────────

  test("transaction list — row alignment and text truncation", async ({
    page,
  }) => {
    const list = page.locator('[data-testid="transaction-list"]');
    if (!(await list.isVisible())) return; // empty state — skip
    await expect(list).toHaveScreenshot("transaction-list.png", {
      animations: "disabled",
    });
  });

  // ── Search & new filters (feature 32) ─────────────────────────────────────

  test("type filter — Expense zeroes the income total, Income zeroes expenses", async ({ page }) => {
    const strip = page.locator('[data-testid="summary-strip"]');

    await page.getByRole("button", { name: "Expense", exact: true }).click();
    await expect(page).toHaveURL(/type=expense/);
    await expect(strip).toContainText("+RM0.00", { timeout: 5000 });

    await page.getByRole("button", { name: "Income", exact: true }).click();
    await expect(page).toHaveURL(/type=income/);
    await expect(strip).toContainText("−RM0.00", { timeout: 5000 });

    await page.getByRole("button", { name: "All", exact: true }).click();
    await expect(page).not.toHaveURL(/type=/);
  });

  test("search matches category names case-insensitively", async ({ page }) => {
    const categorySelect = page.locator("select").first();
    if ((await categorySelect.locator("option").count()) <= 1) return; // no data — skip
    const cat = (await categorySelect.locator("option").nth(1).textContent())!.trim();

    const strip = page.locator('[data-testid="summary-strip"]');
    const search = page.getByLabel("Search transactions");

    // Establish the filtered-to-zero state first so the second assertion
    // observes a real flip (the strip starts non-zero, so a bare
    // not-to-contain would pass before the search even applies).
    await search.fill("zzz-no-match-zzz");
    await expect(strip).toContainText("0 transactions", { timeout: 5000 });

    await search.fill(cat.toUpperCase());
    await expect(strip).not.toContainText("0 transactions", { timeout: 5000 });
  });

  test("amount range filter narrows results", async ({ page }) => {
    const strip = page.locator('[data-testid="summary-strip"]');

    await page.getByRole("button", { name: /More filters/ }).click();
    await page.locator("#filter-min").fill("999999");
    await expect(strip).toContainText("0 transactions", { timeout: 5000 });

    await page.getByRole("button", { name: "Clear all" }).click();
    await expect(strip).not.toContainText("0 transactions", { timeout: 5000 });
  });

  // ── Category filter ───────────────────────────────────────────────────────

  test("category filter applied", async ({ page }) => {
    const categorySelect = page.locator('select').first();
    const options = await categorySelect.locator("option").count();
    // Only test if there are actual categories to filter by
    if (options <= 1) return;

    const firstCategory = await categorySelect
      .locator("option")
      .nth(1)
      .textContent();
    await categorySelect.selectOption({ index: 1 });
    await waitForReady(page);
    await page.mouse.move(0, 0); // move cursor off the dropdown before screenshot

    await expect(page).toHaveScreenshot("category-filtered.png", {
      fullPage: true,
      animations: "disabled",
      mask: amountMasks(page),
    });

    // Reset
    await categorySelect.selectOption({ index: 0 });
    void firstCategory; // used for context
  });
});
