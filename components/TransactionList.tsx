"use client";

import { memo, useState, useEffect, useRef, useCallback } from "react";
import { updateTransaction, deleteTransaction, getCategories } from "@/lib/actions";
import { applyLocalMutation } from "@/lib/sync";
import { patchTransaction, deleteTransactionFromIDB } from "@/lib/idb";
import { CategoryCombobox } from "@/components/CategoryCombobox";
import { useSyncContext } from "@/context/SyncProvider";
import { useToast } from "@/context/ToastContext";
import { formatCurrency, formatDate, cn, stringToColor } from "@/lib/utils";
import { ChevronDown, Pencil, Trash2, X } from "lucide-react";

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
  isPending?: boolean;
}

interface BudgetOption {
  id: string;
  name: string;
}

interface TransactionListProps {
  transactions: Transaction[];
  onDelete?: (id: string) => void;
  onUpdate?: (id: string, data: Partial<Transaction>) => void;
  onRestore?: (tx: Transaction) => void;
  compact?: boolean;
  budgets?: BudgetOption[];
}

// Pill badge for a single label
function LabelBadge({ label }: { label: string }) {
  const color = stringToColor(label);
  return (
    <span
      className="inline-flex items-center text-[11px] font-medium px-1.5 py-0.5 rounded-md"
      style={{ backgroundColor: `${color}22`, color }}
    >
      {label}
    </span>
  );
}

// Tag input for editing labels in the inline edit form
function LabelEditor({
  value,
  onChange,
}: {
  value: string[];
  onChange: (labels: string[]) => void;
}) {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function addLabel(raw: string) {
    const label = raw.trim().toLowerCase().replace(/^#/, "");
    if (!label || value.includes(label)) return;
    onChange([...value, label]);
    setInput("");
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addLabel(input);
    } else if (e.key === "Backspace" && !input && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  }

  return (
    <div
      className="input-base flex flex-wrap gap-1.5 min-h-[38px] cursor-text"
      onClick={() => inputRef.current?.focus()}
    >
      {value.map((label) => {
        const color = stringToColor(label);
        return (
          <span
            key={label}
            className="inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded-md"
            style={{ backgroundColor: `${color}22`, color }}
          >
            {label}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onChange(value.filter((l) => l !== label)); }}
              className="opacity-60 hover:opacity-100 leading-none p-1 -m-1"
              aria-label={`Remove label ${label}`}
            >
              <X className="w-3 h-3" aria-hidden="true" />
            </button>
          </span>
        );
      })}
      <input
        ref={inputRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => { if (input.trim()) addLabel(input); }}
        placeholder={value.length === 0 ? "Add labels… (Enter to confirm)" : ""}
        className="bg-transparent outline-none text-base sm:text-sm text-slate-200 placeholder:text-slate-500 flex-1 min-w-[120px]"
      />
    </div>
  );
}

// Dropdown checklist for excluding a transaction from specific budgets.
// Closed state shows a summary button; open state lists each budget with a checkbox.
function BudgetExcludeSelect({
  budgets,
  value,
  onChange,
}: {
  budgets: BudgetOption[];
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  }

  const count = value.length;
  const summary =
    count === 0 ? "Not excluded" : `Excluded from ${count} budget${count > 1 ? "s" : ""}`;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="input-base w-full text-base sm:text-sm text-left flex items-center justify-between"
      >
        <span className={cn(count === 0 ? "text-slate-500" : "text-slate-200")}>{summary}</span>
        <ChevronDown className="w-4 h-4 text-slate-500 ml-2 shrink-0" aria-hidden="true" />
      </button>
      {open && (
        <div className="absolute z-10 mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg shadow-lg max-h-48 overflow-auto py-1">
          {budgets.map((b) => (
            <label
              key={b.id}
              className="flex items-center gap-2 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-700 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={value.includes(b.id)}
                onChange={() => toggle(b.id)}
                className="accent-indigo-500"
              />
              <span className="truncate">{b.name}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

interface CategoryMeta {
  name: string;
  icon: string;
  color: string;
}

// Memoized so list-level re-renders (e.g. a sibling row's optimistic update)
// skip unchanged rows — parents must pass identity-stable callbacks and arrays.
const TransactionRow = memo(function TransactionRow({
  tx,
  onDelete,
  onUpdate,
  onRestore,
  compact,
  categories,
  budgets,
}: {
  tx: Transaction;
  onDelete: (id: string) => void;
  onUpdate: (id: string, data: Partial<Transaction>) => void;
  onRestore: (tx: Transaction) => void;
  compact?: boolean;
  categories: CategoryMeta[];
  budgets: BudgetOption[];
}) {
  const [editing, setEditing] = useState(false);
  const [editAmount, setEditAmount] = useState(tx.amount.toString());
  const [editCategory, setEditCategory] = useState(tx.category);
  const [editNote, setEditNote] = useState(tx.note ?? "");
  const [editLabels, setEditLabels] = useState<string[]>(tx.labels ?? []);
  const [editExcludedBudgetIds, setEditExcludedBudgetIds] = useState<string[]>(
    tx.excludedBudgetIds ?? []
  );
  const [editExcludeFromStats, setEditExcludeFromStats] = useState<boolean>(
    tx.excludeFromStats ?? false
  );
  const [editType, setEditType] = useState<"income" | "expense">(
    tx.type as "income" | "expense"
  );
  const [editDate, setEditDate] = useState<string>(
    new Date(tx.date).toISOString().split("T")[0]
  );
  const [rowError, setRowError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const { isOnline, userId, refreshPendingCount } = useSyncContext();

  function handleSave() {
    const amount = parseFloat(editAmount);
    if (isNaN(amount) || amount <= 0) return;
    setRowError("");

    const updateData = {
      category: editCategory,
      amount,
      type: editType,
      note: editNote || undefined,
      labels: editLabels,
      excludedBudgetIds: editExcludedBudgetIds,
      excludeFromStats: editExcludeFromStats,
      date: editDate,
    };

    if (!isOnline) {
      setIsSaving(true);
      applyLocalMutation("update", { id: tx.id, userId, ...updateData })
        .then(() => refreshPendingCount())
        .then(() => {
          onUpdate(tx.id, { ...updateData, isPending: true });
          setEditing(false);
        })
        .catch(() => setRowError("Failed to save. Please try again."))
        .finally(() => setIsSaving(false));
      return;
    }

    // Snapshot current values so we can roll back if the server call fails
    const snapshot: Partial<Transaction> = {
      category: tx.category,
      amount: tx.amount,
      type: tx.type as "income" | "expense",
      note: tx.note,
      labels: tx.labels ?? [],
      excludedBudgetIds: tx.excludedBudgetIds ?? [],
      excludeFromStats: tx.excludeFromStats ?? false,
      date: tx.date,
      isPending: tx.isPending ?? false,
    };

    // Optimistic: update UI instantly and close the form
    onUpdate(tx.id, { ...updateData, isPending: false });
    setEditing(false);

    // Background server sync — on failure revert state and re-open the form
    // so the user can see the error and retry with their values still filled in
    updateTransaction(tx.id, { ...updateData, date: new Date(editDate) })
      .then((updated) => {
        // Write through to the IDB mirror so other pages don't resurrect the
        // old values. No-ops when the record isn't mirrored; must never break
        // the UI on IDB failure.
        void patchTransaction(tx.id, {
          category: updated.category,
          amount: updated.amount,
          type: updated.type as "income" | "expense",
          note: updated.note ?? undefined,
          labels: updated.labels ?? [],
          excludedBudgetIds: updated.excludedBudgetIds ?? [],
          excludeFromStats: updated.excludeFromStats ?? false,
          date: new Date(updated.date).toISOString(),
          syncStatus: "synced",
          syncError: undefined,
        }).catch(() => {});
      })
      .catch(() => {
        onUpdate(tx.id, snapshot);
        setEditing(true);
        setRowError("Update failed — please try again.");
      });
  }

  function handleDelete() {
    setConfirmingDelete(false);
    setRowError("");
    setIsDeleting(true);

    if (!isOnline) {
      (async () => {
        try {
          await applyLocalMutation("delete", { id: tx.id, userId });
          await refreshPendingCount();
          onDelete(tx.id);
        } catch {
          setIsDeleting(false);
          setRowError("Failed to delete. Please try again.");
        }
      })();
      return;
    }

    // Optimistic: remove from UI immediately, fire server call in background.
    // On failure the transaction still exists server-side — restore the row.
    onDelete(tx.id);
    deleteTransaction(tx.id)
      .then(() => {
        // Remove the IDB mirror copy too, or the dashboard's pending-load
        // merge resurrects the row as a ghost until the next reconcile.
        void deleteTransactionFromIDB(tx.id).catch(() => {});
      })
      .catch(() => {
        onRestore(tx);
      });
  }

  const isIncome = tx.type === "income";
  const labels = tx.labels ?? [];

  if (editing) {
    return (
      <div className={cn("bg-slate-800 rounded-xl p-4 space-y-3 animate-fade-in", isSaving && "opacity-50 pointer-events-none")}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Category</label>
            <CategoryCombobox
              value={editCategory}
              onChange={setEditCategory}
              categories={categories}
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Amount</label>
            <input
              type="number"
              className="input-base w-full text-base sm:text-sm"
              value={editAmount}
              onChange={(e) => setEditAmount(e.target.value)}
              min="0"
              step="0.01"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Date</label>
            <input
              type="date"
              className="input-base w-full text-base sm:text-sm"
              value={editDate}
              onChange={(e) => setEditDate(e.target.value)}
            />
          </div>
        </div>
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Note</label>
          <input
            className="input-base w-full text-base sm:text-sm"
            value={editNote}
            onChange={(e) => setEditNote(e.target.value)}
            placeholder="Optional note"
          />
        </div>
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Labels</label>
          <LabelEditor value={editLabels} onChange={setEditLabels} />
          <p className="text-[11px] text-slate-500 mt-1">Press Enter or comma to add · Backspace to remove</p>
        </div>
        {editType === "expense" && budgets.length > 0 && (
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Exclude from budgets</label>
            <BudgetExcludeSelect
              budgets={budgets}
              value={editExcludedBudgetIds}
              onChange={setEditExcludedBudgetIds}
            />
            <p className="text-[11px] text-slate-500 mt-1">This transaction won&apos;t count toward the selected budgets.</p>
          </div>
        )}
        <div>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-600 bg-slate-700 accent-indigo-500"
              checked={editExcludeFromStats}
              onChange={(e) => setEditExcludeFromStats(e.target.checked)}
            />
            <span className="text-xs text-slate-300">Exclude from charts</span>
          </label>
          <p className="text-[11px] text-slate-500 mt-1">Hidden from the spending breakdown and daily trend, but still counted in totals.</p>
        </div>
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Type</label>
          <div className="flex gap-2">
            {(["expense", "income"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setEditType(t)}
                aria-pressed={editType === t}
                className={cn(
                  "flex-1 py-2 rounded-lg text-sm font-medium transition-colors capitalize",
                  editType === t
                    ? t === "income"
                      ? "bg-emerald-600 text-white"
                      : "bg-rose-600 text-white"
                    : "bg-slate-700 text-slate-400 hover:bg-slate-600"
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
        {rowError && (
          <p className="text-xs text-rose-400">{rowError}</p>
        )}
        <div className="flex gap-2 justify-end">
          <button
            onClick={() => setEditing(false)}
            className="btn-ghost text-sm px-3 py-2"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="btn-primary text-sm px-4 py-2 disabled:opacity-50"
          >
            {isSaving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
    <div
      className={cn(
        "flex items-start gap-3 px-3 rounded-xl hover:bg-slate-800/60 transition-colors group",
        compact ? "py-2" : "py-3",
        tx.isPending && "opacity-75"
      )}
    >
      {/* Icon */}
      <div
        className={cn(
          "w-9 h-9 rounded-xl flex items-center justify-center text-base shrink-0 mt-0.5",
          isIncome ? "bg-emerald-500/15" : "bg-indigo-500/15"
        )}
      >
        {isIncome ? "💰" : (categories.find((c) => c.name === tx.category)?.icon ?? "📦")}
      </div>

      {/* Info — grows, truncates, labels on their own line */}
      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <p className="text-sm font-medium text-slate-100 truncate">
            {tx.category}
          </p>
          {tx.isPending && (
            <span className="text-[10px] text-amber-400 border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 rounded-full shrink-0 whitespace-nowrap">
              Pending
            </span>
          )}
          {tx.excludeFromStats && (
            <span
              className="text-[10px] text-slate-400 border border-slate-600 bg-slate-700/40 px-1.5 py-0.5 rounded-full shrink-0 whitespace-nowrap"
              title="Excluded from charts (still counted in totals)"
            >
              Off-chart
            </span>
          )}
        </div>
        <p className="text-xs text-slate-500 truncate">
          {tx.note ? `${tx.note} · ` : ""}
          {formatDate(tx.date)}
        </p>
        {labels.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-0.5">
            {labels.map((l) => <LabelBadge key={l} label={l} />)}
          </div>
        )}
      </div>

      {/* Right column: amount above, actions below — always aligned to top-right */}
      <div className="flex flex-col items-end gap-1.5 shrink-0">
        <span
          className={cn(
            "font-semibold text-sm tabular-nums leading-[1.35]",
            isIncome ? "text-emerald-400" : "text-rose-400"
          )}
        >
          {isIncome ? "+" : "−"}
          {formatCurrency(tx.amount)}
        </span>
        {confirmingDelete ? (
          <div className="flex items-center gap-1.5 animate-fade-in">
            <button
              onClick={handleDelete}
              className="px-2.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium transition-colors [@media(hover:none)]:min-h-11"
            >
              Delete
            </button>
            <button
              onClick={() => setConfirmingDelete(false)}
              className="px-2.5 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-medium transition-colors [@media(hover:none)]:min-h-11"
            >
              Cancel
            </button>
          </div>
        ) : (
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity">
          <button
            onClick={() => setEditing(true)}
            className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-500 hover:text-slate-300 transition-colors flex items-center justify-center [@media(hover:none)]:min-h-11 [@media(hover:none)]:min-w-11"
            title="Edit"
            aria-label={`Edit ${tx.category} transaction`}
          >
            <Pencil className="w-4 h-4" aria-hidden="true" />
          </button>
          <button
            onClick={() => setConfirmingDelete(true)}
            disabled={isDeleting}
            className="p-1.5 rounded-lg hover:bg-rose-500/20 text-slate-500 hover:text-rose-400 transition-colors disabled:opacity-40 flex items-center justify-center [@media(hover:none)]:min-h-11 [@media(hover:none)]:min-w-11"
            title="Delete"
            aria-label={`Delete ${tx.category} transaction`}
          >
            {isDeleting ? (
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <Trash2 className="w-4 h-4" aria-hidden="true" />
            )}
          </button>
        </div>
        )}
      </div>
    </div>
    {rowError && (
      <p className="text-xs text-rose-400 px-3 pb-1">{rowError}</p>
    )}
    </>
  );
});

export function TransactionList({
  transactions: initial,
  onDelete,
  onUpdate,
  onRestore,
  compact = false,
  budgets = [],
}: TransactionListProps) {
  const [txs, setTxs] = useState(initial);
  const [categories, setCategories] = useState<CategoryMeta[]>([]);
  const { showToast } = useToast();

  // Sync local state when the parent swaps the list (e.g. month / filter change)
  useEffect(() => {
    setTxs(initial);
  }, [initial]);

  useEffect(() => {
    getCategories().then((cats) =>
      setCategories(cats.map((c) => ({ name: c.name, icon: c.icon, color: c.color })))
    );
  }, []);

  // Identity-stable handlers so the memoized rows don't re-render on every
  // list render.
  const handleDelete = useCallback((id: string) => {
    setTxs((prev) => prev.filter((t) => t.id !== id));
    onDelete?.(id);
  }, [onDelete]);

  const handleUpdate = useCallback((id: string, data: Partial<Transaction>) => {
    setTxs((prev) => prev.map((t) => (t.id === id ? { ...t, ...data } : t)));
    onUpdate?.(id, data);
  }, [onUpdate]);

  // Re-insert a row whose server delete failed (it still exists remotely)
  const handleRestore = useCallback((tx: Transaction) => {
    setTxs((prev) =>
      prev.some((t) => t.id === tx.id)
        ? prev
        : [...prev, tx].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    );
    onRestore?.(tx);
    showToast("Delete failed — transaction restored.", "error");
  }, [onRestore, showToast]);

  if (!txs.length) {
    return (
      <div className="text-center py-8 text-slate-500 text-sm">
        {compact ? "No transactions this month." : "No transactions yet — add one above!"}
      </div>
    );
  }

  return (
    <div data-testid="transaction-list" className="space-y-0.5">
      {txs.map((tx) => (
        <TransactionRow
          key={tx.id}
          tx={tx}
          onDelete={handleDelete}
          onUpdate={handleUpdate}
          onRestore={handleRestore}
          compact={compact}
          categories={categories}
          budgets={budgets}
        />
      ))}
    </div>
  );
}

