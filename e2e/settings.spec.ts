import { expect, test } from "@playwright/test";
import { waitForReady } from "./helpers";

test.describe("Settings", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/settings");
    await waitForReady(page);
  });

  test("full page layout", async ({ page }) => {
    await expect(page).toHaveScreenshot("full-page.png", {
      fullPage: true,
      animations: "disabled",
    });
  });

  test("category list", async ({ page }) => {
    // Admin users default to the Users tab — click Categories first
    const categoriesTab = page.getByRole("button", { name: "Categories" });
    if (await categoriesTab.isVisible()) {
      await categoriesTab.click();
    }
    const list = page.locator('[data-testid="category-list"]');
    await expect(list).toHaveScreenshot("category-list.png", {
      animations: "disabled",
      maxDiffPixelRatio: 0.05,
    });
  });
});
