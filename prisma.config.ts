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
    url: process.env.DATABASE_URL ?? process.env.POSTGRES_PRISMA_URL,
  },
});
