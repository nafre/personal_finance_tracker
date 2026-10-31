import { z } from "zod";

export const transactionSchema = z.object({
  category: z.string().min(1, "Category is required").max(100, "Category must be 100 characters or fewer"),
  amount: z.number().positive("Amount must be positive").finite("Amount must be a valid number"),
  type: z.enum(["income", "expense"]),
  note: z.string().max(500, "Note must be 500 characters or fewer").optional(),
  labels: z.array(z.string().max(50, "Label must be 50 characters or fewer")).max(10, "Maximum 10 labels").default([]),
  excludedBudgetIds: z.array(z.string().max(50)).max(50, "Too many excluded budgets").default([]),
  excludeFromStats: z.boolean().default(false),
  date: z.date().optional(),
});

export const categorySchema = z.object({
  name: z.string().min(1, "Name is required").max(50, "Name must be 50 characters or fewer"),
  icon: z.string().max(20, "Icon must be 20 characters or fewer").optional(),
  color: z.string().max(30, "Color must be 30 characters or fewer").optional(),
});

export const budgetSchema = z.object({
  name: z.string().min(1, "Name is required").max(50, "Name must be 50 characters or fewer"),
  amount: z.number().positive("Amount must be positive").finite("Amount must be a valid number"),
  budgetType: z.enum(["overall", "category", "excluded", "label"]),
  category: z.string().max(100).optional().nullable(),
  excludedCategories: z.array(z.string().max(100)).max(100).default([]),
  labels: z.array(z.string().max(50)).max(50).default([]),
});

export const recurringSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name must be 100 characters or fewer"),
  category: z.string().min(1, "Category is required").max(100, "Category must be 100 characters or fewer"),
  amount: z.number().positive("Amount must be positive").finite("Amount must be a valid number"),
  type: z.enum(["income", "expense"]),
  frequency: z.enum(["daily", "weekly", "monthly", "yearly"]),
  startDate: z.date(),
  endDate: z.date().optional(),
  note: z.string().max(500, "Note must be 500 characters or fewer").optional(),
});

// Update variant: everything optional, plus the update-only fields
// (endDate/note are clearable with null, isActive is update-only).
export const recurringUpdateSchema = recurringSchema.partial().extend({
  endDate: z.date().nullable().optional(),
  note: z.string().max(500, "Note must be 500 characters or fewer").nullable().optional(),
  isActive: z.boolean().optional(),
  installmentCount: z.number().int().min(2).max(120).optional(),
});

// Installment plan creation. Exactly one of `total` (split equally) or
// `amount` (per payment) is given; `today` is the client's local calendar day
// (yyyy-MM-dd) so "already due" is judged in the user's timezone.
export const installmentSchema = z
  .object({
    name: z.string().min(1, "Name is required").max(100, "Name must be 100 characters or fewer"),
    category: z.string().min(1, "Category is required").max(100, "Category must be 100 characters or fewer"),
    type: z.enum(["income", "expense"]),
    frequency: z.enum(["daily", "weekly", "monthly", "yearly"]),
    count: z.number().int().min(2, "At least 2 payments").max(120, "At most 120 payments"),
    total: z.number().positive().finite().optional(),
    amount: z.number().positive().finite().optional(),
    firstChargeDate: z.date(),
    today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    note: z.string().max(500, "Note must be 500 characters or fewer").optional(),
    labels: z.array(z.string().max(50, "Label must be 50 characters or fewer")).max(10, "Maximum 10 labels").default([]),
    sourceTransactionId: z.string().max(50).optional(),
  })
  .refine((d) => (d.total === undefined) !== (d.amount === undefined), {
    message: "Provide either a total or a per-payment amount",
  });

export const roleSchema = z.enum(["admin", "user", "demo"]);

export const passwordSchema = z.string().min(8, "Password must be at least 8 characters");
