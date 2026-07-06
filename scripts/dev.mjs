#!/usr/bin/env node
// Bootstrap script for local development.
// In SQLite mode (DATABASE_URL=file:...), auto-pushes the schema before
// starting Next.js so developers never need to run db:dev:push manually.

import { execSync, spawn } from "child_process";
import { readFileSync, existsSync } from "fs";
import { resolve, join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

// ── Load .env.local so DATABASE_URL is available ────────────────────────────
const envPath = join(root, ".env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

// ── Detect SQLite mode ───────────────────────────────────────────────────────
const dbUrl = process.env.DATABASE_URL ?? "";
const isSQLite = dbUrl.startsWith("file:");

if (isSQLite) {
  console.log("[dev] SQLite mode — bootstrapping local database...");

  const clientDir = join(root, "generated/prisma-sqlite");
  if (!existsSync(clientDir)) {
    console.error(
      "[dev] SQLite Prisma client not found. Run once:\n" +
        "      npm run db:dev:generate"
    );
    process.exit(1);
  }

  // lib/db.ts statically imports the Postgres client (generated/prisma), so
  // it must exist for the app to compile even when SQLite serves at runtime.
  if (!existsSync(join(root, "generated/prisma"))) {
    console.log("[dev] Postgres Prisma client missing — generating...");
    try {
      execSync("npx prisma generate", { cwd: root, stdio: "inherit" });
    } catch {
      console.error("[dev] prisma generate failed — see output above.");
      process.exit(1);
    }
  }

  try {
    execSync(
      "npx prisma db push" +
        " --schema prisma/schema.sqlite.prisma" +
        " --accept-data-loss",
      { cwd: root, stdio: "inherit" }
    );
  } catch {
    console.error("[dev] prisma db push failed — see output above.");
    process.exit(1);
  }

  console.log("[dev] Database ready.");
} else {
  console.log("[dev] PostgreSQL mode — skipping SQLite bootstrap.");
}

// ── Start Next.js, forwarding any extra flags ────────────────────────────────
const child = spawn("npx", ["next", "dev", ...process.argv.slice(2)], {
  cwd: root,
  stdio: "inherit",
  shell: true, // required on Windows so npx resolves through PATH
});

child.on("exit", (code) => process.exit(code ?? 0));
