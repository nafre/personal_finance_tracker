import { expect, test } from "@playwright/test";
import { amountMasks, waitForReady } from "./helpers";

test.describe("Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/dashboard");
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

  // ── Navigation ────────────────────────────────────────────────────────────

  test("navigation — sidebar on desktop, bottom nav on mobile", async ({
    page,
  }) => {
    const sidebar = page.locator('[data-testid="sidebar"]');
    const bottomNav = page.locator('[data-testid="bottom-nav"]');

    const nav = (await sidebar.isVisible()) ? sidebar : bottomNav;
    await expect(nav).toHaveScreenshot("navigation.png", {
      animations: "disabled",
      // Emoji glyphs render with slight rasterization variance between runs
      maxDiffPixelRatio: 0.2,
    });
  });

  // ── Stat cards ────────────────────────────────────────────────────────────

  test("stat cards — layout, colour, and MoM badge", async ({ page }) => {
    const cards = page.locator('[data-testid="stat-cards"]');
    await expect(cards).toHaveScreenshot("stat-cards.png", {
      animations: "disabled",
      // Mask the actual numbers — only the structural layout matters
      mask: amountMasks(page),
    });
  });

  // ── Quick-add input (desktop / tablet only) ───────────────────────────────

  test("quick-add input field", async ({ page }) => {
    const input = page.locator('[data-testid="expense-input"]');
    if (!(await input.isVisible())) return; // hidden on mobile — skip
    await expect(input).toHaveScreenshot("quick-add.png", {
      animations: "disabled",
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

  // ── Recurring section ─────────────────────────────────────────────────────

  test("recurring section header", async ({ page }) => {
    const recurring = page.locator('[data-testid="recurring-section"]');
    await expect(recurring).toHaveScreenshot("recurring-section.png", {
      animations: "disabled",
    });
  });
});
