import path from "path";

const IS_SQLITE = (process.env.DATABASE_URL ?? "").startsWith("file:");

// eslint-disable-next-line @typescript-eslint/no-require-imports
const bcrypt = require("bcryptjs");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let prisma: any;
if (IS_SQLITE) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PrismaClient } = require(
    path.join(process.cwd(), "generated/prisma-sqlite/client")
  );
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PrismaBetterSqlite3 } = require("@prisma/adapter-better-sqlite3");
  const adapter = new PrismaBetterSqlite3(
    { url: process.env.DATABASE_URL },
    // Keep DateTime columns as integer epoch-ms — see lib/db.ts.
    { timestampFormat: "unixepoch-ms" }
  );
  prisma = new PrismaClient({ adapter });
} else {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PrismaClient } = require(
    path.join(process.cwd(), "generated/prisma/client")
  );
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PrismaPg } = require("@prisma/adapter-pg");
  // sslmode no-verify: see lib/db.ts — matches Prisma 6's `require` semantics.
  const adapter = new PrismaPg({
    connectionString: (process.env.POSTGRES_PRISMA_URL ?? "").replace(
      "sslmode=require",
      "sslmode=no-verify"
    ),
  });
  prisma = new PrismaClient({ adapter });
}

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

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(Math.floor(Math.random() * 14) + 8, Math.floor(Math.random() * 59), 0, 0);
  return d;
}

function buildDemoTransactions(userId: string) {
  return [
    // ── Current month ──────────────────────────────────────────────────────────
    { userId, type: "income",  category: "Salary",        amount: 5800,   note: "Monthly salary — May",              date: daysAgo(1)  },
    { userId, type: "expense", category: "Housing",       amount: 1200,   note: "Rent — Setia Alam apartment",       date: daysAgo(2)  },
    { userId, type: "expense", category: "Groceries",     amount: 187.50, note: "Jaya Grocer — monthly top-up",      date: daysAgo(3)  },
    { userId, type: "expense", category: "Food",          amount: 14.90,  note: "Nasi lemak & teh tarik — mamak",    date: daysAgo(3)  },
    { userId, type: "expense", category: "Transport",     amount: 68.00,  note: "Touch 'n Go reload",                date: daysAgo(4)  },
    { userId, type: "expense", category: "Coffee",        amount: 22.80,  note: "Zus Coffee — weekly supply",        date: daysAgo(4)  },
    { userId, type: "expense", category: "Food",          amount: 32.40,  note: "Lunch — PappaRich Subang",          date: daysAgo(5)  },
    { userId, type: "expense", category: "Utilities",     amount: 98.20,  note: "TNB electricity bill",              date: daysAgo(6)  },
    { userId, type: "expense", category: "Utilities",     amount: 45.00,  note: "Unifi broadband",                   date: daysAgo(6)  },
    { userId, type: "expense", category: "Health",        amount: 55.00,  note: "Klinik panel — MC + meds",          date: daysAgo(7)  },
    { userId, type: "expense", category: "Food",          amount: 48.60,  note: "Dinner — Restoran Ali Maju",        date: daysAgo(8)  },
    { userId, type: "expense", category: "Shopping",      amount: 129.00, note: "Uniqlo sale — 2 shirts",            date: daysAgo(9)  },
    { userId, type: "expense", category: "Entertainment", amount: 45.00,  note: "GSC Gold Class — couple tickets",   date: daysAgo(10) },
    { userId, type: "expense", category: "Food",          amount: 11.50,  note: "Roti canai sarapan pagi",           date: daysAgo(11) },
    { userId, type: "expense", category: "Transport",     amount: 24.60,  note: "Grab — KLCC to Bangsar",            date: daysAgo(11) },
    { userId, type: "expense", category: "Groceries",     amount: 63.80,  note: "Cold Storage — top-up week 2",     date: daysAgo(12) },
    { userId, type: "expense", category: "Coffee",        amount: 18.90,  note: "Starbucks frappuccino",             date: daysAgo(13) },
    { userId, type: "income",  category: "Freelance",     amount: 800,    note: "Logo design project — client B",   date: daysAgo(14) },
    { userId, type: "expense", category: "Education",     amount: 299.00, note: "Udemy — React & Next.js course",   date: daysAgo(15) },
    { userId, type: "expense", category: "Food",          amount: 27.90,  note: "McDonald's drive-thru",             date: daysAgo(15) },

    // ── Last month ─────────────────────────────────────────────────────────────
    { userId, type: "income",  category: "Salary",        amount: 5800,   note: "Monthly salary — April",            date: daysAgo(32) },
    { userId, type: "expense", category: "Housing",       amount: 1200,   note: "Rent — Setia Alam apartment",       date: daysAgo(33) },
    { userId, type: "expense", category: "Groceries",     amount: 210.30, note: "Jaya Grocer — full month stock",    date: daysAgo(34) },
    { userId, type: "expense", category: "Food",          amount: 56.80,  note: "Char kuey teow + asam laksa",       date: daysAgo(35) },
    { userId, type: "expense", category: "Transport",     amount: 88.00,  note: "Petronas petrol fill-up",           date: daysAgo(36) },
    { userId, type: "expense", category: "Coffee",        amount: 31.50,  note: "OldTown White Coffee — x3 visits",  date: daysAgo(37) },
    { userId, type: "expense", category: "Utilities",     amount: 102.50, note: "TNB electricity bill",              date: daysAgo(38) },
    { userId, type: "expense", category: "Utilities",     amount: 45.00,  note: "Unifi broadband",                   date: daysAgo(38) },
    { userId, type: "expense", category: "Shopping",      amount: 254.00, note: "Shopee haul — home goods",          date: daysAgo(40) },
    { userId, type: "expense", category: "Entertainment", amount: 16.90,  note: "Netflix subscription",              date: daysAgo(41) },
    { userId, type: "expense", category: "Food",          amount: 35.50,  note: "Banana Leaf Rice — birthday lunch", date: daysAgo(43) },
    { userId, type: "expense", category: "Health",        amount: 120.00, note: "Guardian pharmacy — supplements",   date: daysAgo(44) },
    { userId, type: "expense", category: "Food",          amount: 22.00,  note: "Wantan mee & air bandung",          date: daysAgo(45) },
    { userId, type: "expense", category: "Transport",     amount: 31.20,  note: "Grab rides — 4 trips",              date: daysAgo(46) },
    { userId, type: "income",  category: "Bonus",         amount: 1500,   note: "Q1 performance bonus",              date: daysAgo(47) },
    { userId, type: "expense", category: "Travel",        amount: 380.00, note: "AirAsia — KL to Penang return",     date: daysAgo(48) },
    { userId, type: "expense", category: "Travel",        amount: 210.00, note: "Penang hotel — 2 nights",           date: daysAgo(49) },
    { userId, type: "expense", category: "Food",          amount: 44.50,  note: "Penang street food tour",           date: daysAgo(50) },
    { userId, type: "expense", category: "Groceries",     amount: 95.60,  note: "Tesco Kota Damansara",              date: daysAgo(52) },
    { userId, type: "expense", category: "Coffee",        amount: 14.50,  note: "Kopi O at kopitiam",                date: daysAgo(53) },

    // ── Two months ago ─────────────────────────────────────────────────────────
    { userId, type: "income",  category: "Salary",        amount: 5800,   note: "Monthly salary — March",            date: daysAgo(62) },
    { userId, type: "expense", category: "Housing",       amount: 1200,   note: "Rent — Setia Alam apartment",       date: daysAgo(63) },
    { userId, type: "expense", category: "Groceries",     amount: 178.90, note: "Jaya Grocer — monthly shop",        date: daysAgo(64) },
    { userId, type: "expense", category: "Food",          amount: 18.50,  note: "Nasi kandar Pelita",                date: daysAgo(65) },
    { userId, type: "expense", category: "Transport",     amount: 75.00,  note: "Touch 'n Go + Grab",               date: daysAgo(66) },
    { userId, type: "expense", category: "Coffee",        amount: 27.00,  note: "Zus Coffee — biweekly",             date: daysAgo(67) },
    { userId, type: "expense", category: "Utilities",     amount: 89.40,  note: "TNB electricity bill",              date: daysAgo(68) },
    { userId, type: "expense", category: "Utilities",     amount: 45.00,  note: "Unifi broadband",                   date: daysAgo(68) },
    { userId, type: "expense", category: "Entertainment", amount: 16.90,  note: "Netflix subscription",              date: daysAgo(70) },
    { userId, type: "expense", category: "Food",          amount: 61.00,  note: "Steamboat dinner — Shabu-Shabu",    date: daysAgo(72) },
    { userId, type: "expense", category: "Shopping",      amount: 189.00, note: "Parkson sale — shoes",              date: daysAgo(73) },
    { userId, type: "income",  category: "Freelance",     amount: 1200,   note: "Website build — small biz client",  date: daysAgo(74) },
    { userId, type: "expense", category: "Education",     amount: 80.00,  note: "Physical book — Atomic Habits",     date: daysAgo(75) },
    { userId, type: "expense", category: "Health",        amount: 65.00,  note: "Dental check-up + cleaning",        date: daysAgo(76) },
    { userId, type: "expense", category: "Food",          amount: 29.80,  note: "Bak kut teh — Sunday brunch",       date: daysAgo(77) },
    { userId, type: "expense", category: "Transport",     amount: 56.00,  note: "Petronas petrol half-tank",         date: daysAgo(78) },
    { userId, type: "expense", category: "Groceries",     amount: 82.40,  note: "Cold Storage — midmonth top-up",   date: daysAgo(80) },
    { userId, type: "expense", category: "Misc",          amount: 35.00,  note: "Parking summons — MBPJ",           date: daysAgo(82) },
    { userId, type: "expense", category: "Coffee",        amount: 19.50,  note: "Caffeine fix before standup",       date: daysAgo(83) },
    { userId, type: "income",  category: "Investment",    amount: 420.00, note: "MyASNB dividend payout",            date: daysAgo(85) },
  ];
}

async function seedCategories(userId: string) {
  for (const cat of DEFAULT_CATEGORIES) {
    await prisma.category.upsert({
      where: { userId_name: { userId, name: cat.name } },
      update: {},
      create: { userId, ...cat, isDefault: true },
    });
  }
}

async function main() {
  const adminUserId = process.env.APP_USER_ID ?? "default-user";
  const adminEmail  = (process.env.ADMIN_EMAIL ?? "admin@example.com").toLowerCase();
  const adminHash   = process.env.ADMIN_PASSWORD_HASH ?? "";

  // ── 1. Upsert admin User ───────────────────────────────────────────────────
  console.log(`[seed] Upserting admin user id=${adminUserId}`);
  await prisma.user.upsert({
    where: { id: adminUserId },
    create: {
      id: adminUserId,
      email: adminEmail,
      name: "Me",
      passwordHash: adminHash || await bcrypt.hash("changeme", 12),
      role: "admin",
    },
    update: {
      email: adminEmail,
      ...(adminHash ? { passwordHash: adminHash } : {}),
    },
  });

  // ── 2. Seed default categories for admin ───────────────────────────────────
  console.log("[seed] Seeding categories for admin user");
  await seedCategories(adminUserId);

  // ── 3. Upsert demo User ────────────────────────────────────────────────────
  const demoId = "demo-user";
  const demoEmail = "demo@example.com";
  const demoHash = await bcrypt.hash("demo1234", 12);

  console.log(`[seed] Upserting demo user id=${demoId}`);
  await prisma.user.upsert({
    where: { id: demoId },
    create: {
      id: demoId,
      email: demoEmail,
      name: "Demo User",
      passwordHash: demoHash,
      role: "demo",
    },
    update: { passwordHash: demoHash, role: "demo" },
  });

  // ── 4. Seed categories for demo user ──────────────────────────────────────
  console.log("[seed] Seeding categories for demo user");
  await seedCategories(demoId);

  // ── 5. Re-seed demo transactions ──────────────────────────────────────────
  console.log("[seed] Re-seeding demo transactions");
  await prisma.transaction.deleteMany({ where: { userId: demoId } });
  const demoTxs = buildDemoTransactions(demoId);
  for (const tx of demoTxs) {
    await prisma.transaction.create({ data: tx });
  }

  console.log(`[seed] Done — ${demoTxs.length} demo transactions seeded`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
