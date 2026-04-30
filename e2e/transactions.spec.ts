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
