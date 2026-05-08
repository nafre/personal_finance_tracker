"use client";

import { useState, useEffect } from "react";
import { getBudgets, upsertBudget, deleteBudget, getCategories } from "@/lib/actions";
import { formatCurrency } from "@/lib/utils";

interface Budget {
  id: string;
  category: string;
  amount: number;
}

interface Category {
  id: string;
  name: string;
  icon: string;
}

interface BudgetManagerProps {
  onClose: () => void;
}

export function BudgetManager({ onClose }: BudgetManagerProps) {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState("_overall_");
  const [amount, setAmount] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    Promise.all([getBudgets(), getCategories()])
      .then(([b, c]) => {
        setBudgets(b as Budget[]);
        setCategories(c as Category[]);
      })
      .finally(() => setIsLoading(false));
  }, []);

  async function handleSave() {
    const parsed = parseFloat(amount);
    if (!parsed || parsed <= 0) return;
    setIsSaving(true);
    try {
      const saved = await upsertBudget({ category: selectedCategory, amount: parsed });
      setBudgets((prev) => {
        const idx = prev.findIndex((b) => b.category === saved.category);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = saved;
          return next;
        }
        return [...prev, saved].sort((a, b) => a.category.localeCompare(b.category));
      });
      setAmount("");
      setSelectedCategory("_overall_");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(id: string) {
    await deleteBudget(id);
    setBudgets((prev) => prev.filter((b) => b.id !== id));
  }

  const usedCategories = new Set(budgets.map((b) => b.category));
  const availableCategories = categories.filter((c) => !usedCategories.has(c.name));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="card w-full max-w-md space-y-4" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-1 h-4 rounded-full bg-indigo-500 opacity-60" />
            <h2 className="text-sm font-semibold text-slate-200">Manage Budgets</h2>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Existing budgets */}
        {isLoading ? (
          <div className="py-4 text-center text-sm text-slate-500">Loading…</div>
        ) : budgets.length === 0 ? (
          <p className="text-sm text-slate-500 py-2">No budgets set yet.</p>
        ) : (
          <div className="space-y-2">
            {budgets.map((b) => (
              <div key={b.id} className="flex items-center justify-between py-2 border-b border-slate-700/50">
                <div>
                  <p className="text-sm text-slate-200 font-medium">
                    {b.category === "_overall_" ? "Overall (monthly)" : b.category}
                  </p>
                  <p className="text-xs text-slate-500 tabular-nums">{formatCurrency(b.amount)} / month</p>
                </div>
                <button
                  onClick={() => handleDelete(b.id)}
                  className="text-xs text-rose-400 hover:text-rose-300 transition-colors"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add new budget */}
        <div className="space-y-3 pt-2">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Add / Update Budget</p>
          <div className="flex gap-2">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="input-base flex-1 text-sm"
            >
              <option value="_overall_">Overall (monthly)</option>
              {availableCategories.map((c) => (
                <option key={c.id} value={c.name}>{c.icon} {c.name}</option>
              ))}
              {/* Show already-set categories too for editing */}
              {budgets.filter(b => b.category !== "_overall_").map(b => (
                <option key={b.category} value={b.category}>{b.category} (edit)</option>
              ))}
            </select>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Amount"
              min="0"
              step="0.01"
              className="input-base w-32 text-sm tabular-nums"
            />
          </div>
          <button
            onClick={handleSave}
            disabled={isSaving || !amount}
            className="btn-primary w-full text-sm"
          >
            {isSaving ? "Saving…" : "Save Budget"}
          </button>
        </div>
      </div>
    </div>
  );
}
