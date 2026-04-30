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

  // ── Sidebar collapse (desktop only) ──────────────────────────────────────

  test("sidebar — collapses to icon-only width on toggle", async ({ page }) => {
    const sidebar = page.locator('[data-testid="sidebar"]');
    if (!(await sidebar.isVisible())) return; // mobile uses bottom nav — skip

    const expandedBox = await sidebar.boundingBox();
    expect(expandedBox?.width).toBeGreaterThan(180); // w-56 = 224px

    // force:true bypasses Playwright's stability check — the button is stable
    // but re-renders from SyncProvider cause false positives on the check
    await page.locator('[aria-label="Collapse sidebar"]').click({ force: true });
    // Wait for the CSS transition (300ms) to complete, not just the React state update
    await page.waitForFunction(() => {
      const el = document.querySelector('[data-testid="sidebar"]') as HTMLElement | null;
      return el !== null && el.getBoundingClientRect().width < 80;
    }, { timeout: 5000 });

    const collapsedBox = await sidebar.boundingBox();
    expect(collapsedBox?.width).toBeLessThan(80); // w-16 = 64px

    await expect(sidebar).toHaveScreenshot("sidebar-collapsed.png", {
      animations: "disabled",
      maxDiffPixelRatio: 0.2,
    });
  });

  test("sidebar — re-expands and main content shifts", async ({ page }) => {
    const sidebar = page.locator('[data-testid="sidebar"]');
    if (!(await sidebar.isVisible())) return;

    await page.locator('[aria-label="Collapse sidebar"]').click({ force: true });
    await page.waitForFunction(() => {
      const el = document.querySelector('[data-testid="sidebar"]') as HTMLElement | null;
      return el !== null && el.getBoundingClientRect().width < 80;
    }, { timeout: 5000 });

    await page.locator('[aria-label="Expand sidebar"]').click({ force: true });
    await page.waitForFunction(() => {
      const el = document.querySelector('[data-testid="sidebar"]') as HTMLElement | null;
      return el !== null && el.getBoundingClientRect().width > 180;
    }, { timeout: 5000 });

    const expandedBox = await sidebar.boundingBox();
    expect(expandedBox?.width).toBeGreaterThan(180);

    await expect(sidebar).toHaveScreenshot("sidebar-expanded.png", {
      animations: "disabled",
      maxDiffPixelRatio: 0.2,
    });
  });

  test("sidebar — collapsed state persists across page navigation", async ({
    page,
  }) => {
    const sidebar = page.locator('[data-testid="sidebar"]');
    if (!(await sidebar.isVisible())) return;

    await page.locator('[aria-label="Collapse sidebar"]').click({ force: true });
    await page.waitForFunction(() => {
      const el = document.querySelector('[data-testid="sidebar"]') as HTMLElement | null;
      return el !== null && el.getBoundingClientRect().width < 80;
    }, { timeout: 5000 });

    // Navigate away and back
    await page.goto("/transactions");
    await waitForReady(page);
    await page.goto("/dashboard");
    await waitForReady(page);

    // Sidebar must still be collapsed (localStorage preserved state)
    const box = await sidebar.boundingBox();
    expect(box?.width).toBeLessThan(80);

    // Cleanup: reset to expanded so other tests start fresh
    await page.locator('[aria-label="Expand sidebar"]').click({ force: true });
    await page.waitForFunction(() => {
      const el = document.querySelector('[data-testid="sidebar"]') as HTMLElement | null;
      return el !== null && el.getBoundingClientRect().width > 180;
    }, { timeout: 5000 });
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
