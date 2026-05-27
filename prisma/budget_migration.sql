-- Run this in Supabase Studio SQL editor BEFORE running `npm run db:push`
-- Migrates the budgets table from the old schema to the new enhanced schema.

-- 1. Add new columns (safe to run even if partially done)
ALTER TABLE "budgets" ADD COLUMN IF NOT EXISTS "name" TEXT;
ALTER TABLE "budgets" ADD COLUMN IF NOT EXISTS "budgetType" TEXT NOT NULL DEFAULT 'category';
ALTER TABLE "budgets" ADD COLUMN IF NOT EXISTS "excludedCategories" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "budgets" ADD COLUMN IF NOT EXISTS "labels" TEXT[] NOT NULL DEFAULT '{}';

-- 2. Migrate existing rows: derive name and budgetType from old category field
UPDATE "budgets"
SET
  "name"       = CASE WHEN "category" = '_overall_' THEN 'Overall' ELSE "category" END,
  "budgetType" = CASE WHEN "category" = '_overall_' THEN 'overall' ELSE 'category' END
WHERE "name" IS NULL;

-- 3. Make category nullable BEFORE nulling it out
ALTER TABLE "budgets" ALTER COLUMN "category" DROP NOT NULL;

-- 4. Clear category for overall-type budgets (now identified by budgetType)
UPDATE "budgets" SET "category" = NULL WHERE "budgetType" = 'overall';

-- 5. Make name NOT NULL now that all rows have values
ALTER TABLE "budgets" ALTER COLUMN "name" SET NOT NULL;

-- 6. Swap unique constraint: (userId, category) → (userId, name)
DROP INDEX IF EXISTS "budgets_userId_category_key";
CREATE UNIQUE INDEX IF NOT EXISTS "budgets_userId_name_key" ON "budgets"("userId", "name");
