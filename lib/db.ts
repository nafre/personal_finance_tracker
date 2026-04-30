import { PrismaClient } from "@prisma/client";
import path from "path";

const IS_SQLITE = (process.env.DATABASE_URL ?? "").startsWith("file:");

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function makeClient(): PrismaClient {
  if (IS_SQLITE) {
    const clientPath = path.join(
      process.cwd(),
      "node_modules/.prisma/client-sqlite"
    );
    // eval("require") bypasses webpack's static require analysis so the
    // SQLite client (separate output dir) is resolved by Node.js at runtime.
    // eslint-disable-next-line no-eval
    const { PrismaClient: SQLiteClient } = eval("require")(clientPath);
    return new SQLiteClient({ log: ["error", "warn"] }) as PrismaClient;
  }
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

export const db = globalForPrisma.prisma ?? makeClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
