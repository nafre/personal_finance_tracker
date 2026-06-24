import { z } from "zod";

export const transactionSchema = z.object({
  category: z.string().min(1, "Category is required"),
  amount: z.number().positive("Amount must be positive").finite("Amount must be a valid number"),
  type: z.enum(["income", "expense"]),
  note: z.string().max(500, "Note must be 500 characters or fewer").optional(),
  labels: z.array(z.string()).max(10, "Maximum 10 labels").default([]),
  excludedBudgetIds: z.array(z.string()).max(50, "Too many excluded budgets").default([]),
  excludeFromStats: z.boolean().default(false),
  date: z.date().optional(),
});

export const categorySchema = z.object({
  name: z.string().min(1, "Name is required").max(50, "Name must be 50 characters or fewer"),
  icon: z.string().optional(),
  color: z.string().optional(),
});

export const budgetSchema = z.object({
  name: z.string().min(1, "Name is required"),
  amount: z.number().positive("Amount must be positive"),
  budgetType: z.enum(["overall", "category", "excluded", "label"]),
  category: z.string().optional().nullable(),
  excludedCategories: z.array(z.string()).default([]),
  labels: z.array(z.string()).default([]),
});

export const recurringSchema = z.object({
  name: z.string().min(1, "Name is required"),
  category: z.string().min(1, "Category is required"),
  amount: z.number().positive("Amount must be positive"),
  type: z.enum(["income", "expense"]),
  frequency: z.enum(["daily", "weekly", "monthly", "yearly"]),
  startDate: z.date(),
  endDate: z.date().optional(),
  note: z.string().optional(),
});

export const passwordSchema = z.string().min(8, "Password must be at least 8 characters");
