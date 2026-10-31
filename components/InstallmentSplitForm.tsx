"use client";

import { useState } from "react";
import { createInstallmentPlan } from "@/lib/actions";
import { evaluateAmountInput, normalizeAmountOnBlur } from "@/lib/math-eval";
import {
  cn,
  formatCurrency,
  formatDate,
  getInstallmentAmount,
  getRuleOverdueDates,
  splitInstallmentAmount,
  stepAnchored,
  toLocalISODate,
  type RecurringFrequency,
} from "@/lib/utils";

type Mode = "total" | "each";

interface SourceTransaction {
  id: string;
  category: string;
  amount: number;
  type: string;
  note?: string | null;
  labels?: string[];
  date: Date | string;
}

type PlanResult = Awaited<ReturnType<typeof createInstallmentPlan>>;

interface InstallmentSplitFormProps {
  tx: SourceTransaction;
  /** The plan was created and `tx` no longer exists server-side. */
  onDone: (result: PlanResult) => void;
  onCancel: () => void;
}

// Turns an existing transaction into an installment plan: the transaction is
// replaced by the plan's first charge(s), the rest are posted from the
// recurring list as they fall due.
export function InstallmentSplitForm({ tx, onDone, onCancel }: InstallmentSplitFormProps) {
  const [mode, setMode] = useState<Mode>("total");
  const [amount, setAmount] = useState(tx.amount.toString());
  const [count, setCount] = useState("12");
  const [frequency, setFrequency] = useState<RecurringFrequency>("monthly");
  const [firstCharge, setFirstCharge] = useState(toLocalISODate(new Date(tx.date)));
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const parsedAmount = evaluateAmountInput(amount);
  const parsedCount = /^\d+$/.test(count.trim()) ? Number(count) : NaN;
  const valid =
    parsedAmount !== null &&
    parsedAmount > 0 &&
    parsedCount >= 2 &&
    parsedCount <= 120 &&
    /^\d{4}-\d{2}-\d{2}$/.test(firstCharge);

  // Live preview, computed with the same helpers the server uses.
  let summary: { each: number; last: number; postedNow: number; nextCharge: Date | null } | null = null;
  if (valid) {
    const each = mode === "total" ? splitInstallmentAmount(parsedAmount, parsedCount) : parsedAmount;
    if (each > 0) {
      const total = mode === "total" ? parsedAmount : Math.round(each * parsedCount * 100) / 100;
      const start = new Date(firstCharge);
      const rule = {
        frequency,
        startDate: start,
        lastRun: null,
        amount: each,
        installmentCount: parsedCount,
        installmentsPosted: 0,
        installmentTotal: total,
      };
      const dueNow = getRuleOverdueDates(rule, new Date(`${toLocalISODate()}T23:59:59.999Z`));
      const nextCharge =
        dueNow.length >= parsedCount
          ? null
          : dueNow.length === 0
          ? start
          : stepAnchored(frequency, dueNow[dueNow.length - 1], start.getDate());
      summary = {
        each,
        last: getInstallmentAmount(rule, parsedCount),
        postedNow: dueNow.length,
        nextCharge,
      };
    }
  }

  function handleSubmit() {
    if (!valid || !summary) {
      setError("Enter an amount, 2–120 payments, and a first charge date.");
      return;
    }
    setError("");
    setIsSaving(true);
    createInstallmentPlan({
      name: tx.note?.trim() || tx.category,
      category: tx.category,
      type: tx.type as "income" | "expense",
      frequency,
      count: parsedCount,
      ...(mode === "total" ? { total: parsedAmount as number } : { amount: parsedAmount as number }),
      firstChargeDate: new Date(firstCharge),
      today: toLocalISODate(),
      note: tx.note?.trim() || undefined,
      labels: tx.labels ?? [],
      sourceTransactionId: tx.id,
    })
      .then(onDone)
      .catch(() => {
        setError("Couldn't create the plan — please try again.");
        setIsSaving(false);
      });
  }

  return (
    <div
      data-testid="installment-split-form"
      className={cn(
        "space-y-3 p-3 bg-slate-900/60 rounded-xl border border-slate-700",
        isSaving && "opacity-50 pointer-events-none"
      )}
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h4 className="text-sm font-semibold text-slate-200">Split into installments</h4>
        <div className="flex rounded-lg overflow-hidden border border-slate-700 text-xs font-medium">
          {(["total", "each"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              aria-pressed={mode === m}
              className={cn(
                "px-3 py-2 transition-colors",
                mode === m ? "bg-brand text-white" : "bg-slate-800 text-slate-400 hover:bg-slate-700"
              )}
            >
              {m === "total" ? "Total" : "Per payment"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-slate-400 mb-1 block">
            {mode === "total" ? "Total (RM)" : "Each payment (RM)"}
          </label>
          <input
            className="input-base w-full text-base sm:text-sm"
            type="text"
            inputMode="decimal"
            aria-label={mode === "total" ? "Plan total" : "Amount per payment"}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onBlur={() => setAmount((v) => normalizeAmountOnBlur(v))}
          />
        </div>
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Payments</label>
          <input
            className="input-base w-full text-base sm:text-sm"
            type="text"
            inputMode="numeric"
            aria-label="Number of payments"
            value={count}
            onChange={(e) => setCount(e.target.value)}
          />
        </div>
        {/* Full-width on mobile: a date input clips in a half-width column */}
        <div className="col-span-2 sm:col-span-1">
          <label className="text-xs text-slate-400 mb-1 block">Charged</label>
          <select
            className="input-base w-full text-base sm:text-sm"
            aria-label="Charge frequency"
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as RecurringFrequency)}
          >
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label className="text-xs text-slate-400 mb-1 block">First charge date</label>
          <input
            className="input-base w-full text-base sm:text-sm"
            type="date"
            aria-label="First charge date"
            value={firstCharge}
            onChange={(e) => setFirstCharge(e.target.value)}
          />
        </div>
      </div>

      {summary && (
        <p data-testid="installment-summary" className="text-xs text-slate-400">
          {parsedCount} × <span className="tabular-nums text-slate-200">{formatCurrency(summary.each)}</span>
          {summary.last !== summary.each && (
            <>
              {" "}(last <span className="tabular-nums text-slate-200">{formatCurrency(summary.last)}</span>)
            </>
          )}
          {" · "}
          {summary.postedNow > 0 ? `${summary.postedNow} posted now` : "nothing posted yet"}
          {summary.nextCharge && ` · next charge ${formatDate(summary.nextCharge)}`}
        </p>
      )}
      <p className="text-[11px] text-slate-500">
        Replaces this transaction. Later charges appear under Recurring on the dashboard when they fall due.
      </p>

      {error && <p role="alert" className="text-rose-400 text-xs">{error}</p>}

      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className="btn-ghost text-sm px-3 py-2">
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isSaving || !summary}
          className="btn-primary text-sm px-4 py-2 disabled:opacity-50"
        >
          {isSaving ? "Creating…" : "Create plan"}
        </button>
      </div>
    </div>
  );
}
