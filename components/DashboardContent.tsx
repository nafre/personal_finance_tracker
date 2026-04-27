"use client";

import { useState, useCallback, useMemo, Suspense, useEffect } from "react";
import dynamic from "next/dynamic";
import { ExpenseInput } from "@/components/ExpenseInput";
import { TransactionList } from "@/components/TransactionList";
import { SpendingInsights } from "@/components/SpendingInsights";
import { QuickAddSheet } from "@/components/QuickAddSheet";
import { MonthSelector } from "@/components/MonthSelector";
import { RecurringList } from "@/components/recurring/RecurringList";
import { SyncStatusBar } from "@/components/SyncStatusBar";
import { useSyncContext } from "@/context/SyncProvider";
import { seedIDBFromServer, getTransactionsByMonth } from "@/lib/idb";
import { formatCurrency, cn, getNextDueDate, getRecurringStatus, type RecurringFrequency } from "@/lib/utils";

const TrendChart = dynamic(
  () => import("@/components/charts/TrendChart").then((m) => ({ default: m.TrendChart })),
  { ssr: false }
);

interface Transaction {
  id: string;
  category: string;
  amount: number;
  type: string;
  note?: string | null;
  labels?: string[];
  date: Date | string;
  isPending?: boolean;
}

interface DailyData {
  date: string;
  day: number;
  income: number;
  expense: number;
}

interface CategoryData {
  name: string;
  value: number;
}

interface RecurringTransaction {
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

interface DashboardContentProps {
  initialTransactions: Transaction[];
  initialTotalIncome: number;
  initialTotalExpenses: number;
  initialNetBalance: number;
  initialCategoryData: CategoryData[];
  initialDailyData: DailyData[];
  initialTopCategory: CategoryData | null;
  initialRecurring: RecurringTransaction[];
  month: number;
  year: number;
  prevTotalExpenses: number;
  prevTotalIncome: number;
  prevCategoryData: CategoryData[];
}

function StatCard({
  label,
  amount,
  variant,
  icon,
  momDelta,
}: {
  label: string;
  amount: number;
  variant: "income" | "expense" | "balance";
  icon: string;
  momDelta?: number | null;
}) {
  const isNegative = variant === "balance" && amount < 0;
  const effectiveKey: "income" | "expense" | "balance" =
    variant === "balance" && isNegative ? "expense" : variant;

  const colorMap = {
    income: "text-emerald-400",
    expense: "text-rose-400",
    balance: "text-indigo-300",
  };

  const gradientMap = {
    income: "linear-gradient(135deg, #052e16, #14532d)",
    expense: "linear-gradient(135deg, #2d0a14, #4c0519)",
    balance: "linear-gradient(135deg, #1e1b4b, #2e1065)",
  };

  const borderMap = {
    income: "rgba(16,185,129,0.25)",
    expense: "rgba(244,63,94,0.25)",
    balance: "rgba(99,102,241,0.25)",
  };

  const glowMap = {
    income: "0 1px 3px rgba(0,0,0,0.5), 0 4px 20px rgba(16,185,129,0.15)",
    expense: "0 1px 3px rgba(0,0,0,0.5), 0 4px 20px rgba(244,63,94,0.15)",
    balance: "0 1px 3px rgba(0,0,0,0.5), 0 4px 20px rgba(99,102,241,0.15)",
  };

  const decorMap = {
    income: "#10b981",
    expense: "#f43f5e",
    balance: "#818cf8",
  };

  const iconBgMap = {
    income: "rgba(16,185,129,0.15)",
    expense: "rgba(244,63,94,0.15)",
    balance: "rgba(129,140,248,0.15)",
  };

  return (
    <div
      className="rounded-2xl border p-5 relative overflow-hidden"
      style={{
        background: gradientMap[effectiveKey],
        borderColor: borderMap[effectiveKey],
        boxShadow: glowMap[effectiveKey],
      }}
    >
      {/* Decorative circle */}
      <div
        className="absolute -top-6 -right-6 w-24 h-24 rounded-full opacity-10 pointer-events-none"
        style={{ background: decorMap[effectiveKey] }}
      />

      <div className="flex items-center justify-between mb-3 relative">
        <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">
          {label}
        </span>
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center text-sm"
          style={{ background: iconBgMap[effectiveKey] }}
        >
          {icon}
        </div>
      </div>

      <p className={cn("text-3xl font-bold tabular-nums relative", colorMap[effectiveKey])}>
        {variant === "expense" ? "-" : variant === "balance" && amount < 0 ? "-" : ""}
        {formatCurrency(Math.abs(amount))}
      </p>

      {momDelta != null && isFinite(momDelta) && (
        <span
          className={cn(
            "text-xs font-medium mt-2 block relative",
            variant === "expense"
              ? momDelta > 0 ? "text-rose-400" : "text-emerald-400"
              : momDelta > 0 ? "text-emerald-400" : "text-rose-400"
          )}
        >
          {momDelta > 0 ? "▲" : "▼"} {Math.abs(momDelta).toFixed(0)}% vs last month
        </span>
      )}
    </div>
  );
}

export function DashboardContent({
  initialTransactions,
  initialTotalIncome,
  initialTotalExpenses,
  initialNetBalance,
  initialCategoryData,
  initialDailyData,
  initialTopCategory,
  initialRecurring,
  month,
  year,
  prevTotalExpenses,
  prevTotalIncome,
  prevCategoryData,
}: DashboardContentProps) {
  const { userId, pendingCount } = useSyncContext();

  const [transactions, setTransactions] = useState<Transaction[]>(initialTransactions);
  const [totalIncome, setTotalIncome] = useState(initialTotalIncome);
  const [totalExpenses, setTotalExpenses] = useState(initialTotalExpenses);
  const [netBalance, setNetBalance] = useState(initialNetBalance);
  const [categoryData, setCategoryData] = useState(initialCategoryData);
  const [dailyData] = useState(initialDailyData);
  const [topCategory] = useState(initialTopCategory);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [pendingTransactions, setPendingTransactions] = useState<Transaction[]>([]);

  const dueCount = initialRecurring.filter((r) => {
    const nextDue = getNextDueDate(r.frequency as RecurringFrequency, new Date(r.startDate), r.lastRun ? new Date(r.lastRun) : null);
    const status = getRecurringStatus(nextDue, r.endDate ? new Date(r.endDate) : null);
    return status === "due" || status === "overdue";
  }).length;
  const [showRecurring, setShowRecurring] = useState(dueCount > 0);

  // Seed IDB with fresh server data on mount / when server data updates
  useEffect(() => {
    if (!userId) return;
    void seedIDBFromServer(initialTransactions, userId);
  }, [initialTransactions, userId]);

  // Load pending (unsynced) transactions from IDB and merge into display
  useEffect(() => {
    if (!userId) return;
    getTransactionsByMonth(userId, month, year)
      .then((localTxs) => {
        const pending = localTxs
          .filter((t) => t.syncStatus !== "synced" && t.syncStatus !== "pending-delete")
          .map((t): Transaction => ({
            id: t.id,
            category: t.category,
            amount: t.amount,
            type: t.type,
            note: t.note,
            labels: t.labels,
            date: t.date,
            isPending: true,
          }));
        setPendingTransactions(pending);
      })
      .catch(() => {});
  }, [userId, month, year, pendingCount]);

  // Merged list: pending items first, deduped against server list
  const mergedTransactions = useMemo(() => {
    const serverIds = new Set(transactions.map((t) => t.id));
    const dedupedPending = pendingTransactions.filter((p) => !serverIds.has(p.id));
    return [...dedupedPending, ...transactions];
  }, [transactions, pendingTransactions]);

  // Pending stats deltas (so stat cards reflect unsynced adds immediately)
  const pendingIncome = useMemo(
    () => pendingTransactions.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0),
    [pendingTransactions]
  );
  const pendingExpenses = useMemo(
    () => pendingTransactions.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0),
    [pendingTransactions]
  );

  const displayIncome = totalIncome + pendingIncome;
  const displayExpenses = totalExpenses + pendingExpenses;
  const displayBalance = displayIncome - displayExpenses;

  const recentCategories = useMemo(() => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const tx of mergedTransactions) {
      if (tx.type === "expense" && !seen.has(tx.category) && result.length < 5) {
        seen.add(tx.category);
        result.push(tx.category);
      }
    }
    return result;
  }, [mergedTransactions]);

  const expenseDelta =
    prevTotalExpenses > 0
      ? ((displayExpenses - prevTotalExpenses) / prevTotalExpenses) * 100
      : null;
  const incomeDelta =
    prevTotalIncome > 0
      ? ((displayIncome - prevTotalIncome) / prevTotalIncome) * 100
      : null;

  // Optimistic add — instant UI, server already saved in ExpenseInput
  const handleAdd = useCallback(
    (tx: {
      id: string;
      category: string;
      amount: number;
      type: "income" | "expense";
      note?: string;
      labels: string[];
      date: Date | string;
      isPending?: boolean;
    }) => {
      // Only add to current month's view
      const txDate = new Date(tx.date);
      if (txDate.getMonth() + 1 !== month || txDate.getFullYear() !== year) return;

      // If it's a pending item, it'll also appear via the IDB useEffect —
      // add it optimistically to state now for zero-latency UI
      setTransactions((prev) => [tx, ...prev]);

      if (tx.type === "income") {
        setTotalIncome((p) => p + tx.amount);
        setNetBalance((p) => p + tx.amount);
      } else {
        setTotalExpenses((p) => p + tx.amount);
        setNetBalance((p) => p - tx.amount);

        // Update category breakdown
        setCategoryData((prev) => {
          const existing = prev.find((c) => c.name === tx.category);
          if (existing) {
            return prev
              .map((c) =>
                c.name === tx.category
                  ? { ...c, value: Math.round((c.value + tx.amount) * 100) / 100 }
                  : c
              )
              .sort((a, b) => b.value - a.value);
          }
          return [...prev, { name: tx.category, value: tx.amount }].sort(
            (a, b) => b.value - a.value
          );
        });
      }
    },
    [month, year]
  );

  const handleDelete = useCallback((id: string) => {
    const tx = transactions.find((t) => t.id === id) ?? pendingTransactions.find((t) => t.id === id);
    if (!tx) return;

    setTransactions((prev) => prev.filter((t) => t.id !== id));
    setPendingTransactions((prev) => prev.filter((t) => t.id !== id));

    if (tx.type === "income") {
      setTotalIncome((p) => p - tx.amount);
      setNetBalance((p) => p - tx.amount);
    } else {
      setTotalExpenses((p) => p - tx.amount);
      setNetBalance((p) => p + tx.amount);
    }
  }, [transactions, pendingTransactions]);

  const recentTransactions = mergedTransactions.slice(0, 6);

  return (
    <div className="space-y-5">
      {/* Month selector */}
      <div className="flex items-center justify-between">
        <MonthSelector month={month} year={year} />
        {topCategory && (
          <div className="hidden sm:flex items-center gap-2 text-sm text-slate-400">
            <span>Top spend:</span>
            <span className="text-slate-200 font-medium">{topCategory.name}</span>
            <span className="text-rose-400 font-semibold">
              {formatCurrency(topCategory.value)}
            </span>
          </div>
        )}
      </div>

      {/* Offline / syncing status */}
      <SyncStatusBar />

      {/* Quick input — desktop only; mobile uses FAB below */}
      <div className="hidden md:block">
        <ExpenseInput onAdd={handleAdd} recentCategories={recentCategories} />
      </div>

      {/* Mobile FAB */}
      <button
        className="fab md:hidden left-1/2 -translate-x-1/2"
        onClick={() => setSheetOpen(true)}
        aria-label="Add expense"
      >
        +
      </button>

      {/* Recurring transactions */}
      <div className="card">
        <button
          onClick={() => setShowRecurring((v) => !v)}
          className="w-full flex items-center justify-between group"
        >
          <div className="flex items-center gap-2">
            <div className="w-1 h-4 rounded-full bg-indigo-500 opacity-60" />
            <span className="text-sm font-semibold text-slate-200">Recurring</span>
            {dueCount > 0 && (
              <span className="text-xs bg-amber-500/20 text-amber-400 border border-amber-500/30 px-1.5 py-0.5 rounded-full">
                {dueCount} due
              </span>
            )}
          </div>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className={cn("h-4 w-4 text-slate-500 transition-transform", showRecurring ? "rotate-180" : "")}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {showRecurring && (
          <div className="mt-3">
            <RecurringList initialRecurring={initialRecurring} />
          </div>
        )}
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard label="Income" amount={displayIncome} variant="income" icon="📈" momDelta={incomeDelta} />
        <StatCard label="Expenses" amount={displayExpenses} variant="expense" icon="📉" momDelta={expenseDelta} />
        <StatCard label="Net" amount={displayBalance} variant="balance" icon="⚖️" />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Spending breakdown with MoM comparison */}
        <SpendingInsights
          categoryData={categoryData}
          prevCategoryData={prevCategoryData}
          totalExpenses={displayExpenses}
          month={month}
          year={year}
        />

        {/* Daily trend */}
        <div className="card">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1 h-4 rounded-full bg-indigo-500 opacity-60" />
            <h3 className="text-sm font-semibold text-slate-200">Daily Trend</h3>
          </div>
          <Suspense fallback={<div className="h-[200px] rounded-xl bg-slate-800 animate-pulse" />}>
            <TrendChart data={dailyData} />
          </Suspense>
          {/* Legend */}
          <div className="flex gap-4 mt-2 justify-center">
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
              Expenses
            </div>
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              Income
            </div>
          </div>
        </div>
      </div>

      {/* Recent transactions */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-1 h-4 rounded-full bg-indigo-500 opacity-60" />
            <h3 className="text-sm font-semibold text-slate-200">Recent Transactions</h3>
          </div>
          <a
            href="/transactions"
            className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            View all →
          </a>
        </div>
        <TransactionList
          transactions={recentTransactions}
          onDelete={handleDelete}
          compact
        />
      </div>

      {/* Mobile bottom sheet for quick add */}
      <QuickAddSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        recentCategories={recentCategories}
        onAdd={handleAdd}
      />
    </div>
  );
}
