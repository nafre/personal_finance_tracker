"use client";

import { useState, useEffect, useTransition, useCallback, useRef } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { getTransactions, getCategories } from "@/lib/actions";
import { useSyncContext } from "@/context/SyncProvider";
import { TransactionList } from "@/components/TransactionList";
import { MonthSelector } from "@/components/MonthSelector";
import { ExpenseInput } from "@/components/ExpenseInput";
import { formatCurrency, getCurrentMonthYear, stringToColor } from "@/lib/utils";

interface Transaction {
  id: string;
  category: string;
  amount: number;
  type: string;
  note?: string | null;
  labels?: string[];
  date: Date | string;
}

interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
}

export default function TransactionsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const { month: curMonth, year: curYear } = getCurrentMonthYear();
  const month = searchParams.get("month") ? parseInt(searchParams.get("month")!) : curMonth;
  const year = searchParams.get("year") ? parseInt(searchParams.get("year")!) : curYear;
  const categoryFilter = searchParams.get("category") ?? "";
  const labelFilter = searchParams.get("label") ?? "";

  const { pendingCount } = useSyncContext();
  const prevPendingCountRef = useRef(pendingCount);

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isPending, startTransition] = useTransition();

  // Fetch on filter change
  useEffect(() => {
    startTransition(async () => {
      const [txs, cats] = await Promise.all([
        getTransactions({ month, year, category: categoryFilter || undefined, label: labelFilter || undefined }),
        getCategories(),
      ]);
      setTransactions(txs as Transaction[]);
      setCategories(cats as Category[]);
    });
  }, [month, year, categoryFilter, labelFilter]);

  // Silent re-fetch after sync completes — clears isPending badges without showing the loading spinner
  useEffect(() => {
    const prev = prevPendingCountRef.current;
    prevPendingCountRef.current = pendingCount;
    if (pendingCount >= prev) return;
    getTransactions({ month, year, category: categoryFilter || undefined, label: labelFilter || undefined })
      .then((txs) => setTransactions(txs as Transaction[]));
  }, [pendingCount, month, year, categoryFilter, labelFilter]);

  function setFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`${pathname}?${params.toString()}`);
  }

  const handleAdd = useCallback(
    (tx: { id: string; category: string; amount: number; type: "income" | "expense"; note?: string; labels: string[]; date: Date | string; isPending?: boolean }) => {
      const txDate = new Date(tx.date);
      if (txDate.getMonth() + 1 === month && txDate.getFullYear() === year) {
        setTransactions((prev) => [tx, ...prev]);
      }
    },
    [month, year]
  );

  const handleDelete = useCallback((id: string) => {
    setTransactions((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Summary
  const totalIncome = transactions.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const totalExpenses = transactions.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);

  // Unique categories and labels in current view for filter dropdowns
  const usedCategories = Array.from(new Set(transactions.map((t) => t.category))).sort();
  const usedLabels = Array.from(
    new Set(transactions.flatMap((t) => t.labels ?? []))
  ).sort();

  const hasFilter = !!(categoryFilter || labelFilter);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-100">Transactions</h1>
        <p className="text-slate-400 text-sm">All your entries, filterable by month, category, and label.</p>
      </div>

      {/* Quick add */}
      <ExpenseInput onAdd={handleAdd} />

      {/* Filters */}
      <div data-testid="filter-bar" className="flex flex-wrap gap-3 items-center">
        <MonthSelector month={month} year={year} />

        <div className="flex-1 min-w-[140px]">
          <select
            value={categoryFilter}
            onChange={(e) => setFilter("category", e.target.value)}
            className="input-base w-full text-sm"
          >
            <option value="">All categories</option>
            {usedCategories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div className="flex-1 min-w-[140px]">
          <select
            value={labelFilter}
            onChange={(e) => setFilter("label", e.target.value)}
            className="input-base w-full text-sm"
          >
            <option value="">All labels</option>
            {usedLabels.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </div>

        {hasFilter && (
          <button
            onClick={() => {
              const params = new URLSearchParams(searchParams.toString());
              params.delete("category");
              params.delete("label");
              router.push(`${pathname}?${params.toString()}`);
            }}
            className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Active label filter badge */}
      {labelFilter && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">Filtered by label:</span>
          <span
            className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-md"
            style={{ backgroundColor: `${stringToColor(labelFilter)}22`, color: stringToColor(labelFilter) }}
          >
            {labelFilter}
            <button
              onClick={() => setFilter("label", "")}
              className="opacity-60 hover:opacity-100"
            >
              ×
            </button>
          </span>
        </div>
      )}

      {/* Summary strip */}
      <div data-testid="summary-strip" className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <span className="text-slate-400 whitespace-nowrap">
          {transactions.length} transaction{transactions.length !== 1 ? "s" : ""}
        </span>
        <span className="text-emerald-400 font-medium tabular-nums whitespace-nowrap">
          +{formatCurrency(totalIncome)}
        </span>
        <span className="text-rose-400 font-medium tabular-nums whitespace-nowrap">
          −{formatCurrency(totalExpenses)}
        </span>
        <span className={`font-semibold tabular-nums whitespace-nowrap ${totalIncome - totalExpenses >= 0 ? "text-indigo-400" : "text-rose-400"}`}>
          Net {formatCurrency(Math.abs(totalIncome - totalExpenses))}
        </span>
      </div>

      {/* List */}
      <div className="card">
        {isPending ? (
          <div className="flex items-center justify-center py-12 text-slate-500 text-sm gap-2">
            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Loading…
          </div>
        ) : (
          <TransactionList
            transactions={transactions}
            onDelete={handleDelete}
          />
        )}
      </div>
    </div>
  );
}
