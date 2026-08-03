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
 * Also hides the Next.js dev build indicator (nextjs-portal) so it never
 * leaks into screenshots.
 */
export async function waitForReady(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle");

  const spinner = page.locator(".animate-spin").first();
  const visible = await spinner.isVisible().catch(() => false);
  if (visible) {
    await spinner.waitFor({ state: "hidden", timeout: 10_000 });
  }

  // Suppress the Next.js dev-mode route-compilation indicator ("N" badge)
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
}

/**
 * Flatten the dashboard's app shell back into an ordinary document scroller.
 *
 * `app/(dashboard)/layout.tsx` renders a `h-dvh overflow-hidden` shell whose
 * only scrollable region is <main>, so the root never scrolls (that's what
 * keeps the in-flow bottom nav pinned to the visible bottom on Android). The
 * side effect is that `document.scrollingElement` has nothing to scroll, so
 * Playwright's `fullPage: true` would capture just the first viewport.
 *
 * Call this before any full-page screenshot so the whole page is in view.
 */
export async function expandAppShell(page: Page): Promise<void> {
  await page.addStyleTag({
    content: `
      [data-app-shell] { height: auto !important; min-height: 100dvh; overflow: visible !important; }
      [data-scroll-region] { overflow: visible !important; }
    `,
  });
}
