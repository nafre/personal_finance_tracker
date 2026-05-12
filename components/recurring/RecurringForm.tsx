"use client";

import { useState, useEffect, useTransition } from "react";
import { cn } from "@/lib/utils";
import { createRecurringTransaction, updateRecurringTransaction, getCategories } from "@/lib/actions";
import { CategoryCombobox } from "@/components/CategoryCombobox";
import type { CategoryOption } from "@/types";

type Frequency = "daily" | "weekly" | "monthly" | "yearly";
type TxType = "income" | "expense";

interface RecurringFormData {
  id?: string;
  name: string;
  category: string;
  amount: number;
  type: TxType;
  frequency: Frequency;
  startDate: string;
  endDate?: string;
  note?: string;
}

interface RecurringFormProps {
  initial?: RecurringFormData;
  onSave: (rec: {
    id: string;
    name: string;
    category: string;
    amount: number;
    type: string;
    frequency: string;
    startDate: Date;
    endDate: Date | null;
    lastRun: Date | null;
    isActive: boolean;
    note: string | null;
    userId: string;
    createdAt: Date;
    updatedAt: Date;
  }) => void;
  onCancel: () => void;
}

const today = new Date().toISOString().split("T")[0];

export function RecurringForm({ initial, onSave, onCancel }: RecurringFormProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [amount, setAmount] = useState(initial?.amount?.toString() ?? "");
  const [type, setType] = useState<TxType>(initial?.type ?? "expense");
  const [frequency, setFrequency] = useState<Frequency>(initial?.frequency ?? "monthly");
  const [startDate, setStartDate] = useState(initial?.startDate ?? today);
  const [endDate, setEndDate] = useState(initial?.endDate ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    getCategories().then((cats) =>
      setCategories(cats.map((c) => ({ name: c.name, icon: c.icon, color: c.color })))
    );
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsedAmount = parseFloat(amount);
    if (!name.trim()) return setError("Name is required.");
    if (!category.trim()) return setError("Category is required.");
    if (!parsedAmount || parsedAmount <= 0) return setError("Enter a valid amount.");
    setError("");

    startTransition(async () => {
      try {
        const data = {
          name: name.trim(),
          category: category.trim(),
          amount: parsedAmount,
          type,
          frequency,
          startDate: new Date(startDate),
          endDate: endDate ? new Date(endDate) : undefined,
          note: note.trim() || undefined,
        };

        let rec;
        if (initial?.id) {
          rec = await updateRecurringTransaction(initial.id, {
            ...data,
            endDate: endDate ? new Date(endDate) : null,
          });
        } else {
          rec = await createRecurringTransaction(data);
        }
        onSave(rec);
      } catch {
        setError("Failed to save. Please try again.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 p-4 bg-slate-800/60 rounded-xl border border-slate-700">
      <h3 className="text-sm font-semibold text-slate-200">
        {initial?.id ? "Edit recurring" : "New recurring transaction"}
      </h3>

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="text-xs text-slate-400 mb-1 block">Name</label>
          <input
            className="input-base w-full text-sm"
            placeholder="Monthly Salary"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div>
          <label className="text-xs text-slate-400 mb-1 block">Category</label>
          <CategoryCombobox
            value={category}
            onChange={setCategory}
            categories={categories}
            placeholder="Salary"
          />
        </div>

        <div>
          <label className="text-xs text-slate-400 mb-1 block">Amount (RM)</label>
          <input
            className="input-base w-full text-sm"
            type="number"
            min="0.01"
            step="0.01"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>

        <div>
          <label className="text-xs text-slate-400 mb-1 block">Type</label>
          <div className="flex rounded-lg overflow-hidden border border-slate-700 text-xs font-medium">
            {(["expense", "income"] as TxType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={cn(
                  "flex-1 py-2 transition-colors capitalize",
                  type === t
                    ? t === "income"
                      ? "bg-emerald-600 text-white"
                      : "bg-rose-600 text-white"
                    : "bg-slate-800 text-slate-400 hover:bg-slate-700"
                )}
              >
                {t === "expense" ? "Exp" : "Inc"}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs text-slate-400 mb-1 block">Frequency</label>
          <select
            className="input-base w-full text-sm"
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as Frequency)}
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>
        </div>

        <div>
          <label className="text-xs text-slate-400 mb-1 block">Start date</label>
          <input
            className="input-base w-full text-sm"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>

        <div>
          <label className="text-xs text-slate-400 mb-1 block">End date (optional)</label>
          <input
            className="input-base w-full text-sm"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>

        <div className="col-span-2">
          <label className="text-xs text-slate-400 mb-1 block">Note (optional)</label>
          <input
            className="input-base w-full text-sm"
            placeholder="e.g. EPF deducted"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
      </div>

      {error && <p className="text-rose-400 text-xs">{error}</p>}

      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="btn-primary px-4 py-2 text-sm disabled:opacity-50"
        >
          {isPending ? "Saving…" : initial?.id ? "Update" : "Create"}
        </button>
      </div>
    </form>
  );
}
