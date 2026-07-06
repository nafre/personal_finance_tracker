import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import path from "path";

const IS_SQLITE = (process.env.DATABASE_URL ?? "").startsWith("file:");

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function makeClient(): PrismaClient {
  if (IS_SQLITE) {
    const clientPath = path.join(
      process.cwd(),
      "generated/prisma-sqlite/client.ts"
    );
    // eval("require") bypasses webpack's static require analysis so the
    // SQLite client (separate output dir, raw TS since Prisma 7's generator
    // no longer emits compiled JS) is resolved by Node.js at runtime. Plain
    // require() can't parse its extensionless ESM-style internal imports,
    // so we route through tsx's scoped require, which can.
    // eslint-disable-next-line no-eval
    const { require: tsxRequire } = eval("require")("tsx/cjs/api");
    const { PrismaClient: SQLiteClient } = tsxRequire(clientPath, __filename);
    // eslint-disable-next-line no-eval
    const { PrismaBetterSqlite3 } = eval("require")(
      "@prisma/adapter-better-sqlite3"
    );
    const adapter = new PrismaBetterSqlite3(
      { url: process.env.DATABASE_URL },
      // Keep DateTime columns stored as integer epoch-ms (Prisma 7's default
      // is ISO8601 strings) — the raw SQL in lib/db-adapter.ts's getTrendRows
      // divides `date` by 1000 before strftime(), matching existing dev.db rows.
      { timestampFormat: "unixepoch-ms" }
    );
    return new SQLiteClient({ adapter, log: ["error", "warn"] }) as PrismaClient;
  }
  // Unnamed prepared statements by default (no statementNameGenerator), so
  // this is safe behind Supabase's transaction-mode pgbouncer pooler.
  // sslmode=require -> no-verify: the pg driver verifies certs under
  // `require` (unlike Prisma 6's Rust engine) and Supabase's pooler chain is
  // self-signed; no-verify preserves the v6 semantics (encrypted, unverified).
  const adapter = new PrismaPg({
    connectionString: (process.env.POSTGRES_PRISMA_URL ?? "").replace(
      "sslmode=require",
      "sslmode=no-verify"
    ),
  });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

export const db = globalForPrisma.prisma ?? makeClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
