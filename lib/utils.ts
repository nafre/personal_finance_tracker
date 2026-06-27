import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export const DEFAULT_CATEGORIES = [
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
] as const;

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
    // Ended only when next due falls beyond endDate — a missed payment within the window stays overdue
    if (due > end) return "ended";
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

// Every month touched by the [start, end] range, inclusive. Used to fill the
// monthly trend with zero buckets for months that have no transactions.
export function enumerateMonths(
  start: Date,
  end: Date
): { year: number; month: number }[] {
  const result: { year: number; month: number }[] = [];
  let y = start.getFullYear();
  let m = start.getMonth() + 1;
  const endY = end.getFullYear();
  const endM = end.getMonth() + 1;
  // Guard against an inverted range producing an infinite loop.
  let guard = 0;
  while ((y < endY || (y === endY && m <= endM)) && guard++ < 1200) {
    result.push({ year: y, month: m });
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return result;
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
