"use client";

import { useState } from "react";
import { cn, formatCurrency, getNextDueDate, getRecurringStatus, type RecurringFrequency } from "@/lib/utils";
import { postRecurringTransaction, deleteRecurringTransaction } from "@/lib/actions";
import { RecurringForm } from "./RecurringForm";

interface RecurringTransaction {
  id: string;
  userId: string;
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
  createdAt: Date;
  updatedAt: Date;
}

interface RecurringRowProps {
  rec: RecurringTransaction;
  onPosted: (postedId: string, updatedRec: RecurringTransaction) => void;
  onDeleted: (id: string) => void;
  onUpdated: (rec: RecurringTransaction) => void;
}

const FREQ_LABELS: Record<string, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  yearly: "Yearly",
};

function formatRelativeDate(date: Date): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff > 0) return `in ${diff}d`;
  return `${Math.abs(diff)}d ago`;
}

export function RecurringRow({ rec, onPosted, onDeleted, onUpdated }: RecurringRowProps) {
  const [editing, setEditing] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const nextDue = getNextDueDate(
    rec.frequency as RecurringFrequency,
    new Date(rec.startDate),
    rec.lastRun ? new Date(rec.lastRun) : null
  );
  const status = getRecurringStatus(nextDue, rec.endDate ? new Date(rec.endDate) : null);

  async function handlePost() {
    setIsPosting(true);
    try {
      await postRecurringTransaction(rec.id);
      onPosted(rec.id, { ...rec, lastRun: new Date() });
    } finally {
      setIsPosting(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete "${rec.name}"?`)) return;
    setIsDeleting(true);
    try {
      await deleteRecurringTransaction(rec.id);
      onDeleted(rec.id);
    } finally {
      setIsDeleting(false);
    }
  }

  if (editing) {
    return (
      <RecurringForm
        initial={{
          id: rec.id,
          name: rec.name,
          category: rec.category,
          amount: rec.amount,
          type: rec.type as "income" | "expense",
          frequency: rec.frequency as RecurringFrequency,
          startDate: new Date(rec.startDate).toISOString().split("T")[0],
          endDate: rec.endDate ? new Date(rec.endDate).toISOString().split("T")[0] : undefined,
          note: rec.note ?? undefined,
        }}
        onSave={(updated) => {
          onUpdated(updated as RecurringTransaction);
          setEditing(false);
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  const statusConfig = {
    overdue: { label: "Overdue", cls: "bg-rose-500/20 text-rose-400 border-rose-500/30" },
    due: { label: "Due Today", cls: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
    upcoming: { label: formatRelativeDate(nextDue), cls: "bg-slate-700/60 text-slate-400 border-slate-600" },
    ended: { label: "Ended", cls: "bg-slate-700/30 text-slate-500 border-slate-700" },
  };

  const { label: statusLabel, cls: statusCls } = statusConfig[status];
  const canPost = status === "due" || status === "overdue";

  return (
    <div className={cn(
      "flex items-center gap-3 py-3 px-3 rounded-xl border transition-colors",
      status === "ended"
        ? "border-slate-800 opacity-50"
        : "border-slate-700/60 hover:border-slate-600"
    )}>
      {/* Type dot */}
      <div className={cn(
        "w-2 h-2 rounded-full shrink-0",
        rec.type === "income" ? "bg-emerald-500" : "bg-rose-500"
      )} />

      {/* Main info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-slate-200 truncate">{rec.name}</span>
          <span className="text-xs text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded">
            {FREQ_LABELS[rec.frequency] ?? rec.frequency}
          </span>
          {rec.note && (
            <span className="text-xs text-slate-500 truncate hidden sm:inline">{rec.note}</span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className={cn(
            "text-sm font-semibold",
            rec.type === "income" ? "text-emerald-400" : "text-rose-400"
          )}>
            {rec.type === "income" ? "+" : "-"}{formatCurrency(rec.amount)}
          </span>
          <span className="text-xs text-slate-500">{rec.category}</span>
        </div>
      </div>

      {/* Status badge */}
      <span className={cn(
        "text-xs px-2 py-1 rounded-lg border shrink-0 hidden sm:inline",
        statusCls
      )}>
        {statusLabel}
      </span>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        {canPost && (
          <button
            onClick={handlePost}
            disabled={isPosting}
            title="Post now"
            className={cn(
              "text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50",
              status === "overdue"
                ? "bg-rose-600 hover:bg-rose-500 text-white"
                : "bg-amber-600 hover:bg-amber-500 text-white"
            )}
          >
            {isPosting ? "…" : "Post"}
          </button>
        )}
        <button
          onClick={() => setEditing(true)}
          title="Edit"
          className="p-1.5 text-slate-500 hover:text-slate-300 transition-colors rounded"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        </button>
        <button
          onClick={handleDelete}
          disabled={isDeleting}
          title="Delete"
          className="p-1.5 text-slate-600 hover:text-rose-400 transition-colors rounded disabled:opacity-50"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    </div>
  );
}
