"use client";

import { Suspense, useCallback } from "react";
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
import type { Transaction, CategoryData, DailyData, RecurringTransaction, Budget, Period } from "@/types";

const BudgetManager = dynamic(
  () => import("@/components/budgets/BudgetManager").then((m) => ({ default: m.BudgetManager })),
  { ssr: false }
);

const TrendChart = dynamic(
  () => import("@/components/charts/TrendChart").then((m) => ({ default: m.TrendChart })),
  { ssr: false }
);

const MonthlyBarChart = dynamic(
  () => import("@/components/charts/MonthlyBarChart").then((m) => ({ default: m.MonthlyBarChart })),
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
  period: Period;
  month: number;
  year: number;
  rangeStartISO: string;
  rangeEndISO: string;
  deltaLabel: string;
  prevTotalExpenses: number;
  prevTotalIncome: number;
  prevCategoryData: CategoryData[];
}

export function DashboardContent(props: DashboardContentProps) {
  const {
    categoryData,
    dailyData,
    budgets,
    budgetSpending,
    showBudgetManager,
    setShowBudgetManager,
    sheetOpen,
    setSheetOpen,
    showRecurring,
    setShowRecurring,
    topCategory,
    dueCount,
    fixedAvailableCash,
    fixedMonthlyExpense,
    discretionarySpend,
    mergedTransactions,
    recentTransactions,
    recentCategories,
    displayIncome,
    displayExpenses,
    displayBalance,
    savingsRate,
    avgMonthlySpend,
    dailySpend,
    isCurrentMonth,
    isMonthView,
    expenseDelta,
    incomeDelta,
    handleAdd,
    handleReplace,
    handleDelete,
    handleUpdate,
  } = useDashboardState(props);

  const { period, month, year, deltaLabel } = props;

  // "42% saved" / "12% overspent" subtitle for the Net card.
  const savingsLabel =
    savingsRate == null
      ? undefined
      : savingsRate >= 0
      ? `${savingsRate.toFixed(0)}% saved`
      : `${Math.abs(savingsRate).toFixed(0)}% overspent`;

  const handleTransactionPosted = useCallback(
    (tx: { id: string; category: string; amount: number; type: string; note?: string | null; labels?: string[] | null; date: Date | string }) =>
      handleAdd({
        ...tx,
        type: tx.type as "income" | "expense",
        note: tx.note ?? undefined,
        labels: tx.labels ?? [],
      }),
    [handleAdd]
  );

  return (
    <div className="space-y-5">
      {/* Period selector */}
      <div className="flex items-center justify-between">
        <MonthSelector period={period} month={month} year={year} />
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

      {/* Quick input + recurring — month view only (adding/recurring are
          month-centric concepts) */}
      {isMonthView && (
        <>
          {/* Quick input — desktop only; mobile uses FAB below */}
          <div className="hidden md:block">
            <ExpenseInput onAdd={handleAdd} onReplace={handleReplace} onRemove={handleDelete} recentCategories={recentCategories} />
          </div>

          {/* Mobile FAB */}
          <button
            className="fab md:hidden"
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
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-1 h-4 rounded-full bg-indigo-500 opacity-60 shrink-0" />
            <span className="text-sm font-semibold text-slate-200 shrink-0">Recurring</span>
            {dueCount > 0 && (
              <span className="text-xs bg-amber-500/20 text-amber-400 border border-amber-500/30 px-1.5 py-0.5 rounded-full shrink-0">
                {dueCount} due
              </span>
            )}
            <span className="text-xs text-slate-500 hidden sm:inline">
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
                  onTransactionPosted={handleTransactionPosted}
                />
              </div>
            )}
          </div>
        </>
      )}

      {/* Summary stats */}
      <div data-testid="stat-cards" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Income" amount={displayIncome} variant="income" icon="📈" momDelta={incomeDelta} deltaLabel={deltaLabel} />
        <StatCard label="Expenses" amount={displayExpenses} variant="expense" icon="📉" momDelta={expenseDelta} deltaLabel={deltaLabel} />
        <StatCard label="Net" amount={displayBalance} variant="balance" icon="⚖️" subtitle={savingsLabel} />
        {isMonthView ? (
          <StatCard label={isCurrentMonth ? "Today's Spend" : "Daily Avg"} amount={dailySpend} variant="expense" icon="📅" />
        ) : (
          <StatCard label="Avg Spend / mo" amount={avgMonthlySpend} variant="expense" icon="📅" />
        )}
      </div>

      {/* Fixed vs discretionary spend — month view, only when recurring
          commitments exist (otherwise everything is discretionary). */}
      {isMonthView && fixedMonthlyExpense > 0 && (() => {
        const mixTotal = fixedMonthlyExpense + discretionarySpend;
        const fixedPct = mixTotal > 0 ? (fixedMonthlyExpense / mixTotal) * 100 : 0;
        return (
          <div data-testid="spending-mix" className="card space-y-2.5">
            <div className="flex items-center gap-2">
              <div className="w-1 h-4 rounded-full bg-indigo-500 opacity-60" />
              <h3 className="text-sm font-semibold text-slate-200">Spending mix</h3>
            </div>
            <div className="flex h-2.5 rounded-full overflow-hidden bg-slate-800">
              <div className="h-full bg-amber-500" style={{ width: `${fixedPct}%` }} />
              <div className="h-full bg-indigo-500" style={{ width: `${100 - fixedPct}%` }} />
            </div>
            <div className="flex justify-between text-xs">
              <span className="flex items-center gap-1.5 text-slate-400">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                Fixed
                <span className="text-slate-300 font-medium tabular-nums">{formatCurrency(fixedMonthlyExpense)}/mo</span>
              </span>
              <span className="flex items-center gap-1.5 text-slate-400">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
                Discretionary
                <span className="text-slate-300 font-medium tabular-nums">{formatCurrency(discretionarySpend)}</span>
              </span>
            </div>
          </div>
        );
      })()}

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <SpendingInsights
          categoryData={categoryData}
          prevCategoryData={props.prevCategoryData}
          month={month}
          year={year}
          monthView={isMonthView}
        />

        <div className="card">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1 h-4 rounded-full bg-indigo-500 opacity-60" />
            <h3 className="text-sm font-semibold text-slate-200">
              {isMonthView ? "Daily Trend" : "Monthly Trend"}
            </h3>
          </div>
          <Suspense fallback={<div className="h-[200px] rounded-xl bg-slate-800 animate-pulse" />}>
            <TrendChart
              data={dailyData}
              labelEvery={isMonthView ? undefined : 1}
              emptyMessage={isMonthView ? undefined : "No transactions in this period"}
              showCumulative
            />
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
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <span className="w-2.5 h-0.5 rounded-full bg-amber-500" />
              Balance
            </div>
          </div>
        </div>
      </div>

      {/* Income vs expense bars + monthly spend — wider (year / all-time) views */}
      {!isMonthView && (
        <div className="card">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1 h-4 rounded-full bg-indigo-500 opacity-60" />
            <h3 className="text-sm font-semibold text-slate-200">Income vs Expenses by Month</h3>
          </div>
          <Suspense fallback={<div className="h-[200px] rounded-xl bg-slate-800 animate-pulse" />}>
            <MonthlyBarChart data={dailyData} emptyMessage="No transactions in this period" />
          </Suspense>
        </div>
      )}

      {/* Budget overview — month view only (budgets are monthly limits) */}
      {isMonthView && budgets.length > 0 && (
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
              const spent = budgetSpending.find((s) => s.id === b.id)?.spent ?? 0;
              return (
                <BudgetProgress
                  key={b.id}
                  budget={b}
                  spent={spent}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Set up budgets CTA */}
      {isMonthView && budgets.length === 0 && (
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
            <p className="text-sm text-slate-400">
              {isMonthView ? "No transactions yet." : "No transactions in this period."}
            </p>
            {isMonthView && (
              <p className="text-xs text-slate-500 mt-1">Use the input above to add your first one.</p>
            )}
          </div>
        ) : (
          <TransactionList
            transactions={recentTransactions}
            onDelete={handleDelete}
            onUpdate={handleUpdate}
            compact
            budgets={budgets.map((b) => ({ id: b.id, name: b.name }))}
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
