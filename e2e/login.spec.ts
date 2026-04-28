import { expect, test } from "@playwright/test";

// The login page is public — clear any project-level session cookie
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("Login page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("domcontentloaded");
  });

  test("layout — logo, form fields, sign-in button", async ({ page }) => {
    await expect(page).toHaveScreenshot("layout.png", {
      animations: "disabled",
    });
  });

  test("inline error on wrong credentials", async ({ page }) => {
    await page.fill('input[type="email"]', "wrong@example.com");
    await page.fill('input[type="password"]', "badpassword");
    await page.click('button[type="submit"]');
    await page.waitForSelector("text=Invalid email or password");
    await expect(page).toHaveScreenshot("error-state.png", {
      animations: "disabled",
    });
  });
});
