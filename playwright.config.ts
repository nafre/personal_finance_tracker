import { defineConfig } from "@playwright/test";
import { config } from "dotenv";

// Playwright doesn't load Next.js env files automatically — pull them in manually
config({ path: ".env.local" });

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["html", { open: "never" }], ["list"]],

  // Organise snapshots as: e2e/snapshots/<project>/<spec-file>/<test-name>.png
  snapshotPathTemplate: "e2e/snapshots/{projectName}/{testFileName}/{arg}{ext}",

  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    // Prevent anti-aliasing and sub-pixel differences across runs
    colorScheme: "dark",
  },

  projects: [
    // ── Auth setup (runs once before all viewport projects) ──────────────
    {
      name: "setup",
      testMatch: /global\.setup\.ts/,
    },

    // ── Mobile  390 × 844  (iPhone 14 logical pixels) ───────────────────
    {
      name: "mobile",
      dependencies: ["setup"],
      testIgnore: /global\.setup\.ts/,
      use: {
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        storageState: "e2e/.auth/user.json",
      },
    },

    // ── Tablet  768 × 1024  (iPad portrait) ─────────────────────────────
    {
      name: "tablet",
      dependencies: ["setup"],
      testIgnore: /global\.setup\.ts/,
      use: {
        viewport: { width: 768, height: 1024 },
        storageState: "e2e/.auth/user.json",
      },
    },

    // ── Desktop  1280 × 900 ──────────────────────────────────────────────
    {
      name: "desktop",
      dependencies: ["setup"],
      testIgnore: /global\.setup\.ts/,
      use: {
        viewport: { width: 1280, height: 900 },
        storageState: "e2e/.auth/user.json",
      },
    },
  ],

  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
