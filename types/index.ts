export interface Transaction {
  id: string;
  category: string;
  amount: number;
  type: string;
  note?: string | null;
  labels?: string[];
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

export interface Budget {
  id: string;
  category: string;
  amount: number;
}

export interface CategoryOption {
  name: string;
  icon?: string;
  color?: string;
}
