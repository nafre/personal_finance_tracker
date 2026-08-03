"use client";

import { Fragment, useState, useRef, useMemo } from "react";
import { parseExpenseInput } from "@/lib/parser";
import type { CategoryOption } from "@/types";
import { addTransaction } from "@/lib/actions";
import { putTransaction } from "@/lib/idb";
import { applyLocalMutation } from "@/lib/sync";
import { findRecentDuplicate, hasSameDayDuplicate, recordAdd } from "@/lib/duplicates";
import { useSyncContext } from "@/context/SyncProvider";
import { useToast } from "@/context/ToastContext";
import { cn, formatCurrency } from "@/lib/utils";

export interface AddedTx {
  id: string;
  category: string;
  amount: number;
  type: "income" | "expense";
  note?: string;
  labels: string[];
  date: Date | string;
  isPending?: boolean;
}

interface ExpenseInputProps {
  onAdd?: (tx: AddedTx) => void;
  onReplace?: (tempId: string, realTx: AddedTx) => void;
  onRemove?: (tempId: string) => void;
  /** Most-used expense categories, ranked — rendered first in the chip row. */
  frequentCategories?: string[];
  /** Recently-loaded transactions (any age) — powers the passive same-day duplicate hint. */
  recentTransactions?: { amount: number; category: string; date: Date | string }[];
  categories?: CategoryOption[];
  autoFocus?: boolean;
}

export function ExpenseInput({ onAdd, onReplace, onRemove, frequentCategories, recentTransactions, categories, autoFocus }: ExpenseInputProps) {
  const [value, setValue] = useState("");
  const [preview, setPreview] = useState<ReturnType<typeof parseExpenseInput>>(null);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [manualTypeOverride, setManualTypeOverride] = useState<"income" | "expense" | null>(null);
  // Duplicate confirm strip (60s same-amount-same-category window) — holds the
  // draft's parsed amount/category while it replaces the input row.
  const [dupConfirm, setDupConfirm] = useState<{ amount: number; category: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { isOnline, userId, refreshPendingCount } = useSyncContext();
  const { showToast } = useToast();

  const effectiveType = manualTypeOverride ?? preview?.type ?? "expense";

  // Passive hint: a matching (amount, category) transaction already exists
  // today. Doesn't interrupt — renders an amber dot on the Add button.
  const sameDayDup = useMemo(() => {
    if (!preview) return false;
    return hasSameDayDuplicate(
      { amount: preview.amount, category: preview.category },
      recentTransactions ?? []
    );
  }, [preview, recentTransactions]);

  // Unified chip row: most-used categories first (resolved to their icon/color
  // when a matching category exists — free-text ones stay plain), then the
  // remaining categories in server order. `frequentCount` marks the boundary so
  // the row can show where the ranked group ends. Deduped case-insensitively
  // because the parser capitalizes ("food" → "Food") while custom category
  // names keep whatever casing they were created with.
  const { chips: categoryChips, frequentCount } = useMemo(() => {
    const all = categories ?? [];
    const byLowerName = new Map(all.map((c) => [c.name.toLowerCase(), c]));
    const seen = new Set<string>();
    const chips: CategoryOption[] = [];
    for (const name of frequentCategories ?? []) {
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      chips.push(byLowerName.get(key) ?? { name });
    }
    const frequentCount = chips.length;
    for (const c of all) {
      const key = c.name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      chips.push(c);
    }
    return { chips, frequentCount };
  }, [frequentCategories, categories]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setValue(v);
    setError("");
    if (v === "") {
      setManualTypeOverride(null);
      setPreview(null);
    } else {
      setPreview(parseExpenseInput(v));
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  }

  function clearInput() {
    setValue("");
    setPreview(null);
    setError("");
    setManualTypeOverride(null);
    inputRef.current?.focus();
  }

  function handleSubmit(bypassDupCheck = false) {
    const parsed = parseExpenseInput(value);
    if (!parsed) {
      setError('Try: "food 20" or "salary 5000"');
      return;
    }

    // Fat-finger guard: same (amount, category) committed within the last 60s.
    // The draft stays in the input; the confirm strip interrupts at most once
    // per submission ([Add anyway] re-enters with the bypass flag).
    if (!bypassDupCheck && findRecentDuplicate({ amount: parsed.amount, category: parsed.category })) {
      setDupConfirm({ amount: parsed.amount, category: parsed.category });
      return;
    }
    setDupConfirm(null);
    recordAdd({ amount: parsed.amount, category: parsed.category });

    if (!isOnline) {
      // Offline path — write to IDB and queue, then update UI
      setIsSubmitting(true);
      applyLocalMutation("add", {
        userId,
        category: parsed.category,
        amount: parsed.amount,
        type: effectiveType,
        note: parsed.note,
        labels: parsed.labels,
      })
        .then(({ committed }) => {
          if (committed) {
            onAdd?.({
              id: committed.id,
              category: committed.category,
              amount: committed.amount,
              type: committed.type,
              note: committed.note,
              labels: committed.labels,
              date: committed.date,
              isPending: true,
            });
          }
          return refreshPendingCount();
        })
        .then(clearInput)
        .catch(() => setError("Failed to save. Please try again."))
        .finally(() => setIsSubmitting(false));
      return;
    }

    // Online path — optimistic: add to UI immediately with a temp ID, then
    // fire the server call in the background and swap in the real ID on success
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const txData = {
      category: parsed.category,
      amount: parsed.amount,
      type: effectiveType,
      note: parsed.note,
      labels: parsed.labels,
    };

    onAdd?.({ id: tempId, ...txData, date: new Date().toISOString(), isPending: true });
    clearInput();

    addTransaction(txData)
      .then((tx) => {
        onReplace?.(tempId, {
          id: tx.id,
          category: tx.category,
          amount: tx.amount,
          type: tx.type as "income" | "expense",
          note: tx.note ?? undefined,
          labels: tx.labels ?? [],
          date: tx.date,
          isPending: false,
        });
        void putTransaction({
          id: tx.id,
          userId,
          category: tx.category,
          amount: tx.amount,
          type: tx.type as "income" | "expense",
          note: tx.note ?? undefined,
          labels: tx.labels ?? [],
          excludedBudgetIds: tx.excludedBudgetIds ?? [],
          excludeFromStats: tx.excludeFromStats ?? false,
          date: new Date(tx.date).toISOString(),
          syncStatus: "synced",
          createdAt: new Date(tx.createdAt).toISOString(),
        });
      })
      .catch(() => {
        onRemove?.(tempId);
        // Toast, not inline error: the input is already cleared, and on mobile
        // the QuickAddSheet has closed by now — an inline message is never seen.
        showToast("Failed to save transaction — please try again.", "error");
      });
  }

  return (
    <div data-testid="expense-input" className="card">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-slate-400 text-sm font-medium">Quick add</span>
        <span className="text-xs text-slate-500">• Type and press Enter</span>
      </div>

      {dupConfirm && (
        <div
          data-testid="dup-confirm"
          className="flex flex-wrap items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2.5 mb-2"
        >
          <p className="text-sm text-amber-300 flex-1 min-w-[180px]">
            Looks like a duplicate of the {formatCurrency(dupConfirm.amount)} {dupConfirm.category} you
            just added — add anyway?
          </p>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => handleSubmit(true)}
              className="px-2.5 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-medium transition-colors [@media(hover:none)]:min-h-11"
            >
              Add anyway
            </button>
            <button
              type="button"
              onClick={() => {
                setDupConfirm(null);
                inputRef.current?.focus();
              }}
              className="px-2.5 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-medium transition-colors [@media(hover:none)]:min-h-11"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className={cn("flex gap-2 items-start", dupConfirm && "hidden")}>
        <TypeToggle value={effectiveType} onChange={setManualTypeOverride} />

        <div className="flex-1 flex flex-col">
          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              value={value}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              className={cn(
                "input-base w-full text-base font-mono",
                preview && !error && "sm:pr-48",
                error && "border-rose-500 focus:ring-rose-500"
              )}
              placeholder="food 20  •  salary 5000  •  coffee 4.5 latte"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              disabled={isSubmitting}
              autoFocus={autoFocus}
            />

            {/* Desktop-only: preview badge floats inside the input */}
            {preview && !error && (
              <div className="hidden sm:flex absolute right-3 top-1/2 -translate-y-1/2 items-center gap-2 pointer-events-none">
                <span
                  className={cn(
                    "badge text-xs",
                    effectiveType === "income" ? "badge-income" : "badge-expense"
                  )}
                >
                  {effectiveType === "income" ? "+" : "-"}{formatCurrency(preview.amount)}
                </span>
                <span className="text-xs text-slate-500 max-w-[80px] truncate">
                  {preview.category}
                </span>
              </div>
            )}
          </div>

          {/* Mobile-only: preview badge sits below the input so it never overlaps text */}
          {preview && !error && (
            <div className="sm:hidden flex items-center gap-2 mt-1.5 px-0.5">
              <span
                className={cn(
                  "badge text-xs",
                  effectiveType === "income" ? "badge-income" : "badge-expense"
                )}
              >
                {effectiveType === "income" ? "+" : "-"}{formatCurrency(preview.amount)}
              </span>
              <span className="text-xs text-slate-500 truncate">
                {preview.category}
              </span>
            </div>
          )}
        </div>

        <button
          onClick={() => handleSubmit()}
          disabled={isSubmitting || !value.trim()}
          className="btn-primary relative px-4 flex items-center gap-1.5 shrink-0 disabled:opacity-50 self-start"
          aria-label="Add transaction"
          aria-busy={isSubmitting}
          title={sameDayDup ? "A matching transaction already exists today" : undefined}
        >
          {sameDayDup && (
            <span
              data-testid="same-day-dup-dot"
              aria-hidden="true"
              className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-amber-400 border-2 border-slate-950"
            />
          )}
          {isSubmitting ? (
            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24" aria-hidden="true">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <>
              <span>Add</span>
              <kbd className="hidden sm:inline text-[10px] bg-indigo-500 px-1 rounded-sm opacity-60">↵</kbd>
            </>
          )}
        </button>
      </div>

      {/* Error */}
      {error && (
        <p role="alert" className="text-rose-400 text-xs mt-2">{error}</p>
      )}

      {/* Category picker chips — most used first, then all categories */}
      {categoryChips.length > 0 && (
        <div data-testid="category-chip-row" className="flex gap-2 mt-2 overflow-x-auto pb-1 scrollbar-none sm:flex-wrap sm:overflow-x-visible">
          {categoryChips.map((cat, i) => (
            <Fragment key={cat.name}>
              {/* Divider closing the most-used group, so the ranked chips read
                  as a set rather than blending into the full category list. */}
              {i === frequentCount && frequentCount > 0 && (
                <span
                  aria-hidden="true"
                  className="shrink-0 self-stretch w-px my-1 bg-slate-700"
                />
              )}
              <button
                type="button"
                onClick={() => {
                  const next = cat.name + " ";
                  setValue(next);
                  setPreview(parseExpenseInput(next));
                  inputRef.current?.focus();
                }}
                title={i < frequentCount ? `${cat.name} — one of your most used` : undefined}
                className="shrink-0 inline-flex items-center gap-1.5 text-xs py-2 px-3 min-h-[36px] [@media(hover:none)]:min-h-11 bg-slate-800 border border-slate-700
                           hover:border-indigo-500 text-slate-300 rounded-full transition-[color,background-color,border-color,transform] active:scale-95"
                style={
                  cat.color
                    ? { borderColor: `${cat.color}55`, backgroundColor: `${cat.color}14` }
                    : undefined
                }
              >
                {cat.icon && <span aria-hidden="true">{cat.icon}</span>}
                {cat.name}
              </button>
            </Fragment>
          ))}
        </div>
      )}

      {/* Hint row */}
      <div className="flex gap-2 mt-2 flex-wrap items-center">
        {[
          { example: "food 20", hint: "expense" },
          { example: "grab rm15", hint: "with currency" },
          { example: "salary 5000", hint: "income" },
          { example: "coffee 4.5 latte", hint: "with note" },
        ].map((item) => (
          <button
            key={item.example}
            onClick={() => {
              setValue(item.example);
              setPreview(parseExpenseInput(item.example));
              inputRef.current?.focus();
            }}
            className="text-xs text-slate-500 hover:text-indigo-400 transition-colors font-mono
                       py-2 px-3 min-h-[44px] rounded-lg hover:bg-slate-800 flex items-center"
          >
            {item.example}
          </button>
        ))}
      </div>
    </div>
  );
}

function TypeToggle({
  value,
  onChange,
}: {
  value: "income" | "expense";
  onChange: (t: "income" | "expense") => void;
}) {
  return (
    <div className="flex rounded-lg overflow-hidden border border-slate-700 shrink-0 text-xs font-medium self-start mt-0.5">
      <button
        type="button"
        onClick={() => onChange("expense")}
        className={cn(
          "px-3 py-2 transition-colors",
          value === "expense"
            ? "bg-rose-600 text-white"
            : "bg-slate-800 text-slate-400 hover:bg-slate-700"
        )}
      >
        Exp
      </button>
      <button
        type="button"
        onClick={() => onChange("income")}
        className={cn(
          "px-3 py-2 transition-colors",
          value === "income"
            ? "bg-emerald-600 text-white"
            : "bg-slate-800 text-slate-400 hover:bg-slate-700"
        )}
      >
        Inc
      </button>
    </div>
  );
}
