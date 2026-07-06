import dotenv from "dotenv";
import { defineConfig } from "prisma/config";

// This project follows Next.js convention and keeps env vars in .env.local
// (there is no .env) — dotenv/config alone would only look for .env.
dotenv.config({ path: ".env.local" });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Only the CLI reads this (generate/db push/studio) — the runtime client
    // gets its URL via the driver adapter in lib/db.ts. SQLite dev mode wins
    // when DATABASE_URL is set; otherwise use the direct (non-pooled) Supabase
    // connection, mirroring the directUrl the schema carried under Prisma 6.
    url: process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING,
  },
});
