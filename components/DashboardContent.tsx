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
import { seedIDBFromServer, getTransactionsByMonth, deleteTransactionFromIDB } from "@/lib/idb";
import { formatCurrency, cn, getNextDueDate, getRecurringStatus, toMonthlyAmount, type RecurringFrequency } from "@/lib/utils";
import { BudgetProgress } from "@/components/budgets/BudgetProgress";

const BudgetManager = dynamic(
  () => import("@/components/budgets/BudgetManager").then((m) => ({ default: m.BudgetManager })),
  { ssr: false }
);

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

interface Budget {
  id: string;
  category: string;
  amount: number;
}

interface DashboardContentProps {
  initialTransactions: Transaction[];
  initialTotalIncome: number;
  initialTotalExpenses: number;
  initialCategoryData: CategoryData[];
  initialDailyData: DailyData[];
  initialTopCategory: CategoryData | null;
  initialRecurring: RecurringTransaction[];
  initialBudgets: Budget[];
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
        {variant === "balance" && amount < 0 ? "-" : ""}
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
  initialCategoryData,
  initialDailyData,
  initialTopCategory,
  initialRecurring,
  initialBudgets,
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
  const [categoryData, setCategoryData] = useState(initialCategoryData);
  const [dailyData] = useState(initialDailyData);
  const [topCategory] = useState(initialTopCategory);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [pendingTransactions, setPendingTransactions] = useState<Transaction[]>([]);
  const [budgets] = useState<Budget[]>(initialBudgets);
  const [showBudgetManager, setShowBudgetManager] = useState(false);

  const dueCount = initialRecurring.filter((r) => {
    const nextDue = getNextDueDate(r.frequency as RecurringFrequency, new Date(r.startDate), r.lastRun ? new Date(r.lastRun) : null);
    const status = getRecurringStatus(nextDue, r.endDate ? new Date(r.endDate) : null);
    return status === "due" || status === "overdue";
  }).length;

  const fixedAvailableCash = initialRecurring.reduce((sum, r) => {
    const nextDue = getNextDueDate(r.frequency as RecurringFrequency, new Date(r.startDate), r.lastRun ? new Date(r.lastRun) : null);
    if (getRecurringStatus(nextDue, r.endDate ? new Date(r.endDate) : null) === "ended") return sum;
    const monthly = toMonthlyAmount(r.frequency as RecurringFrequency, r.amount);
    return r.type === "income" ? sum + monthly : sum - monthly;
  }, 0);

  const [showRecurring, setShowRecurring] = useState(dueCount > 0);

  // Seed IDB with fresh server data on mount / when server data updates
  useEffect(() => {
    if (!userId) return;
    void seedIDBFromServer(initialTransactions, userId);
  }, [initialTransactions, userId]);

  // Load pending (unsynced) transactions from IDB and merge into display.
  // Also keeps recently-synced IDB items visible (isPending: false) until
  // router.refresh() delivers the server-confirmed version, preventing a flash.
  useEffect(() => {
    if (!userId) return;
    getTransactionsByMonth(userId, month, year)
      .then((localTxs) => {
        const serverIdSet = new Set(transactions.map((t) => t.id));
        const pending = localTxs
          .filter((t) => {
            if (t.syncStatus === "pending-delete") return false;
            if (t.syncStatus === "synced") return !serverIdSet.has(t.id);
            return true;
          })
          .map((t): Transaction => ({
            id: t.id,
            category: t.category,
            amount: t.amount,
            type: t.type,
            note: t.note,
            labels: t.labels,
            date: t.date,
            isPending: t.syncStatus !== "synced",
          }));
        setPendingTransactions(pending);
      })
      .catch(() => {});
  }, [userId, month, year, pendingCount, transactions]);

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

  const dailySpend = useMemo(() => {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    return mergedTransactions
      .filter((t) => {
        if (t.type !== "expense") return false;
        const d = new Date(t.date);
        const dStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        return dStr === todayStr;
      })
      .reduce((s, t) => s + t.amount, 0);
  }, [mergedTransactions]);

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
      } else {
        setTotalExpenses((p) => p + tx.amount);

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

  const handleReplace = useCallback((tempId: string, realTx: Transaction) => {
    setTransactions((prev) =>
      prev.map((t) => (t.id === tempId ? { ...t, ...realTx } : t))
    );
    setPendingTransactions((prev) =>
      prev.map((t) => (t.id === tempId ? { ...t, ...realTx } : t))
    );
  }, []);

  const handleDelete = useCallback((id: string) => {
    const tx = transactions.find((t) => t.id === id) ?? pendingTransactions.find((t) => t.id === id);
    if (!tx) return;

    setTransactions((prev) => prev.filter((t) => t.id !== id));
    setPendingTransactions((prev) => prev.filter((t) => t.id !== id));
    void deleteTransactionFromIDB(id);

    if (tx.type === "income") {
      setTotalIncome((p) => p - tx.amount);
    } else {
      setTotalExpenses((p) => p - tx.amount);
      setCategoryData((prev) =>
        prev
          .map((c) =>
            c.name === tx.category
              ? { ...c, value: Math.round((c.value - tx.amount) * 100) / 100 }
              : c
          )
          .filter((c) => c.value > 0)
          .sort((a, b) => b.value - a.value)
      );
    }
  }, [transactions, pendingTransactions]);

  const handleUpdate = useCallback(
    (id: string, data: Partial<Transaction>) => {
      const old =
        transactions.find((t) => t.id === id) ??
        pendingTransactions.find((t) => t.id === id);
      if (!old) return;

      const newAmount   = data.amount   ?? old.amount;
      const newType     = data.type     ?? old.type;
      const newCategory = data.category ?? old.category;

      // Remove old contribution from totals, add new
      if (old.type === "income") {
        setTotalIncome((p) => p - old.amount);
      } else {
        setTotalExpenses((p) => p - old.amount);
      }
      if (newType === "income") {
        setTotalIncome((p) => p + newAmount);
      } else {
        setTotalExpenses((p) => p + newAmount);
      }

      setTransactions((prev) =>
        prev.map((t) => (t.id === id ? { ...t, ...data } : t))
      );
      setPendingTransactions((prev) =>
        prev.map((t) => (t.id === id ? { ...t, ...data } : t))
      );

      setCategoryData((prev) => {
        let updated = [...prev];

        // Remove old category contribution (expenses only)
        if (old.type === "expense") {
          updated = updated
            .map((c) =>
              c.name === old.category
                ? { ...c, value: Math.round((c.value - old.amount) * 100) / 100 }
                : c
            )
            .filter((c) => c.value > 0)
            .sort((a, b) => b.value - a.value);
        }

        // Add new category contribution (expenses only)
        if (newType === "expense") {
          const existing = updated.find((c) => c.name === newCategory);
          if (existing) {
            updated = updated
              .map((c) =>
                c.name === newCategory
                  ? { ...c, value: Math.round((c.value + newAmount) * 100) / 100 }
                  : c
              )
              .sort((a, b) => b.value - a.value);
          } else {
            updated = [
              ...updated,
              { name: newCategory, value: Math.round(newAmount * 100) / 100 },
            ].sort((a, b) => b.value - a.value);
          }
        }

        return updated;
      });
    },
    [transactions, pendingTransactions]
  );

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
        <ExpenseInput onAdd={handleAdd} onReplace={handleReplace} onRemove={handleDelete} recentCategories={recentCategories} />
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
      <div data-testid="recurring-section" className="card">
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
            <span className="text-xs text-slate-500">
              Fixed cash: <span className={cn("tabular-nums", fixedAvailableCash >= 0 ? "text-emerald-400" : "text-rose-400")}>{formatCurrency(fixedAvailableCash)}/mo</span>
            </span>
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
            <RecurringList
              initialRecurring={initialRecurring}
              onTransactionPosted={(tx) =>
                handleAdd({
                  ...tx,
                  type: tx.type as "income" | "expense",
                  note: tx.note ?? undefined,
                  labels: tx.labels ?? [],
                })
              }
            />
          </div>
        )}
      </div>

      {/* Summary stats */}
      <div data-testid="stat-cards" className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Income" amount={displayIncome} variant="income" icon="📈" momDelta={incomeDelta} />
        <StatCard label="Expenses" amount={displayExpenses} variant="expense" icon="📉" momDelta={expenseDelta} />
        <StatCard label="Net" amount={displayBalance} variant="balance" icon="⚖️" />
        <StatCard label="Daily Spend" amount={dailySpend} variant="expense" icon="📅" />
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

      {/* Budget overview */}
      {budgets.length > 0 && (
        <div data-testid="budget-overview" className="card space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-1 h-4 rounded-full bg-indigo-500 opacity-60" />
              <h3 className="text-sm font-semibold text-slate-200">Budget</h3>
            </div>
            <button
              onClick={() => setShowBudgetManager(true)}
              className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              Manage →
            </button>
          </div>
          <div className="space-y-3">
            {budgets.map((b) => {
              const spent =
                b.category === "_overall_"
                  ? displayExpenses
                  : (categoryData.find((c) => c.name === b.category)?.value ?? 0);
              return (
                <BudgetProgress
                  key={b.id}
                  category={b.category}
                  budget={b.amount}
                  spent={spent}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Set up budgets CTA — shown when no budgets exist */}
      {budgets.length === 0 && (
        <div className="card flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-300">No budgets set</p>
            <p className="text-xs text-slate-500">Track spending against monthly limits</p>
          </div>
          <button
            onClick={() => setShowBudgetManager(true)}
            className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors font-medium shrink-0 ml-4"
          >
            Set up →
          </button>
        </div>
      )}

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
          onUpdate={handleUpdate}
          compact
        />
      </div>

      {/* Budget manager modal */}
      {showBudgetManager && <BudgetManager onClose={() => setShowBudgetManager(false)} />}

      {/* Mobile bottom sheet for quick add */}
      <QuickAddSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        recentCategories={recentCategories}
        onAdd={handleAdd}
        onReplace={handleReplace}
        onRemove={handleDelete}
      />
    </div>
  );
}
