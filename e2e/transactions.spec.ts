import { expect, test } from "@playwright/test";
import { amountMasks, expandAppShell, waitForReady } from "./helpers";

test.describe("Transactions page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/transactions");
    await waitForReady(page);
  });

  // ── Full page ─────────────────────────────────────────────────────────────

  test("full page layout", async ({ page }) => {
    await expandAppShell(page);
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
    await expect(strip).toContainText(/\b0 transactions/, { timeout: 5000 });

    await search.fill(cat.toUpperCase());
    await expect(strip).not.toContainText(/\b0 transactions/, { timeout: 5000 });
  });

  test("amount range filter narrows results", async ({ page }) => {
    // Pin a range spanning every seeded row instead of relying on the default
    // current-month view: seed dates are relative to seed time, so the current
    // month is empty whenever dev.db was seeded in an earlier month — and an
    // empty baseline makes "filtered down to 0" vacuous.
    await page.goto("/transactions?from=2000-01-01&to=2100-01-01");
    await waitForReady(page);

    const strip = page.locator('[data-testid="summary-strip"]');
    await expect(strip).not.toContainText(/\b0 transactions/, { timeout: 5000 });

    // The row auto-opens because from/to are active — only toggle it if it isn't.
    const min = page.locator("#filter-min");
    if (!(await min.isVisible())) {
      await page.getByRole("button", { name: /More filters/ }).click();
    }

    await min.fill("999999");
    await expect(strip).toContainText(/\b0 transactions/, { timeout: 5000 });

    // Clearing just the amount bound restores the range — "Clear all" would also
    // drop from/to and drop us back onto the (possibly empty) current month.
    await min.fill("");
    await expect(strip).not.toContainText(/\b0 transactions/, { timeout: 5000 });
  });

  // The default view is the current month, which `prisma/seed.ts` can leave
  // empty (its dates are relative to seed time) — so this asserts the range
  // mechanics, not a row count delta.
  test("all-time toggle spans the whole history and toggles back off", async ({ page }) => {
    const toggle = page.locator('[data-testid="all-time-toggle"]');
    const strip = page.locator('[data-testid="summary-strip"]');

    await toggle.click();
    await expect(page).toHaveURL(/from=\d{4}-\d{2}-\d{2}.*to=\d{4}-\d{2}-\d{2}/);
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    // Month selector gives way to the date range, which auto-opens
    await expect(page.locator("#filter-from")).toBeVisible();
    await expect(strip).not.toContainText(/\b0 transactions/, { timeout: 5000 });

    await toggle.click();
    await expect(page).not.toHaveURL(/from=/);
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
  });

  // ── Undo delete (feature 27) ──────────────────────────────────────────────
  // Functional, non-snapshot. Deletes an existing row, restores it from the
  // toast's Undo action — the restore re-creates the same fields (new id), so
  // the data other tests see is unchanged.

  test("undo delete restores the transaction", async ({ page }) => {
    const list = page.locator('[data-testid="transaction-list"]');
    const deleteButtons = list.locator('[aria-label^="Delete "]');
    const rowCount = await deleteButtons.count();
    if (rowCount === 0) return; // no data — skip

    // Delete the first row via the two-step inline confirm. Plain clicks (no
    // force): on mobile the row can sit behind the fixed bottom nav, and a
    // force-click at those coordinates hits the nav instead.
    const firstDelete = deleteButtons.first();
    const targetLabel = await firstDelete.getAttribute("aria-label");
    await firstDelete.scrollIntoViewIfNeeded();
    await firstDelete.click();
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(deleteButtons).toHaveCount(rowCount - 1);

    // Undo from the toast — the row is re-created (new id, same fields)
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(deleteButtons).toHaveCount(rowCount, { timeout: 5000 });
    await expect(page.locator(`[aria-label="${targetLabel}"]`).first()).toBeVisible();
  });

  // ── Duplicate detection (feature 22) ──────────────────────────────────────
  // Functional, non-snapshot. Adds the same entry twice quickly → the confirm
  // strip interrupts; [Add anyway] commits; the review banner appears for the
  // same-day pair. Cleans up both rows so other tests see unchanged data.

  test("duplicate detection — confirm strip, add anyway, review banner", async ({ page }) => {
    const quickAdd = page.locator('[data-testid="expense-input"]');
    const input = quickAdd.locator("input").first();
    const list = page.locator('[data-testid="transaction-list"]');
    const dupRows = list.getByText("Duptest", { exact: true });

    // First add commits normally; wait for the temp id → server id swap
    await input.fill("duptest 3.33");
    await input.press("Enter");
    await expect(dupRows).toHaveCount(1);
    await expect(list.getByText("Pending", { exact: true })).toHaveCount(0);

    // Second identical add within 60s → confirm strip, nothing committed yet.
    // The same-day hint dot also lights up on the Add button while typing.
    await input.fill("duptest 3.33");
    await expect(quickAdd.locator('[data-testid="same-day-dup-dot"]')).toBeVisible();
    await input.press("Enter");
    await expect(quickAdd.locator('[data-testid="dup-confirm"]')).toBeVisible();
    await expect(dupRows).toHaveCount(1);

    // [Add anyway] commits the duplicate
    await quickAdd.getByRole("button", { name: "Add anyway" }).click();
    await expect(dupRows).toHaveCount(2);
    await expect(list.getByText("Pending", { exact: true })).toHaveCount(0);

    // Review banner appears for the same-day duplicate pair
    await expect(page.locator('[data-testid="dup-banner"]')).toBeVisible();

    // Clean up both rows via the two-step confirm (no force-clicks — see undo test)
    for (let remaining = 1; remaining >= 0; remaining--) {
      const btn = page.locator('[aria-label="Delete Duptest transaction"]').first();
      await btn.scrollIntoViewIfNeeded();
      await btn.click();
      await page.getByRole("button", { name: "Delete", exact: true }).click();
      await expect(page.locator('[aria-label="Delete Duptest transaction"]')).toHaveCount(remaining);
    }
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

    await expandAppShell(page);
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
