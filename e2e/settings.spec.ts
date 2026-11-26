import { expect, test, type Page } from "@playwright/test";
import { expandAppShell, waitForReady } from "./helpers";

test.describe("Settings", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/settings");
    await waitForReady(page);
  });

  test("full page layout", async ({ page }) => {
    await expandAppShell(page);
    await expect(page).toHaveScreenshot("full-page.png", {
      fullPage: true,
      animations: "disabled",
    });
  });

  test("preferences tab — toggle rows", async ({ page }) => {
    await page.getByRole("tab", { name: "Preferences" }).click();
    const panel = page.locator('[data-testid="preferences-panel"]');
    await expect(panel).toHaveScreenshot("preferences-panel.png", {
      animations: "disabled",
    });
  });

  test("category list", async ({ page }) => {
    // Admin users default to the Users tab — click Categories first
    const categoriesTab = page.getByRole("tab", { name: "Categories" });
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

// ── Fingerprint app lock (installed PWA only) ───────────────────────────────
// Standalone display mode is emulated by overriding matchMedia before any page
// script runs (the pre-paint lock script in app/layout.tsx included), and the
// fingerprint sensor by a CDP virtual platform authenticator. Toggling the
// authenticator's isUserVerified simulates a recognised / rejected finger.
// localStorage changes never reach e2e/.auth/user.json, so other tests start
// with the lock off regardless.

async function emulateInstalledApp(page: Page) {
  await page.addInitScript(() => {
    const original = window.matchMedia.bind(window);
    window.matchMedia = (query: string) =>
      query.includes("display-mode: standalone") ? original("(min-width: 0px)") : original(query);
    // Simulated cold launch: a killed PWA comes back with empty sessionStorage.
    // Reloading fires pagehide (which marks the app active), so the marker is
    // dropped at document start instead — before the pre-paint lock script.
    if (sessionStorage.getItem("e2e-cold-launch")) {
      sessionStorage.removeItem("e2e-cold-launch");
      sessionStorage.removeItem("app-lock-last-active");
    }
  });
}

async function addVirtualFingerprint(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasUserVerification: true,
      isUserVerified: true,
      hasResidentKey: false,
      automaticPresenceSimulation: true,
    },
  });
  return (isUserVerified: boolean) =>
    cdp.send("WebAuthn.setUserVerified", { authenticatorId, isUserVerified });
}

test.describe("Fingerprint lock", () => {
  test("browser tab — setting hidden, never locks", async ({ page }) => {
    // Even with a lock config already stored, a non-installed tab ignores it.
    await page.addInitScript(() => {
      localStorage.setItem(
        "app-preferences",
        JSON.stringify({ appLock: { userId: "someone", credentialId: "AAAA" } })
      );
    });
    await page.goto("/settings");
    await waitForReady(page);
    await page.getByRole("tab", { name: "Preferences" }).click();

    await expect(page.locator('[data-testid="preferences-panel"]')).toBeVisible();
    await expect(page.locator('[data-testid="fingerprint-lock-toggle"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="app-lock-overlay"]')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.hasAttribute("data-locked"))).toBe(false);
  });

  test("installed app — enable, lock on launch, unlock, re-lock, disable", async ({ page }) => {
    await emulateInstalledApp(page);
    await page.goto("/settings");
    await waitForReady(page);
    const setUserVerified = await addVirtualFingerprint(page);

    // Enable: enrolls + verifies the virtual fingerprint.
    await page.getByRole("tab", { name: "Preferences" }).click();
    const toggle = page.locator('[data-testid="fingerprint-lock-toggle"] input[role="switch"]');
    await expect(toggle).not.toBeChecked();
    await page.locator('[data-testid="fingerprint-lock-toggle"]').click();
    await expect(toggle).toBeChecked();

    // Cold launch: fresh sessionStorage → locked before first paint. A
    // rejected finger keeps the auto-prompt from unlocking it.
    await setUserVerified(false);
    await page.evaluate(() => sessionStorage.setItem("e2e-cold-launch", "1"));
    await page.reload();
    const overlay = page.locator('[data-testid="app-lock-overlay"]');
    await expect(overlay).toBeVisible();
    await expect(page.locator("[data-app-shell]")).toBeHidden();
    const unlock = overlay.getByRole("button", { name: "Unlock" });
    await expect(unlock).toBeEnabled();
    await expect(overlay).toHaveScreenshot("app-lock-overlay.png", { animations: "disabled" });

    // Wrong finger → stays locked with an error.
    await unlock.click();
    await expect(overlay.getByRole("alert")).toContainText("not recognised");
    await expect(overlay).toBeVisible();

    // Right finger → unlocked.
    await setUserVerified(true);
    await unlock.click();
    await expect(overlay).toHaveCount(0);
    await expect(page.locator("[data-app-shell]")).toBeVisible();

    // A reload inside the grace window doesn't re-prompt.
    await page.reload();
    await waitForReady(page);
    await expect(overlay).toHaveCount(0);

    // Back after more than 5 minutes in the background → locked again.
    await setUserVerified(false);
    await page.evaluate(() => {
      sessionStorage.setItem("app-lock-last-active", String(Date.now() - 6 * 60_000));
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect(overlay).toBeVisible();
    await setUserVerified(true);
    await overlay.getByRole("button", { name: "Unlock" }).click();
    await expect(overlay).toHaveCount(0);

    // Disable: requires the fingerprint.
    await page.getByRole("tab", { name: "Preferences" }).click();
    await page.locator('[data-testid="fingerprint-lock-toggle"]').click();
    await expect(toggle).not.toBeChecked();
  });
});
