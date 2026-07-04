"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useSyncContext } from "@/context/SyncProvider";
import { seedIDBFromServer, getTransactionsInRange, deleteTransactionFromIDB } from "@/lib/idb";
import { getNextDueDate, getRecurringStatus, toMonthlyAmount, type RecurringFrequency } from "@/lib/utils";
import type { Transaction, CategoryData, DailyData, RecurringTransaction, Budget, Period } from "@/types";

// Per-transaction budget spend so an individual transaction can be excluded
// from a specific budget via its `excludedBudgetIds`. Iterating the full month
// list keeps the totals identical to the old aggregate math for any
// transaction that isn't excluded.
function computeBudgetSpent(
  budget: Budget,
  mergedTransactions: Transaction[]
): number {
  return mergedTransactions
    .filter((t) => {
      if (t.type !== "expense") return false;
      if (t.excludedBudgetIds?.includes(budget.id)) return false;
      switch (budget.budgetType) {
        case "overall":
          return true;
        case "category":
          return t.category === budget.category;
        case "excluded":
          return !budget.excludedCategories.includes(t.category);
        case "label":
          return budget.labels.some((l) => t.labels?.includes(l));
        default:
          return false;
      }
    })
    .reduce((sum, t) => sum + t.amount, 0);
}

interface UseDashboardStateProps {
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
  prevTotalExpenses: number;
  prevTotalIncome: number;
  prevCategoryData: CategoryData[];
}

export function useDashboardState({
  initialTransactions,
  initialTotalIncome,
  initialTotalExpenses,
  initialCategoryData,
  initialDailyData,
  initialRecurring,
  initialBudgets,
  period,
  month,
  year,
  rangeStartISO,
  rangeEndISO,
  prevTotalExpenses,
  prevTotalIncome,
}: UseDashboardStateProps) {
  const { userId, pendingCount, reconcileCount } = useSyncContext();

  const isMonthView = period === "month";
  const rangeStartMs = useMemo(() => new Date(rangeStartISO).getTime(), [rangeStartISO]);
  const rangeEndMs = useMemo(() => new Date(rangeEndISO).getTime(), [rangeEndISO]);

  const [transactions, setTransactions] = useState<Transaction[]>(initialTransactions);
  const [totalIncome, setTotalIncome] = useState(initialTotalIncome);
  const [totalExpenses, setTotalExpenses] = useState(initialTotalExpenses);
  const [categoryData, setCategoryData] = useState<CategoryData[]>(initialCategoryData);
  const [dailyData, setDailyData] = useState<DailyData[]>(initialDailyData);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [pendingTransactions, setPendingTransactions] = useState<Transaction[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>(initialBudgets);

  // Re-sync all server-derived slices in one effect — the setters are batched,
  // so a server refresh triggers a single re-render instead of one per slice.
  useEffect(() => {
    setTransactions(initialTransactions);
    setTotalIncome(initialTotalIncome);
    setTotalExpenses(initialTotalExpenses);
    setCategoryData(initialCategoryData);
    setDailyData(initialDailyData);
    setBudgets(initialBudgets);
  }, [
    initialTransactions,
    initialTotalIncome,
    initialTotalExpenses,
    initialCategoryData,
    initialDailyData,
    initialBudgets,
  ]);
  const [showBudgetManager, setShowBudgetManager] = useState(false);

  // Derived from categoryData so it stays current after mutations
  const topCategory = useMemo(() => categoryData[0] ?? null, [categoryData]);

  // One pass over the recurring rules (due-date + status computed once per
  // rule) yields all three aggregates:
  // - dueCount: rules currently due or overdue.
  // - fixedAvailableCash: net monthly-normalized cash flow of active rules.
  // - fixedMonthlyExpense: monthly-normalized sum of active recurring
  //   *expense* commitments — the "fixed" half of the fixed-vs-discretionary
  //   split (month view only).
  const { dueCount, fixedAvailableCash, fixedMonthlyExpense } = useMemo(() => {
    let dueCount = 0;
    let fixedAvailableCash = 0;
    let fixedMonthlyExpense = 0;
    for (const r of initialRecurring) {
      const nextDue = getNextDueDate(
        r.frequency as RecurringFrequency,
        new Date(r.startDate),
        r.lastRun ? new Date(r.lastRun) : null
      );
      const status = getRecurringStatus(nextDue, r.endDate ? new Date(r.endDate) : null);
      if (status === "due" || status === "overdue") dueCount++;
      if (status === "ended") continue;
      const monthly = toMonthlyAmount(r.frequency as RecurringFrequency, r.amount);
      fixedAvailableCash += r.type === "income" ? monthly : -monthly;
      if (r.type === "expense") fixedMonthlyExpense += monthly;
    }
    return { dueCount, fixedAvailableCash, fixedMonthlyExpense };
  }, [initialRecurring]);

  const [showRecurring, setShowRecurring] = useState(dueCount > 0);

  // Seed IDB with fresh server data on mount / when server data updates
  useEffect(() => {
    if (!userId) return;
    void seedIDBFromServer(initialTransactions, userId);
  }, [initialTransactions, userId]);

  // Keep a ref to the current server ID set so the pending-load effect doesn't
  // need `transactions` as a dependency (avoids a double-IDB-read per mutation).
  const serverIdsRef = useRef(new Set(transactions.map((t) => t.id)));
  useEffect(() => {
    serverIdsRef.current = new Set(transactions.map((t) => t.id));
  }, [transactions]);

  // Load pending (unsynced) transactions from IDB and merge into display.
  // Also keeps recently-synced IDB items visible (isPending: false) until
  // router.refresh() delivers the server-confirmed version, preventing a flash.
  useEffect(() => {
    if (!userId) return;
    getTransactionsInRange(userId, rangeStartISO, rangeEndISO)
      .then((localTxs) => {
        const serverIdSet = serverIdsRef.current;
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
            excludedBudgetIds: t.excludedBudgetIds,
            date: t.date,
            isPending: t.syncStatus !== "synced",
          }));
        setPendingTransactions(pending);
      })
      .catch(() => {});
    // reconcileCount: re-read after a reconcile purges stale IDB records, so
    // ghosts captured into state before it finished are dropped.
  }, [userId, rangeStartISO, rangeEndISO, pendingCount, reconcileCount]);

  // Merged list: pending items deduped against server list, sorted newest-first
  const mergedTransactions = useMemo(() => {
    const serverIds = new Set(transactions.map((t) => t.id));
    const dedupedPending = pendingTransactions.filter((p) => !serverIds.has(p.id));
    return [...dedupedPending, ...transactions].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
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

  // Savings rate: share of income kept (net / income). Null when no income.
  const savingsRate = displayIncome > 0 ? (displayBalance / displayIncome) * 100 : null;

  // Chart-basis expense total: dailyData is already excludeFromStats-filtered
  // (server-side + optimistic patches), so summing it drops off-chart rows.
  // Pattern stats (Daily Avg, Avg Spend/mo, spending mix) use this basis so a
  // flagged one-off purchase doesn't drown the "typical spending" signal; the
  // ledger totals (stat cards, savings rate) still include everything.
  const chartExpenses = useMemo(
    () => dailyData.reduce((sum, d) => sum + d.expense, 0),
    [dailyData]
  );

  // Average spend per active month — only meaningful in the wider (year /
  // all-time) views, where dailyData holds one bucket per month.
  const avgMonthlySpend = useMemo(() => {
    if (isMonthView) return 0;
    const activeMonths = dailyData.filter((d) => d.expense > 0).length;
    return activeMonths > 0 ? chartExpenses / activeMonths : 0;
  }, [isMonthView, dailyData, chartExpenses]);

  // Fixed (recurring) vs discretionary spend for the month. Discretionary is
  // whatever's left over once the fixed commitments are covered.
  const discretionarySpend = Math.max(0, chartExpenses - fixedMonthlyExpense);

  const { isCurrentMonth, dailySpend } = useMemo(() => {
    // The "Today's spend / daily avg" card is month-only; skip the computation
    // entirely in the year / all-time views (the card is hidden there).
    if (!isMonthView) return { isCurrentMonth: false, dailySpend: 0 };
    const today = new Date();
    const isCurrent = month === today.getMonth() + 1 && year === today.getFullYear();
    if (isCurrent) {
      const todayStr = today.toISOString().split("T")[0];
      const spend = mergedTransactions
        .filter((t) => {
          if (t.type !== "expense") return false;
          return new Date(t.date).toISOString().split("T")[0] === todayStr;
        })
        .reduce((s, t) => s + t.amount, 0);
      return { isCurrentMonth: true, dailySpend: spend };
    }
    // Past months show a Daily Avg — a pattern stat, so chart basis: off-chart
    // one-offs would otherwise skew the "typical day" figure.
    const daysInMonth = new Date(year, month, 0).getDate();
    return {
      isCurrentMonth: false,
      dailySpend: daysInMonth > 0 ? chartExpenses / daysInMonth : 0,
    };
  }, [isMonthView, mergedTransactions, month, year, chartExpenses]);

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

  const recentTransactions = useMemo(() => mergedTransactions.slice(0, 6), [mergedTransactions]);

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
      excludeFromStats?: boolean;
    }) => {
      const txDate = new Date(tx.date);
      const txMs = txDate.getTime();
      if (txMs < rangeStartMs || txMs > rangeEndMs) return;

      setTransactions((prev) => [tx, ...prev]);

      // Totals always count; charts (categoryData/dailyData) skip excluded txns.
      if (tx.type === "income") {
        setTotalIncome((p) => p + tx.amount);
      } else {
        setTotalExpenses((p) => p + tx.amount);
        if (!tx.excludeFromStats) {
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
      }

      // Trend buckets are keyed by day-of-month only in the month view; in the
      // year/all-time views the chart is rebuilt from the server, so skip here.
      if (isMonthView && !tx.excludeFromStats) {
        const txDay = txDate.getDate();
        const field = tx.type === "income" ? "income" : "expense";
        setDailyData((prev) =>
          prev.map((d) =>
            d.day === txDay
              ? { ...d, [field]: Math.round((d[field] + tx.amount) * 100) / 100 }
              : d
          )
        );
      }
    },
    [isMonthView, rangeStartMs, rangeEndMs]
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
    const tx =
      transactions.find((t) => t.id === id) ??
      pendingTransactions.find((t) => t.id === id);
    if (!tx) return;

    setTransactions((prev) => prev.filter((t) => t.id !== id));
    setPendingTransactions((prev) => prev.filter((t) => t.id !== id));
    void deleteTransactionFromIDB(id);

    // Totals always count; charts only changed if the txn was included in them.
    if (tx.type === "income") {
      setTotalIncome((p) => p - tx.amount);
    } else {
      setTotalExpenses((p) => p - tx.amount);
      if (!tx.excludeFromStats) {
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
    }

    if (isMonthView && !tx.excludeFromStats) {
      const delDay = new Date(tx.date).getDate();
      const delField = tx.type === "income" ? "income" : "expense";
      setDailyData((prev) =>
        prev.map((d) =>
          d.day === delDay
            ? { ...d, [delField]: Math.round(Math.max(0, d[delField] - tx.amount) * 100) / 100 }
            : d
        )
      );
    }
  }, [isMonthView, transactions, pendingTransactions]);

  const handleUpdate = useCallback(
    (id: string, data: Partial<Transaction>) => {
      const old =
        transactions.find((t) => t.id === id) ??
        pendingTransactions.find((t) => t.id === id);
      if (!old) return;

      const newAmount   = data.amount   ?? old.amount;
      const newType     = data.type     ?? old.type;
      const newCategory = data.category ?? old.category;
      // Whether the txn is excluded from charts before/after this update. Totals
      // always reflect the change; chart slices only when (un)excluded.
      const oldExcluded = old.excludeFromStats ?? false;
      const newExcluded = data.excludeFromStats ?? oldExcluded;

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
        if (old.type === "expense" && !oldExcluded) {
          updated = updated
            .map((c) =>
              c.name === old.category
                ? { ...c, value: Math.round((c.value - old.amount) * 100) / 100 }
                : c
            )
            .filter((c) => c.value > 0)
            .sort((a, b) => b.value - a.value);
        }
        if (newType === "expense" && !newExcluded) {
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

      const oldDay = new Date(old.date).getDate();
      const newDay = new Date(data.date ? data.date : old.date).getDate();
      const newTxAmount = data.amount ?? old.amount;
      const newTxType   = data.type   ?? old.type;
      // Day-keyed trend patch only applies to the month view.
      if (isMonthView) setDailyData((prev) => {
        let updated = [...prev];
        if (!oldExcluded) {
          const oldField = old.type === "income" ? "income" : "expense";
          updated = updated.map((d) =>
            d.day === oldDay
              ? { ...d, [oldField]: Math.round(Math.max(0, d[oldField] - old.amount) * 100) / 100 }
              : d
          );
        }
        if (!newExcluded) {
          const newField = newTxType === "income" ? "income" : "expense";
          updated = updated.map((d) =>
            d.day === newDay
              ? { ...d, [newField]: Math.round((d[newField] + newTxAmount) * 100) / 100 }
              : d
          );
        }
        return updated;
      });
    },
    [isMonthView, transactions, pendingTransactions]
  );

  const budgetSpending = useMemo(
    () =>
      budgets.map((b) => ({
        id: b.id,
        spent: computeBudgetSpent(b, mergedTransactions),
      })),
    [budgets, mergedTransactions]
  );

  // Stable id/name list for TransactionList's BudgetExcludeSelect — keeps the
  // memoized rows from re-rendering on unrelated dashboard state changes.
  const budgetOptions = useMemo(
    () => budgets.map((b) => ({ id: b.id, name: b.name })),
    [budgets]
  );

  return {
    // State
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
    // Derived values
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
    // Handlers
    handleAdd,
    handleReplace,
    handleDelete,
    handleUpdate,
  };
}
