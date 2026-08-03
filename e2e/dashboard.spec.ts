import { expect, test } from "@playwright/test";
import { amountMasks, expandAppShell, waitForReady } from "./helpers";

test.describe("Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/dashboard");
    await waitForReady(page);
  });

  // ── Full page ─────────────────────────────────────────────────────────────

  test("full page layout", async ({ page }) => {
    await expandAppShell(page);
    await expect(page).toHaveScreenshot("full-page.png", {
      fullPage: true,
      animations: "disabled",
      // The pace chart's "this month" line ends at *today*, so its plot (and
      // pace badge) change daily — mask the whole card to keep this stable.
      mask: [...amountMasks(page), page.locator('[data-testid="pace-chart"]')],
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

  // Guards the Android dynamic-toolbar fix. The bottom nav must stay in normal
  // flow inside a non-scrolling app shell — a `position: fixed` bar is stranded
  // above the visible bottom the moment Firefox's URL bar retracts, and no
  // amount of JS compensation tracks that animation smoothly. Two invariants:
  // the nav is not fixed, and the document itself does not scroll.
  test("bottom nav — in flow, document does not scroll", async ({ page }) => {
    const bottomNav = page.locator('[data-testid="bottom-nav"]');
    if (!(await bottomNav.isVisible())) return; // desktop uses the sidebar — skip

    const layout = await bottomNav.evaluate((el) => {
      const doc = document.scrollingElement!;
      return {
        position: getComputedStyle(el).position,
        navBottom: el.getBoundingClientRect().bottom,
        viewportHeight: document.documentElement.clientHeight,
        docScrollable: doc.scrollHeight - doc.clientHeight,
      };
    });

    expect(layout.position).toBe("static");
    // Flush with the bottom edge (sub-pixel rounding only).
    expect(Math.abs(layout.navBottom - layout.viewportHeight)).toBeLessThan(1);
    // Root scroller has nothing to scroll → the URL bar never retracts.
    expect(layout.docScrollable).toBeLessThanOrEqual(1);
  });

  // The page must still be scrollable — inside <main>, not the document.
  test("main is the scroll region", async ({ page }) => {
    const scrollable = await page.evaluate(() => {
      const main = document.querySelector("[data-scroll-region]") as HTMLElement;
      return {
        overflowY: getComputedStyle(main).overflowY,
        canScroll: main.scrollHeight > main.clientHeight,
      };
    });

    expect(scrollable.overflowY).toBe("auto");
    expect(scrollable.canScroll).toBe(true);
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

  // Functional (non-snapshot): the chip row leads with the most-used categories,
  // closed off by a divider, then falls through to the rest of the category list.
  test("category chips lead with the most-used group", async ({ page }) => {
    const input = page.locator('[data-testid="expense-input"]');
    if (!(await input.isVisible())) return; // hidden on mobile — skip

    const row = input.locator('[data-testid="category-chip-row"]');
    const dividerIndex = await row.evaluate((el) =>
      [...el.children].findIndex((c) => c.tagName === "SPAN")
    );
    expect(dividerIndex).toBeGreaterThan(0);

    // Everything after the divider is the untouched category list — alphabetical
    // server order — so the ranked group has to be the part before it.
    const tail = await row.evaluate((el, i) =>
      [...el.children]
        .slice(i + 1)
        // Chips render as "<emoji><name>" — keep the name for the sort check.
        .map((c) => (c.textContent ?? "").replace(/[^\p{L} ]/gu, "").trim()),
      dividerIndex
    );
    expect([...tail].sort()).toEqual(tail);

    // Clicking a chip pre-fills the input with that category.
    const first = row.locator("button").first();
    const label = ((await first.textContent()) ?? "").replace(/[^\p{L} ]/gu, "").trim();
    await first.click();
    await expect(input.locator('input[type="text"]')).toHaveValue(`${label} `);
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

  test("due this week card — count, amounts, review link", async ({ page }) => {
    const card = page.locator('[data-testid="due-week-card"]');
    if (!(await card.isVisible())) return; // nothing due within 7 days — skip
    await expect(card).toHaveScreenshot("due-week-card.png", {
      animations: "disabled",
      mask: amountMasks(page),
    });
  });

  // ── Category donut + pace chart ───────────────────────────────────────────
  // Both use a fixed past month with data (May 2026): historical data never
  // changes, and the current month's pace line moves daily (ends at *today*),
  // which would break a current-month baseline every day.

  test("category donut — slices, centre total, legend", async ({ page }) => {
    await page.goto("/dashboard?month=5&year=2026");
    await waitForReady(page);

    const donut = page.locator('[data-testid="category-donut"]');
    await expect(donut).toHaveScreenshot("category-donut.png", {
      animations: "disabled",
      mask: amountMasks(page),
    });
  });

  test("spending pace chart — past month layout", async ({ page }) => {
    await page.goto("/dashboard?month=5&year=2026");
    await waitForReady(page);

    const chart = page.locator('[data-testid="pace-chart"]');
    await expect(chart).toHaveScreenshot("pace-chart.png", {
      animations: "disabled",
      mask: amountMasks(page),
    });
  });

  // ── Privacy mode ──────────────────────────────────────────────────────────
  // Desktop-only (one viewport is enough — the blur is a global CSS rule).
  // Fixed past month so the underlying data is stable; masks stay applied for
  // safety even though the blurred regions no longer vary.

  test("privacy mode — amounts blur when toggled", async ({ page }) => {
    const sidebar = page.locator('[data-testid="sidebar"]');
    if (!(await sidebar.isVisible())) return; // mobile/tablet — skip

    await page.goto("/dashboard?month=5&year=2026");
    await waitForReady(page);

    await sidebar.locator('[aria-label="Hide amounts"]').click({ force: true });
    await expect(page.locator("html")).toHaveAttribute("data-private", "");

    await expandAppShell(page);
    await expect(page).toHaveScreenshot("dashboard-private.png", {
      fullPage: true,
      animations: "disabled",
      mask: amountMasks(page),
    });

    // Reset — the preference persists in localStorage
    await sidebar.locator('[aria-label="Show amounts"]').click({ force: true });
    await expect(page.locator("html")).not.toHaveAttribute("data-private");
  });

  // ── Period selector ───────────────────────────────────────────────────────

  test("period selector — month / year / all-time toggle", async ({ page }) => {
    const selector = page.locator('[data-testid="period-selector"]');
    await expect(selector).toHaveScreenshot("period-selector.png", {
      animations: "disabled",
      // Emoji-free, but the date label varies with the current month — mask it
      maxDiffPixelRatio: 0.2,
    });
  });
});

// ── Past month (read-only) ──────────────────────────────────────────────────
// Historical months are review-only: no quick-add (adds always date to today),
// no today-anchored widgets (due-week / recurring), no budget Manage entry,
// and no edit/delete on transaction rows. Fixed past month = stable data.

test.describe("Dashboard — past month (read-only)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/dashboard?month=5&year=2026");
    await waitForReady(page);
  });

  test("full page layout — view-only badge, no edit affordances", async ({ page }) => {
    await expect(page.locator('[data-testid="view-only-badge"]')).toBeVisible();
    await expandAppShell(page);
    await expect(page).toHaveScreenshot("past-month-full-page.png", {
      fullPage: true,
      animations: "disabled",
      mask: amountMasks(page),
    });
  });

  test("edit actions are absent", async ({ page }) => {
    await expect(page.locator('[data-testid="expense-input"]')).toHaveCount(0);
    await expect(page.locator('[aria-label="Add expense"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="due-week-card"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="recurring-section"]')).toHaveCount(0);
    await expect(page.getByText("Manage →")).toHaveCount(0);
    // Transaction rows render without edit/delete buttons
    await expect(page.locator('[data-testid="transaction-list"]')).toBeVisible();
    await expect(page.locator('[aria-label^="Edit "]')).toHaveCount(0);
    await expect(page.locator('[aria-label^="Delete "]')).toHaveCount(0);
  });

  test("view-all link carries the viewed month", async ({ page }) => {
    await expect(page.getByRole("link", { name: "View all →" })).toHaveAttribute(
      "href",
      "/transactions?month=5&year=2026"
    );
  });
});

// ── Year view ─────────────────────────────────────────────────────────────
// Wider period mode: monthly trend, category breakdown, no month-only widgets
// (quick-add / recurring / budgets / daily-avg card are hidden).

test.describe("Dashboard — year view", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/dashboard?period=year");
    await waitForReady(page);
  });

  test("full page layout", async ({ page }) => {
    await expandAppShell(page);
    await expect(page).toHaveScreenshot("year-full-page.png", {
      fullPage: true,
      animations: "disabled",
      // The day-of-week profile divides by weekday occurrences up to *today*,
      // so its bars shift as days elapse — mask the whole card.
      mask: [...amountMasks(page), page.locator('[data-testid="dow-chart"]')],
    });
  });

  test("day-of-week profile — renders seven bars", async ({ page }) => {
    // Content drifts daily (see mask note above), so assert presence rather
    // than pixels: the card and its bar chart must render.
    const card = page.locator('[data-testid="dow-chart"]');
    await expect(card).toBeVisible();
    await expect(card.locator(".recharts-bar-rectangle")).toHaveCount(7);
  });

  test("stat cards — three cards, YoY badge, no daily-avg card", async ({ page }) => {
    const cards = page.locator('[data-testid="stat-cards"]');
    await expect(cards).toHaveScreenshot("year-stat-cards.png", {
      animations: "disabled",
      mask: amountMasks(page),
    });
  });
});

// ── All-time view ───────────────────────────────────────────────────────────
// Earliest transaction → now, no comparison deltas, monthly trend.

test.describe("Dashboard — all-time view", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/dashboard?period=all");
    await waitForReady(page);
  });

  test("full page layout", async ({ page }) => {
    await expandAppShell(page);
    await expect(page).toHaveScreenshot("all-time-full-page.png", {
      fullPage: true,
      animations: "disabled",
      // Day-of-week profile bars shift daily — mask the card (see year view).
      mask: [...amountMasks(page), page.locator('[data-testid="dow-chart"]')],
    });
  });

  test("wealth curve — hero chart with running balance", async ({ page }) => {
    const curve = page.locator('[data-testid="wealth-curve"]');
    await expect(curve).toHaveScreenshot("wealth-curve.png", {
      animations: "disabled",
      mask: amountMasks(page),
    });
  });
});
