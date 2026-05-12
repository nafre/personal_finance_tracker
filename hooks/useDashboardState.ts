"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { useSyncContext } from "@/context/SyncProvider";
import { seedIDBFromServer, getTransactionsByMonth, deleteTransactionFromIDB } from "@/lib/idb";
import { getNextDueDate, getRecurringStatus, toMonthlyAmount, type RecurringFrequency } from "@/lib/utils";
import type { Transaction, CategoryData, DailyData, RecurringTransaction, Budget } from "@/types";

interface UseDashboardStateProps {
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

export function useDashboardState({
  initialTransactions,
  initialTotalIncome,
  initialTotalExpenses,
  initialCategoryData,
  initialDailyData,
  initialRecurring,
  initialBudgets,
  month,
  year,
  prevTotalExpenses,
  prevTotalIncome,
}: UseDashboardStateProps) {
  const { userId, pendingCount } = useSyncContext();

  const [transactions, setTransactions] = useState<Transaction[]>(initialTransactions);
  const [totalIncome, setTotalIncome] = useState(initialTotalIncome);
  const [totalExpenses, setTotalExpenses] = useState(initialTotalExpenses);
  const [categoryData, setCategoryData] = useState<CategoryData[]>(initialCategoryData);
  const [dailyData, setDailyData] = useState<DailyData[]>(initialDailyData);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [pendingTransactions, setPendingTransactions] = useState<Transaction[]>([]);
  const [budgets] = useState<Budget[]>(initialBudgets);
  const [showBudgetManager, setShowBudgetManager] = useState(false);

  // Derived from categoryData so it stays current after mutations
  const topCategory = useMemo(() => categoryData[0] ?? null, [categoryData]);

  const dueCount = useMemo(() => initialRecurring.filter((r) => {
    const nextDue = getNextDueDate(
      r.frequency as RecurringFrequency,
      new Date(r.startDate),
      r.lastRun ? new Date(r.lastRun) : null
    );
    const status = getRecurringStatus(nextDue, r.endDate ? new Date(r.endDate) : null);
    return status === "due" || status === "overdue";
  }).length, [initialRecurring]);

  const fixedAvailableCash = useMemo(() => initialRecurring.reduce((sum, r) => {
    const nextDue = getNextDueDate(
      r.frequency as RecurringFrequency,
      new Date(r.startDate),
      r.lastRun ? new Date(r.lastRun) : null
    );
    if (getRecurringStatus(nextDue, r.endDate ? new Date(r.endDate) : null) === "ended") return sum;
    const monthly = toMonthlyAmount(r.frequency as RecurringFrequency, r.amount);
    return r.type === "income" ? sum + monthly : sum - monthly;
  }, 0), [initialRecurring]);

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

  const { isCurrentMonth, dailySpend } = useMemo(() => {
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
    const daysInMonth = new Date(year, month, 0).getDate();
    return {
      isCurrentMonth: false,
      dailySpend: daysInMonth > 0 ? displayExpenses / daysInMonth : 0,
    };
  }, [mergedTransactions, month, year, displayExpenses]);

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

  const recentTransactions = mergedTransactions.slice(0, 6);

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
      const txDate = new Date(tx.date);
      if (txDate.getMonth() + 1 !== month || txDate.getFullYear() !== year) return;

      setTransactions((prev) => [tx, ...prev]);

      if (tx.type === "income") {
        setTotalIncome((p) => p + tx.amount);
      } else {
        setTotalExpenses((p) => p + tx.amount);
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

      const txDay = txDate.getDate();
      const field = tx.type === "income" ? "income" : "expense";
      setDailyData((prev) =>
        prev.map((d) =>
          d.day === txDay
            ? { ...d, [field]: Math.round((d[field] + tx.amount) * 100) / 100 }
            : d
        )
      );
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
    const tx =
      transactions.find((t) => t.id === id) ??
      pendingTransactions.find((t) => t.id === id);
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

    const delDay = new Date(tx.date).getDate();
    const delField = tx.type === "income" ? "income" : "expense";
    setDailyData((prev) =>
      prev.map((d) =>
        d.day === delDay
          ? { ...d, [delField]: Math.round(Math.max(0, d[delField] - tx.amount) * 100) / 100 }
          : d
      )
    );
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

      const oldDay = new Date(old.date).getDate();
      const newDay = new Date(data.date ? data.date : old.date).getDate();
      const newTxAmount = data.amount ?? old.amount;
      const newTxType   = data.type   ?? old.type;
      setDailyData((prev) => {
        let updated = [...prev];
        const oldField = old.type === "income" ? "income" : "expense";
        updated = updated.map((d) =>
          d.day === oldDay
            ? { ...d, [oldField]: Math.round(Math.max(0, d[oldField] - old.amount) * 100) / 100 }
            : d
        );
        const newField = newTxType === "income" ? "income" : "expense";
        updated = updated.map((d) =>
          d.day === newDay
            ? { ...d, [newField]: Math.round((d[newField] + newTxAmount) * 100) / 100 }
            : d
        );
        return updated;
      });
    },
    [transactions, pendingTransactions]
  );

  return {
    // State
    categoryData,
    dailyData,
    budgets,
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
    // Handlers
    handleAdd,
    handleReplace,
    handleDelete,
    handleUpdate,
  };
}
