export interface Transaction {
  id: string;
  category: string;
  amount: number;
  type: string;
  note?: string | null;
  labels?: string[];
  excludedBudgetIds?: string[];
  excludeFromStats?: boolean;
  date: Date | string;
  isPending?: boolean;
}

export interface CategoryData {
  name: string;
  value: number;
}

export interface DailyData {
  date: string;
  day: number;
  income: number;
  expense: number;
}

export interface RecurringTransaction {
  id: string;
  userId: string;
  name: string;
  category: string;
  amount: number;
  type: string;
  frequency: string;
  startDate: Date;
  endDate: Date | null;
  lastRun: Date | null;
  isActive: boolean;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type BudgetType = "overall" | "category" | "excluded" | "label";

export interface Budget {
  id: string;
  name: string;
  amount: number;
  budgetType: BudgetType;
  category?: string | null;
  excludedCategories: string[];
  labels: string[];
}

export interface CategoryOption {
  name: string;
  icon?: string;
  color?: string;
}

// Dashboard view window. "month" is the original single-month view; "year"
// covers Jan–Dec of a year; "all" covers every transaction (all-time).
export type Period = "month" | "year" | "all";
