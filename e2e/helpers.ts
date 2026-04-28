import type { Locator, Page } from "@playwright/test";

/**
 * Returns locators for every currency/numeric display in the page.
 * Pass to `toHaveScreenshot({ mask })` so snapshots don't break when
 * transaction amounts change between runs.
 */
export function amountMasks(page: Page): Locator[] {
  return [page.locator(".tabular-nums")];
}

/**
 * Wait for the page to fully settle after navigation:
 * network-idle first, then any visible loading spinner must disappear.
 */
export async function waitForReady(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle");

  const spinner = page.locator(".animate-spin").first();
  const visible = await spinner.isVisible().catch(() => false);
  if (visible) {
    await spinner.waitFor({ state: "hidden", timeout: 10_000 });
  }
}
