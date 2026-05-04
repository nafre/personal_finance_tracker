"use client";

import { useState, useEffect, useRef } from "react";
import { updateTransaction, deleteTransaction, getCategories } from "@/lib/actions";
import { applyLocalMutation } from "@/lib/sync";
import { CategoryCombobox } from "@/components/CategoryCombobox";
import { useSyncContext } from "@/context/SyncProvider";
import { formatCurrency, formatDate, cn, stringToColor } from "@/lib/utils";

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

interface TransactionListProps {
  transactions: Transaction[];
  onDelete?: (id: string) => void;
  onUpdate?: (id: string, data: Partial<Transaction>) => void;
  compact?: boolean;
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
              className="opacity-60 hover:opacity-100 leading-none"
            >
              ×
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
        className="bg-transparent outline-none text-sm text-slate-200 placeholder:text-slate-600 flex-1 min-w-[120px]"
      />
    </div>
  );
}

interface CategoryMeta {
  name: string;
  icon: string;
  color: string;
}

function TransactionRow({
  tx,
  onDelete,
  onUpdate,
  compact,
  categories,
}: {
  tx: Transaction;
  onDelete: (id: string) => void;
  onUpdate: (id: string, data: Partial<Transaction>) => void;
  compact?: boolean;
  categories: CategoryMeta[];
}) {
  const [editing, setEditing] = useState(false);
  const [editAmount, setEditAmount] = useState(tx.amount.toString());
  const [editCategory, setEditCategory] = useState(tx.category);
  const [editNote, setEditNote] = useState(tx.note ?? "");
  const [editLabels, setEditLabels] = useState<string[]>(tx.labels ?? []);
  const [editType, setEditType] = useState<"income" | "expense">(
    tx.type as "income" | "expense"
  );
  const [rowError, setRowError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
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
      isPending: tx.isPending ?? false,
    };

    // Optimistic: update UI instantly and close the form
    onUpdate(tx.id, { ...updateData, isPending: false });
    setEditing(false);

    // Background server sync — on failure revert state and re-open the form
    // so the user can see the error and retry with their values still filled in
    updateTransaction(tx.id, updateData).catch(() => {
      onUpdate(tx.id, snapshot);
      setEditing(true);
      setRowError("Update failed — please try again.");
    });
  }

  function handleDelete() {
    if (!confirm("Delete this transaction?")) return;
    setRowError("");

    if (!isOnline) {
      (async () => {
        try {
          await applyLocalMutation("delete", { id: tx.id, userId });
          await refreshPendingCount();
          onDelete(tx.id);
        } catch {
          setRowError("Failed to delete. Please try again.");
        }
      })();
      return;
    }

    // Optimistic: remove from UI immediately, fire server call in background
    onDelete(tx.id);
    deleteTransaction(tx.id).catch(() => {
      // Row is already removed from state; nothing to revert here
    });
  }

  const isIncome = tx.type === "income";
  const labels = tx.labels ?? [];

  if (editing) {
    return (
      <div className="bg-slate-800 rounded-xl p-4 space-y-3 animate-fade-in">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Category</label>
            <CategoryCombobox
              value={editCategory}
              onChange={setEditCategory}
              categories={categories.map((c) => c.name)}
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Amount</label>
            <input
              type="number"
              className="input-base w-full text-sm"
              value={editAmount}
              onChange={(e) => setEditAmount(e.target.value)}
              min="0"
              step="0.01"
            />
          </div>
        </div>
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Note</label>
          <input
            className="input-base w-full text-sm"
            value={editNote}
            onChange={(e) => setEditNote(e.target.value)}
            placeholder="Optional note"
          />
        </div>
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Labels</label>
          <LabelEditor value={editLabels} onChange={setEditLabels} />
          <p className="text-[11px] text-slate-600 mt-1">Press Enter or comma to add · Backspace to remove</p>
        </div>
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Type</label>
          <div className="flex gap-2">
            {(["expense", "income"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setEditType(t)}
                className={cn(
                  "flex-1 py-1.5 rounded-lg text-sm font-medium transition-colors capitalize",
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
            className="btn-ghost text-sm px-3 py-1.5"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="btn-primary text-sm px-4 py-1.5 disabled:opacity-50"
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
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity">
          <button
            onClick={() => setEditing(true)}
            className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-500 hover:text-slate-300 transition-colors text-xs"
            title="Edit"
          >
            ✏️
          </button>
          <button
            onClick={handleDelete}
            className="p-1.5 rounded-lg hover:bg-rose-500/20 text-slate-500 hover:text-rose-400 transition-colors text-xs"
            title="Delete"
          >
            🗑️
          </button>
        </div>
      </div>
    </div>
    {rowError && (
      <p className="text-xs text-rose-400 px-3 pb-1">{rowError}</p>
    )}
    </>
  );
}

export function TransactionList({
  transactions: initial,
  onDelete,
  onUpdate,
  compact = false,
}: TransactionListProps) {
  const [txs, setTxs] = useState(initial);
  const [categories, setCategories] = useState<CategoryMeta[]>([]);

  // Sync local state when the parent swaps the list (e.g. month / filter change)
  useEffect(() => {
    setTxs(initial);
  }, [initial]);

  useEffect(() => {
    getCategories().then((cats) =>
      setCategories(cats.map((c) => ({ name: c.name, icon: c.icon, color: c.color })))
    );
  }, []);

  function handleDelete(id: string) {
    setTxs((prev) => prev.filter((t) => t.id !== id));
    onDelete?.(id);
  }

  function handleUpdate(id: string, data: Partial<Transaction>) {
    setTxs((prev) => prev.map((t) => (t.id === id ? { ...t, ...data } : t)));
    onUpdate?.(id, data);
  }

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
          compact={compact}
          categories={categories}
        />
      ))}
    </div>
  );
}

