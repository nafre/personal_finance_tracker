import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number): string {
  const formatted = new Intl.NumberFormat("ms-MY", {
    style: "decimal",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
  return `RM${formatted}`;
}

export type RecurringFrequency = "daily" | "weekly" | "monthly" | "yearly";

export function getNextDueDate(
  frequency: RecurringFrequency,
  startDate: Date,
  lastRun: Date | null
): Date {
  if (!lastRun) return new Date(startDate);
  const base = new Date(lastRun);
  if      (frequency === "daily")   base.setDate(base.getDate() + 1);
  else if (frequency === "weekly")  base.setDate(base.getDate() + 7);
  else if (frequency === "monthly") base.setMonth(base.getMonth() + 1);
  else if (frequency === "yearly")  base.setFullYear(base.getFullYear() + 1);
  return base;
}

export function getRecurringStatus(
  nextDue: Date,
  endDate: Date | null
): "upcoming" | "due" | "overdue" | "ended" {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(nextDue);
  due.setHours(0, 0, 0, 0);
  if (endDate && new Date(endDate) < today) return "ended";
  if (due < today) return "overdue";
  if (due.getTime() === today.getTime()) return "due";
  return "upcoming";
}

export function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(date));
}

export function formatDateShort(date: Date | string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(date));
}

export function getMonthName(month: number): string {
  return new Date(2000, month - 1, 1).toLocaleString("en-US", { month: "long" });
}

export function getCurrentMonthYear(): { month: number; year: number } {
  const now = new Date();
  return { month: now.getMonth() + 1, year: now.getFullYear() };
}

export function getPrevMonth(month: number, year: number) {
  if (month === 1) return { month: 12, year: year - 1 };
  return { month: month - 1, year };
}

export function getNextMonth(month: number, year: number) {
  if (month === 12) return { month: 1, year: year + 1 };
  return { month: month + 1, year };
}

// Generate a colour deterministically from a string (for dynamic categories)
export function stringToColor(str: string): string {
  const palette = [
    "#6366f1", "#10b981", "#f59e0b", "#ef4444",
    "#8b5cf6", "#06b6d4", "#f97316", "#84cc16",
    "#ec4899", "#14b8a6", "#a16207", "#0891b2",
  ];
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return palette[Math.abs(hash) % palette.length];
}
