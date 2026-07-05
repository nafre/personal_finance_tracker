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
import { DashboardErrorBoundary } from "@/components/DashboardErrorBoundary";
import { StatCard } from "@/components/StatCard";
import { BudgetProgress } from "@/components/budgets/BudgetProgress";
import { useDashboardState } from "@/hooks/useDashboardState";
import { formatCurrency, cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Scale, CalendarDays } from "lucide-react";
import type { Transaction, CategoryData, DailyData, RecurringTransaction, Budget, CategoryOption, Period } from "@/types";

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

const chartCardSkeleton = () => <div className="card h-[280px] animate-pulse" />;

const PaceChart = dynamic(
  () => import("@/components/charts/PaceChart").then((m) => ({ default: m.PaceChart })),
  { ssr: false, loading: chartCardSkeleton }
);

const SpendingPieChart = dynamic(
  () => import("@/components/charts/SpendingPieChart").then((m) => ({ default: m.SpendingPieChart })),
  { ssr: false, loading: chartCardSkeleton }
);

const WealthCurve = dynamic(
  () => import("@/components/charts/WealthCurve").then((m) => ({ default: m.WealthCurve })),
  { ssr: false, loading: () => <div className="card h-[320px] animate-pulse" /> }
);

const DayOfWeekChart = dynamic(
  () => import("@/components/charts/DayOfWeekChart").then((m) => ({ default: m.DayOfWeekChart })),
  { ssr: false }
);

interface DashboardContentProps {
  initialTransactions: Transaction[];
  initialTotalIncome: number;
  initialTotalExpenses: number;
  initialCategoryData: CategoryData[];
  initialDailyData: DailyData[];
  /** Ledger-basis monthly buckets (year + all-time views; empty in month view).
      Feeds WealthCurve (all-time) and the off-chart overlay on MonthlyBarChart. */
  initialWealthData: DailyData[];
  initialTopCategory: CategoryData | null;
  initialRecurring: RecurringTransaction[];
  initialBudgets: Budget[];
  initialCategories: CategoryOption[];
  period: Period;
  month: number;
  year: number;
  rangeStartISO: string;
  rangeEndISO: string;
  deltaLabel: string;
  prevTotalExpenses: number;
  prevTotalIncome: number;
  prevCategoryData: CategoryData[];
  prevDailyData: DailyData[];
}

export function DashboardContent(props: DashboardContentProps) {
  const {
    categoryData,
    dailyData,
    budgets,
    budgetSpending,
    budgetOptions,
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
    dueWeekCount,
    dueWeekExpense,
    dueWeekIncome,
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

  // Past months are review-only: adding is hidden (quick-add always dates to
  // *today*, so it can never land in the viewed month), today-anchored widgets
  // (due-week, recurring) disappear, and edit/delete actions are removed.
  // Deliberate corrections to historical data go through /transactions.
  const readOnlyMonth = isMonthView && !isCurrentMonth;

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
      <div className="flex flex-wrap items-center justify-between gap-y-2">
        <div className="flex items-center gap-3 flex-wrap">
          <MonthSelector period={period} month={month} year={year} />
          {readOnlyMonth && (
            <span
              data-testid="view-only-badge"
              className="text-[11px] font-medium text-slate-500 border border-slate-700 rounded-full px-2 py-0.5 whitespace-nowrap"
            >
              Past month · view only
            </span>
          )}
        </div>
        {topCategory && (
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <span>Top spend:</span>
            <span className="text-slate-200 font-medium">{topCategory.name}</span>
            <span className="text-rose-400 font-semibold tabular-nums">
              {formatCurrency(topCategory.value)}
            </span>
          </div>
        )}
      </div>

      {/* Offline / syncing status */}
      <SyncStatusBar />

      {/* Quick input + recurring — current month only. Adding always dates to
          today, and due-week/recurring status is anchored to *now*, so none of
          these belong on a past-month (or year/all-time) view. */}
      {isCurrentMonth && (
        <>
          {/* Quick input — desktop only; mobile uses FAB below */}
          <div className="hidden md:block">
            <DashboardErrorBoundary section="Quick add">
              <ExpenseInput
                onAdd={handleAdd}
                onReplace={handleReplace}
                onRemove={handleDelete}
                recentCategories={recentCategories}
                categories={props.initialCategories}
              />
            </DashboardErrorBoundary>
          </div>

          {/* Mobile FAB */}
          <button
            className="fab md:hidden"
            onClick={() => setSheetOpen(true)}
            aria-label="Add expense"
          >
            +
          </button>

          {/* Due this week — 7-day look-ahead over the recurring rules
              (overdue included). Leads into the recurring card below it. */}
          {dueWeekCount > 0 && (
            <div data-testid="due-week-card" className="card flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
                <div className="w-1 h-4 rounded-full bg-amber-500 opacity-60 shrink-0" />
                <span className="text-sm font-semibold text-slate-200 shrink-0">Due this week</span>
                <span className="text-xs text-slate-500 shrink-0">
                  {dueWeekCount} item{dueWeekCount !== 1 ? "s" : ""}
                </span>
                {dueWeekExpense > 0 && (
                  <span className="text-xs font-medium text-rose-400 tabular-nums shrink-0">
                    −{formatCurrency(dueWeekExpense)}
                  </span>
                )}
                {dueWeekIncome > 0 && (
                  <span className="text-xs font-medium text-emerald-400 tabular-nums shrink-0">
                    +{formatCurrency(dueWeekIncome)}
                  </span>
                )}
              </div>
              <button
                onClick={() => setShowRecurring(true)}
                className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors shrink-0"
              >
                Review →
              </button>
            </div>
          )}

          {/* Recurring transactions */}
          <DashboardErrorBoundary section="Recurring transactions">
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
          </DashboardErrorBoundary>
        </>
      )}

      {/* Summary stats — the stat cards, charts row, and recent transactions
          stagger in on first mount (fill-mode backwards hides delayed items
          until their turn); month navigation only swaps props, so it never
          replays the entrance. */}
      <div data-testid="stat-cards" className="grid grid-cols-2 gap-3 lg:grid-cols-4 animate-slide-up [animation-fill-mode:backwards]">
        <StatCard label="Income" amount={displayIncome} variant="income" icon={<TrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4" />} momDelta={incomeDelta} deltaLabel={deltaLabel} />
        <StatCard label="Expenses" amount={displayExpenses} variant="expense" icon={<TrendingDown className="w-3.5 h-3.5 sm:w-4 sm:h-4" />} momDelta={expenseDelta} deltaLabel={deltaLabel} />
        <StatCard label="Net" amount={displayBalance} variant="balance" icon={<Scale className="w-3.5 h-3.5 sm:w-4 sm:h-4" />} subtitle={savingsLabel} />
        {isMonthView ? (
          <StatCard label={isCurrentMonth ? "Today's Spend" : "Daily Avg"} amount={dailySpend} variant="expense" icon={<CalendarDays className="w-3.5 h-3.5 sm:w-4 sm:h-4" />} />
        ) : (
          <StatCard label="Avg Spend / mo" amount={avgMonthlySpend} variant="expense" icon={<CalendarDays className="w-3.5 h-3.5 sm:w-4 sm:h-4" />} />
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

      {/* Wealth curve — all-time hero: running net balance since day one.
          Ledger basis: off-chart transactions still count, since real money moved. */}
      {period === "all" && (
        <DashboardErrorBoundary section="Wealth curve">
          <WealthCurve data={props.initialWealthData} />
        </DashboardErrorBoundary>
      )}

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 animate-slide-up [animation-delay:50ms] [animation-fill-mode:backwards]">
        <DashboardErrorBoundary section="Spending insights">
          <SpendingInsights
            categoryData={categoryData}
            prevCategoryData={props.prevCategoryData}
            month={month}
            year={year}
            monthView={isMonthView}
          />
        </DashboardErrorBoundary>

        <DashboardErrorBoundary section="Trend chart">
        <div className="card">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1 h-4 rounded-full bg-indigo-500 opacity-60" />
            <h3 className="text-sm font-semibold text-slate-200">
              {isMonthView ? "Daily Trend" : "Monthly Trend"}
            </h3>
          </div>
          <Suspense fallback={<div className="h-[200px] rounded-xl bg-slate-800 animate-pulse" />}>
            {/* Wrapper commits with the resolved chunk, so the chart fades in
                over the skeleton instead of popping */}
            <div className="animate-fade-in">
              <TrendChart
                data={dailyData}
                labelEvery={isMonthView ? undefined : 1}
                emptyMessage={isMonthView ? undefined : "No transactions in this period"}
                showCumulative={!isMonthView}
              />
            </div>
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
            {!isMonthView && (
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <span className="w-2.5 h-0.5 rounded-full bg-amber-500" />
                Balance
              </div>
            )}
          </div>
        </div>
        </DashboardErrorBoundary>
      </div>

      {/* Pace + category donut — month view only (pace lines and the monthly
          budget are month-centric; the donut complements the insights bars).
          The pace line targets the month's spending cap: an "overall" budget
          when one exists, else an "excluded"-type budget (overall minus a few
          categories — the closest thing to a monthly cap). Label/category
          budgets are never month-wide caps. */}
      {isMonthView && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <DashboardErrorBoundary section="Spending pace">
            <PaceChart
              dailyData={dailyData}
              prevDailyData={props.prevDailyData}
              budgetAmount={
                (budgets.find((b) => b.budgetType === "overall") ??
                  budgets.find((b) => b.budgetType === "excluded"))?.amount ?? null
              }
              month={month}
              year={year}
            />
          </DashboardErrorBoundary>
          <DashboardErrorBoundary section="Category breakdown">
            <SpendingPieChart
              categoryData={categoryData}
              categories={props.initialCategories}
              month={month}
              year={year}
            />
          </DashboardErrorBoundary>
        </div>
      )}

      {/* Income vs expense bars + monthly spend — wider (year / all-time) views */}
      {!isMonthView && (
        <DashboardErrorBoundary section="Monthly chart">
          <div className="card">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1 h-4 rounded-full bg-indigo-500 opacity-60" />
              <h3 className="text-sm font-semibold text-slate-200">Income vs Expenses by Month</h3>
            </div>
            <Suspense fallback={<div className="h-[200px] rounded-xl bg-slate-800 animate-pulse" />}>
              <div className="animate-fade-in">
                <MonthlyBarChart
                  data={dailyData}
                  wealthData={props.initialWealthData}
                  emptyMessage="No transactions in this period"
                />
              </div>
            </Suspense>
          </div>
        </DashboardErrorBoundary>
      )}

      {/* Day-of-week spending profile — wider views only (a single month's
          sample is too small to read habits from). Snapshot note: the bars
          shift as each new weekday elapses (denominator grows), so e2e masks
          the whole card in the year/all-time full-page tests. */}
      {!isMonthView && (
        <DashboardErrorBoundary section="Day-of-week profile">
          <div data-testid="dow-chart" className="card">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1 h-4 rounded-full bg-indigo-500 opacity-60" />
              <h3 className="text-sm font-semibold text-slate-200">Avg Spend by Day of Week</h3>
            </div>
            <Suspense fallback={<div className="h-[180px] rounded-xl bg-slate-800 animate-pulse" />}>
              <div className="animate-fade-in">
                <DayOfWeekChart
                  transactions={mergedTransactions}
                  rangeStartISO={props.rangeStartISO}
                  rangeEndISO={props.rangeEndISO}
                />
              </div>
            </Suspense>
          </div>
        </DashboardErrorBoundary>
      )}

      {/* Budget overview — month view only (budgets are monthly limits) */}
      {isMonthView && budgets.length > 0 && (
        <DashboardErrorBoundary section="Budgets">
        <div data-testid="budget-overview" className="card space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-1 h-4 rounded-full bg-indigo-500 opacity-60" />
              <h3 className="text-sm font-semibold text-slate-200">Budget</h3>
            </div>
            {/* Budgets are global monthly limits — editing them from a past
                month would retroactively change that month's view, so the
                entry point only exists on the current month. */}
            {isCurrentMonth && (
              <button
                onClick={() => setShowBudgetManager(true)}
                className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                Manage →
              </button>
            )}
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
        </DashboardErrorBoundary>
      )}

      {/* Set up budgets CTA — current month only (see Manage note above) */}
      {isCurrentMonth && budgets.length === 0 && (
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
      <DashboardErrorBoundary section="Recent transactions">
      <div className="card animate-slide-up [animation-delay:100ms] [animation-fill-mode:backwards]">
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
              {isCurrentMonth ? "No transactions yet." : "No transactions in this period."}
            </p>
            {isCurrentMonth && (
              <p className="text-xs text-slate-500 mt-1">Use the input above to add your first one.</p>
            )}
          </div>
        ) : (
          <TransactionList
            transactions={recentTransactions}
            onDelete={handleDelete}
            onUpdate={handleUpdate}
            onRestore={handleTransactionPosted}
            compact
            budgets={budgetOptions}
            readOnly={readOnlyMonth}
          />
        )}
      </div>
      </DashboardErrorBoundary>

      {/* Budget manager modal */}
      {showBudgetManager && <BudgetManager onClose={() => setShowBudgetManager(false)} />}

      {/* Mobile bottom sheet for quick add — current month only, like the FAB */}
      {isCurrentMonth && (
      <QuickAddSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        recentCategories={recentCategories}
        categories={props.initialCategories}
        onAdd={handleAdd}
        onReplace={handleReplace}
        onRemove={handleDelete}
      />
      )}
    </div>
  );
}
