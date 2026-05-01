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
  if (endDate) {
    const end = new Date(endDate);
    end.setHours(0, 0, 0, 0);
    // Ended if endDate is past OR next due falls beyond endDate (no payments left)
    if (end < today || due > end) return "ended";
  }
  if (due < today) return "overdue";
  if (due.getTime() === today.getTime()) return "due";
  return "upcoming";
}

export function isPostedThisPeriod(
  frequency: RecurringFrequency,
  lastRun: Date | null
): boolean {
  if (!lastRun) return false;
  const now = new Date();
  const lr = new Date(lastRun);
  switch (frequency) {
    case "daily":
      return (
        lr.getFullYear() === now.getFullYear() &&
        lr.getMonth() === now.getMonth() &&
        lr.getDate() === now.getDate()
      );
    case "weekly":
      return now.getTime() - lr.getTime() < 7 * 24 * 60 * 60 * 1000;
    case "monthly":
      return lr.getFullYear() === now.getFullYear() && lr.getMonth() === now.getMonth();
    case "yearly":
      return lr.getFullYear() === now.getFullYear();
  }
}

export function toMonthlyAmount(frequency: RecurringFrequency, amount: number): number {
  switch (frequency) {
    case "daily":   return amount * (365 / 12);
    case "weekly":  return amount * (52 / 12);
    case "monthly": return amount;
    case "yearly":  return amount / 12;
  }
}

export function countRemainingPayments(
  frequency: RecurringFrequency,
  nextDue: Date,
  endDate: Date
): number {
  let count = 0;
  let current = new Date(nextDue);
  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);
  while (current <= end) {
    count++;
    current = getNextDueDate(frequency, current, current);
  }
  return count;
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
