import path from "path";

const IS_SQLITE = (process.env.DATABASE_URL ?? "").startsWith("file:");

// Use the SQLite client when running against the local dev database,
// otherwise fall back to the standard PostgreSQL client.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PrismaClient } = IS_SQLITE
  ? require(path.join(process.cwd(), "node_modules/.prisma/client-sqlite"))
  : require("@prisma/client");

const prisma = new PrismaClient();

const DEFAULT_CATEGORIES = [
  { name: "Food", icon: "🍽️", color: "#f59e0b" },
  { name: "Groceries", icon: "🛒", color: "#84cc16" },
  { name: "Transport", icon: "🚗", color: "#6366f1" },
  { name: "Shopping", icon: "🛍️", color: "#8b5cf6" },
  { name: "Entertainment", icon: "🎬", color: "#ec4899" },
  { name: "Health", icon: "💊", color: "#10b981" },
  { name: "Housing", icon: "🏠", color: "#14b8a6" },
  { name: "Utilities", icon: "⚡", color: "#f97316" },
  { name: "Education", icon: "📚", color: "#0ea5e9" },
  { name: "Coffee", icon: "☕", color: "#a16207" },
  { name: "Travel", icon: "✈️", color: "#0891b2" },
  { name: "Salary", icon: "💰", color: "#22c55e" },
  { name: "Freelance", icon: "💻", color: "#4ade80" },
  { name: "Investment", icon: "📈", color: "#eab308" },
  { name: "Bonus", icon: "🎁", color: "#34d399" },
  { name: "Misc", icon: "📦", color: "#94a3b8" },
];

async function main() {
  const userId = process.env.APP_USER_ID ?? "default-user";

  console.log(`Seeding default categories for user: ${userId}`);

  for (const cat of DEFAULT_CATEGORIES) {
    await prisma.category.upsert({
      where: { userId_name: { userId, name: cat.name } },
      update: {},
      create: { userId, ...cat, isDefault: true },
    });
  }

  console.log("✅ Seed complete");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
