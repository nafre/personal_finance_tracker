"use client";

import { Suspense } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ExpenseInput } from "@/components/ExpenseInput";
import { TransactionList } from "@/components/TransactionList";
import { SpendingInsights } from "@/components/SpendingInsights";
import { QuickAddSheet } from "@/components/QuickAddSheet";
import { MonthSelector } from "@/components/MonthSelector";
import { RecurringList } from "@/components/recurring/RecurringList";
import { SyncStatusBar } from "@/components/SyncStatusBar";
import { StatCard } from "@/components/StatCard";
import { BudgetProgress } from "@/components/budgets/BudgetProgress";
import { useDashboardState } from "@/hooks/useDashboardState";
import { formatCurrency, cn } from "@/lib/utils";
import type { Transaction, CategoryData, DailyData, RecurringTransaction, Budget } from "@/types";

const BudgetManager = dynamic(
  () => import("@/components/budgets/BudgetManager").then((m) => ({ default: m.BudgetManager })),
  { ssr: false }
);

const TrendChart = dynamic(
  () => import("@/components/charts/TrendChart").then((m) => ({ default: m.TrendChart })),
  { ssr: false }
);

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

export function DashboardContent(props: DashboardContentProps) {
  const {
    categoryData,
    dailyData,
    budgets,
    showBudgetManager,
    setShowBudgetManager,
    sheetOpen,
    setSheetOpen,
    showRecurring,
    setShowRecurring,
    topCategory,
    dueCount,
    fixedAvailableCash,
    mergedTransactions,
    recentTransactions,
    recentCategories,
    displayIncome,
    displayExpenses,
    displayBalance,
    dailySpend,
    isCurrentMonth,
    expenseDelta,
    incomeDelta,
    handleAdd,
    handleReplace,
    handleDelete,
    handleUpdate,
  } = useDashboardState(props);

  const { month, year } = props;

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
        className="fab md:hidden right-6"
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
              initialRecurring={props.initialRecurring}
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
        <StatCard label={isCurrentMonth ? "Today's Spend" : "Daily Avg"} amount={dailySpend} variant="expense" icon="📅" />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <SpendingInsights
          categoryData={categoryData}
          prevCategoryData={props.prevCategoryData}
          totalExpenses={displayExpenses}
          month={month}
          year={year}
        />

        <div className="card">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1 h-4 rounded-full bg-indigo-500 opacity-60" />
            <h3 className="text-sm font-semibold text-slate-200">Daily Trend</h3>
          </div>
          <Suspense fallback={<div className="h-[200px] rounded-xl bg-slate-800 animate-pulse" />}>
            <TrendChart data={dailyData} />
          </Suspense>
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

      {/* Set up budgets CTA */}
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
          <Link
            href="/transactions"
            className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            View all →
          </Link>
        </div>
        {mergedTransactions.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-sm text-slate-400">No transactions yet.</p>
            <p className="text-xs text-slate-500 mt-1">Use the input above to add your first one.</p>
          </div>
        ) : (
          <TransactionList
            transactions={recentTransactions}
            onDelete={handleDelete}
            onUpdate={handleUpdate}
            compact
          />
        )}
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
