"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import useSWR from "swr";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { getTransactions, getCategories, getBudgets } from "@/lib/actions";
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
  excludedBudgetIds?: string[];
  excludeFromStats?: boolean;
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
  const qFilter = searchParams.get("q") ?? "";
  const fromFilter = searchParams.get("from") ?? "";
  const toFilter = searchParams.get("to") ?? "";

  const { pendingCount } = useSyncContext();
  const prevPendingCountRef = useRef(pendingCount);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [budgets, setBudgets] = useState<{ id: string; name: string }[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [totalIncome, setTotalIncome] = useState(0);
  const [totalExpenses, setTotalExpenses] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Local search input state — debounced into URL
  const [searchInput, setSearchInput] = useState(qFilter);

  // Sync local input with URL param (e.g. on back/forward)
  useEffect(() => {
    setSearchInput(qFilter);
  }, [qFilter]);

  function setFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`${pathname}?${params.toString()}`);
  }

  function handleSearchChange(value: string) {
    setSearchInput(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setFilter("q", value);
    }, 300);
  }

  function clearAllFilters() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("category");
    params.delete("label");
    params.delete("q");
    params.delete("from");
    params.delete("to");
    router.push(`${pathname}?${params.toString()}`);
  }

  function handleExport() {
    const params = new URLSearchParams();
    params.set("month", String(month));
    params.set("year", String(year));
    if (categoryFilter) params.set("category", categoryFilter);
    if (labelFilter) params.set("label", labelFilter);
    if (qFilter) params.set("q", qFilter);
    window.location.href = `/api/export?${params.toString()}`;
  }

  const buildFilters = useCallback(() => ({
    month,
    year,
    category: categoryFilter || undefined,
    label: labelFilter || undefined,
    q: qFilter || undefined,
    from: fromFilter ? new Date(fromFilter) : undefined,
    to: toFilter ? new Date(toFilter + "T23:59:59") : undefined,
  }), [month, year, categoryFilter, labelFilter, qFilter, fromFilter, toFilter]);

  // Stable cache key — serialized filter dims (no Date objects)
  const filterKey = useMemo(() => JSON.stringify({
    month, year,
    category: categoryFilter || undefined,
    label: labelFilter || undefined,
    q: qFilter || undefined,
    from: fromFilter || undefined,
    to: toFilter || undefined,
  }), [month, year, categoryFilter, labelFilter, qFilter, fromFilter, toFilter]);

  // SWR manages initial fetch and caches results per filter combination.
  // Re-visiting a previously-seen filter returns the cached data instantly
  // while revalidating in the background.
  const { isLoading, mutate } = useSWR(
    filterKey,
    () => getTransactions(buildFilters()),
    {
      onSuccess: (result) => {
        setTransactions(result.transactions as Transaction[]);
        setNextCursor(result.nextCursor);
        setTotalCount(result.totalCount);
        setTotalIncome(result.totalIncome);
        setTotalExpenses(result.totalExpenses);
      },
    }
  );

  // Fetch categories once on mount — they don't change within a session
  useEffect(() => {
    getCategories().then((cats) => setCategories(cats as Category[]));
  }, []);

  // Fetch budgets once — used by the edit form's "exclude from budgets" control
  useEffect(() => {
    getBudgets().then((bs) => setBudgets(bs.map((b) => ({ id: b.id, name: b.name }))));
  }, []);

  // Silent re-fetch after sync completes — clears isPending badges
  useEffect(() => {
    const prev = prevPendingCountRef.current;
    prevPendingCountRef.current = pendingCount;
    if (pendingCount >= prev) return;
    mutate();
  }, [pendingCount, mutate]);

  async function loadMore() {
    if (!nextCursor || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const result = await getTransactions({ ...buildFilters(), cursor: nextCursor });
      setTransactions((prev) => [...prev, ...result.transactions as Transaction[]]);
      setNextCursor(result.nextCursor);
    } finally {
      setIsLoadingMore(false);
    }
  }

  const handleAdd = useCallback(
    (tx: { id: string; category: string; amount: number; type: "income" | "expense"; note?: string; labels: string[]; date: Date | string; isPending?: boolean }) => {
      const txDate = new Date(tx.date);
      if (txDate.getMonth() + 1 === month && txDate.getFullYear() === year) {
        setTransactions((prev) => [tx, ...prev]);
        setTotalCount((c) => c + 1);
        if (tx.type === "income") setTotalIncome((s) => s + tx.amount);
        else setTotalExpenses((s) => s + tx.amount);
      }
    },
    [month, year]
  );

  const handleDelete = useCallback((id: string) => {
    setTransactions((prev) => {
      const removed = prev.find((t) => t.id === id);
      if (removed) {
        setTotalCount((c) => c - 1);
        if (removed.type === "income") setTotalIncome((s) => s - removed.amount);
        else setTotalExpenses((s) => s - removed.amount);
      }
      return prev.filter((t) => t.id !== id);
    });
  }, []);

  // Re-insert a transaction whose optimistic delete failed server-side
  const handleRestore = useCallback((tx: Transaction) => {
    setTransactions((prev) => {
      if (prev.some((t) => t.id === tx.id)) return prev;
      setTotalCount((c) => c + 1);
      if (tx.type === "income") setTotalIncome((s) => s + tx.amount);
      else setTotalExpenses((s) => s + tx.amount);
      return [tx, ...prev];
    });
  }, []);

  const handleUpdate = useCallback((id: string, data: Partial<Transaction>) => {
    setTransactions((prev) => {
      const old = prev.find((t) => t.id === id);
      if (old && (data.amount !== undefined || data.type !== undefined)) {
        const oldAmount = old.amount;
        const newAmount = data.amount ?? old.amount;
        const oldType = old.type;
        const newType = data.type ?? old.type;
        // Remove old contribution
        if (oldType === "income") setTotalIncome((s) => s - oldAmount);
        else setTotalExpenses((s) => s - oldAmount);
        // Add new contribution
        if (newType === "income") setTotalIncome((s) => s + newAmount);
        else setTotalExpenses((s) => s + newAmount);
      }
      return prev.map((t) => (t.id === id ? { ...t, ...data } : t));
    });
  }, []);

  // Unique categories and labels for filter dropdowns (from all loaded transactions)
  const usedCategories = Array.from(new Set(transactions.map((t) => t.category))).sort();
  const usedLabels = Array.from(
    new Set(transactions.flatMap((t) => t.labels ?? []))
  ).sort();

  const hasDateRange = !!(fromFilter && toFilter);
  const hasFilter = !!(categoryFilter || labelFilter || qFilter || fromFilter || toFilter);

  // Icon/color chips for the quick-add category picker
  const categoryOptions = useMemo(
    () => categories.map((c) => ({ name: c.name, icon: c.icon, color: c.color })),
    [categories]
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-100">Transactions</h1>
        <p className="text-slate-400 text-sm">All your entries, filterable by month, category, label, and search.</p>
      </div>

      {/* Quick add */}
      <ExpenseInput onAdd={handleAdd} categories={categoryOptions} />

      {/* Filters */}
      <div data-testid="filter-bar" className="space-y-2">
        {/* Row 1: search + month (if no date range) */}
        <div className="flex flex-wrap gap-2 items-center">
          {/* Search */}
          <div className="relative flex-1 min-w-[180px]">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={searchInput}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search notes…"
              aria-label="Search notes"
              className="input-base w-full pl-8 text-base sm:text-sm"
            />
          </div>
          {/* Month selector — hidden when date range is active */}
          {!hasDateRange && <MonthSelector period="month" month={month} year={year} showPeriodToggle={false} />}
        </div>

        {/* Row 2: category + label — 2-up grid on mobile, inline row from sm up */}
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
          <select
            value={categoryFilter}
            onChange={(e) => setFilter("category", e.target.value)}
            aria-label="Filter by category"
            className="input-base w-full sm:w-auto sm:flex-1 sm:min-w-[140px] text-base sm:text-sm"
          >
            <option value="">All categories</option>
            {usedCategories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          <select
            value={labelFilter}
            onChange={(e) => setFilter("label", e.target.value)}
            aria-label="Filter by label"
            className="input-base w-full sm:w-auto sm:flex-1 sm:min-w-[140px] text-base sm:text-sm"
          >
            <option value="">All labels</option>
            {usedLabels.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </div>

        {/* Row 3: date range + actions */}
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-end">
          <div>
            <label htmlFor="filter-from" className="text-[11px] text-slate-500 mb-0.5 block">From</label>
            <input
              id="filter-from"
              type="date"
              value={fromFilter}
              onChange={(e) => setFilter("from", e.target.value)}
              className="input-base text-base sm:text-sm w-full sm:w-40"
            />
          </div>
          <div>
            <label htmlFor="filter-to" className="text-[11px] text-slate-500 mb-0.5 block">To</label>
            <input
              id="filter-to"
              type="date"
              value={toFilter}
              onChange={(e) => setFilter("to", e.target.value)}
              className="input-base text-base sm:text-sm w-full sm:w-40"
            />
          </div>

          <div className="col-span-2 flex items-center gap-2 sm:col-span-1 sm:ml-auto">
            {hasFilter && (
              <button
                onClick={clearAllFilters}
                className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors shrink-0 px-2 py-2"
              >
                Clear all
              </button>
            )}
            <button
              onClick={handleExport}
              className="text-xs text-slate-400 hover:text-slate-200 transition-colors shrink-0 border border-slate-700 hover:border-slate-500 px-3 py-2 rounded-lg ml-auto sm:ml-0"
            >
              Export CSV ↓
            </button>
          </div>
        </div>
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
              className="opacity-60 hover:opacity-100 p-1 -m-1"
              aria-label={`Clear label filter ${labelFilter}`}
            >
              ×
            </button>
          </span>
        </div>
      )}

      {/* Summary strip */}
      <div data-testid="summary-strip" className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <span className="text-slate-400 whitespace-nowrap">
          {totalCount} transaction{totalCount !== 1 ? "s" : ""}
          {nextCursor || transactions.length < totalCount ? ` (showing ${transactions.length})` : ""}
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
        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-slate-500 text-sm gap-2">
            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Loading…
          </div>
        ) : transactions.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-slate-400 font-medium mb-1">
              {hasFilter ? "No matching transactions" : "No transactions this month"}
            </p>
            <p className="text-slate-500 text-sm">
              {hasFilter ? "Try clearing your filters." : "Add your first transaction above."}
            </p>
            {hasFilter && (
              <button
                onClick={clearAllFilters}
                className="mt-3 text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <>
            <TransactionList
              transactions={transactions}
              onDelete={handleDelete}
              onUpdate={handleUpdate}
              onRestore={handleRestore}
              budgets={budgets}
            />
            {/* Load More */}
            {nextCursor && (
              <div className="pt-3 pb-1 flex justify-center border-t border-slate-700/50 mt-2">
                <button
                  onClick={loadMore}
                  disabled={isLoadingMore}
                  className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {isLoadingMore ? (
                    <>
                      <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Loading…
                    </>
                  ) : (
                    `Load more (${totalCount - transactions.length} remaining)`
                  )}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
