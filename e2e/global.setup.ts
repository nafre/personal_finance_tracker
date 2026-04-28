import { test as setup } from "@playwright/test";
import fs from "fs";
import path from "path";

const AUTH_FILE = "e2e/.auth/user.json";

setup("authenticate", async ({ page }) => {
  const email = process.env.TEST_EMAIL;
  const password = process.env.TEST_PASSWORD;

  if (!email || !password) {
    throw new Error(
      "Missing test credentials.\n" +
        "Add TEST_EMAIL and TEST_PASSWORD to .env.local, then re-run the tests."
    );
  }

  fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });

  await page.goto("/login");
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard", { timeout: 15_000 });

  // Persist the session cookie so all spec projects reuse it without re-logging-in
  await page.context().storageState({ path: AUTH_FILE });
});
