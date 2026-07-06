"use client";

import { useState } from "react";
import { cn, formatCurrency, getNextDueDate, getRecurringStatus, countRemainingPayments, countMissedPeriods, isPostedThisPeriod, type RecurringFrequency } from "@/lib/utils";
import { postRecurringTransaction, deleteRecurringTransaction, skipRecurringTransaction, backfillRecurringTransaction } from "@/lib/actions";
import { RecurringForm } from "./RecurringForm";
import { Check, Copy, Pencil, Trash2 } from "lucide-react";

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

interface PostedTransaction {
  id: string;
  category: string;
  amount: number;
  type: string;
  note: string | null;
  date: Date | string;
  labels: string[];
}

interface RecurringRowProps {
  rec: RecurringTransaction;
  onPosted: (postedId: string, updatedRec: RecurringTransaction) => void;
  onSkipped?: (updated: RecurringTransaction) => void;
  onDeleted: (id: string) => void;
  onRestored: (rec: RecurringTransaction) => void;
  onDeleteError: (msg: string) => void;
  onUpdated: (rec: RecurringTransaction) => void;
  onDuplicated: (rec: RecurringTransaction) => void;
  onTransactionPosted?: (tx: PostedTransaction) => void;
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

export function RecurringRow({ rec, onPosted, onSkipped, onDeleted, onRestored, onDeleteError, onUpdated, onDuplicated, onTransactionPosted }: RecurringRowProps) {
  const [editing, setEditing] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [confirmingPost, setConfirmingPost] = useState(false);
  const [confirmingBackfill, setConfirmingBackfill] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const [isBackfilling, setIsBackfilling] = useState(false);
  const [isSkipping, setIsSkipping] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const nextDue = getNextDueDate(
    rec.frequency as RecurringFrequency,
    new Date(rec.startDate),
    rec.lastRun ? new Date(rec.lastRun) : null
  );
  const endDate = rec.endDate ? new Date(rec.endDate) : null;
  const status = getRecurringStatus(nextDue, endDate);
  const remaining = endDate && status !== "ended"
    ? countRemainingPayments(rec.frequency as RecurringFrequency, nextDue, endDate)
    : null;
  const postedThisPeriod = isPostedThisPeriod(
    rec.frequency as RecurringFrequency,
    rec.lastRun ? new Date(rec.lastRun) : null
  );
  const missedCount = countMissedPeriods(
    rec.frequency as RecurringFrequency,
    new Date(rec.startDate),
    rec.lastRun ? new Date(rec.lastRun) : null,
    endDate
  );

  function handlePost() {
    setPostError(null);
    setConfirmingPost(false);
    setIsPosting(true);
    const originalRec = rec;

    // Optimistic: update the row's status immediately
    onPosted(rec.id, { ...rec, lastRun: new Date() });

    postRecurringTransaction(rec.id)
      .then((tx) => onTransactionPosted?.(tx))
      .catch(() => {
        onUpdated(originalRec);
        setPostError("Post failed — please try again.");
      })
      .finally(() => setIsPosting(false));
  }

  function handleBackfill() {
    setPostError(null);
    setConfirmingBackfill(false);
    setIsBackfilling(true);
    // No optimistic patch: the created transactions carry historical dates the
    // client would have to recompute — the row updates from the server result
    // and the dashboard refreshes via revalidatePath.
    backfillRecurringTransaction(rec.id)
      .then((res) => onUpdated(res.recurring as RecurringTransaction))
      .catch(() => setPostError("Backfill failed — please try again."))
      .finally(() => setIsBackfilling(false));
  }

  function handleSkip() {
    setPostError(null);
    setIsSkipping(true);
    const originalRec = rec;
    onSkipped?.({ ...rec, lastRun: nextDue });
    skipRecurringTransaction(rec.id)
      .then((updated) => onSkipped?.(updated as RecurringTransaction))
      .catch(() => {
        onSkipped?.(originalRec);
        setPostError("Skip failed — please try again.");
      })
      .finally(() => setIsSkipping(false));
  }

  function handleDelete() {
    setConfirmingDelete(false);
    setIsDeleting(true);
    // Optimistic: remove from UI immediately, restore on failure
    onDeleted(rec.id);
    deleteRecurringTransaction(rec.id).catch(() => {
      onRestored(rec);
      onDeleteError("Delete failed — please try again.");
      setIsDeleting(false);
    });
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
  const canPost = !postedThisPeriod && (status === "due" || status === "overdue" || status === "upcoming");
  const canSkip = status === "due" || status === "overdue";

  return (
    <>
    <div className={cn(
      "flex flex-wrap sm:flex-nowrap items-center gap-x-3 gap-y-2 py-3 px-3 rounded-xl border transition-colors",
      status === "ended"
        ? "border-slate-800 opacity-50"
        : "border-slate-700/60 hover:border-slate-600"
    )}>
      {/* Type dot */}
      <div className={cn(
        "w-2 h-2 rounded-full shrink-0",
        rec.type === "income" ? "bg-emerald-500" : "bg-rose-500"
      )} />

      {/* Main info — basis-40 sets the wrap threshold: when the actions can't
          fit beside at least 10rem of info, they wrap to their own line */}
      <div className="grow shrink basis-40 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-slate-200 truncate">{rec.name}</span>
          <span className="text-xs text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded-sm">
            {FREQ_LABELS[rec.frequency] ?? rec.frequency}
          </span>
          {/* Mobile: status badge lives here so the right column doesn't squeeze the name */}
          <span className={cn("sm:hidden text-[11px] px-2 py-0.5 rounded-full border shrink-0 whitespace-nowrap", statusCls)}>
            {statusLabel}
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
          {remaining !== null && (
            <span className="text-xs text-slate-500 tabular-nums">
              {remaining} payment{remaining !== 1 ? "s" : ""} left
            </span>
          )}
        </div>
      </div>

      {/* Status badge — desktop position (mobile shows it inline with the name) */}
      <span className={cn(
        "hidden sm:inline text-xs px-2 py-1 rounded-full border shrink-0 whitespace-nowrap",
        statusCls
      )}>
        {statusLabel}
      </span>

      {/* Actions — ml-auto keeps them right-aligned when wrapped to their own line */}
      <div className="flex flex-wrap items-center justify-end gap-1 shrink-0 ml-auto">
        {postedThisPeriod && status !== "ended" && (
          <span className="text-[11px] sm:text-xs px-2 py-0.5 sm:py-1 rounded-full border border-emerald-700/40 bg-emerald-900/20 text-emerald-500 shrink-0 inline-flex items-center gap-1">
            Posted <Check className="w-3 h-3" aria-hidden="true" />
          </span>
        )}
        {canSkip && (
          <button
            onClick={handleSkip}
            disabled={isSkipping || isPosting || isBackfilling}
            title="Skip this occurrence"
            className="text-xs px-2.5 py-2 [@media(hover:none)]:min-h-11 rounded-lg font-medium transition-colors border border-slate-600 text-slate-400 hover:text-slate-200 hover:border-slate-400 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSkipping ? "Skipping…" : "Skip"}
          </button>
        )}
        {/* Backfill — rule is ≥2 periods behind: create every missed instance
            at its historical due date in one go (Post only covers one). */}
        {missedCount >= 2 && (
          confirmingBackfill ? (
            <>
              <button
                onClick={handleBackfill}
                disabled={isBackfilling}
                title={`Create ${missedCount} transactions dated at their original due dates`}
                className="text-xs px-2.5 py-2 [@media(hover:none)]:min-h-11 rounded-lg font-medium bg-rose-600 hover:bg-rose-500 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isBackfilling ? "Backfilling…" : `Create ${missedCount}?`}
              </button>
              <button
                onClick={() => setConfirmingBackfill(false)}
                disabled={isBackfilling}
                className="text-xs text-slate-400 hover:text-slate-200 transition-colors disabled:opacity-50 px-2 py-2 [@media(hover:none)]:min-h-11"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              onClick={() => setConfirmingBackfill(true)}
              disabled={isPosting || isSkipping || isBackfilling}
              title={`Create ${missedCount} missed transactions dated at their original due dates`}
              className="text-xs px-2.5 py-2 [@media(hover:none)]:min-h-11 rounded-lg font-medium transition-colors border border-rose-700/60 text-rose-400 hover:border-rose-500 hover:text-rose-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isBackfilling ? "Backfilling…" : `Backfill ${missedCount}`}
            </button>
          )
        )}
        {canPost && (
          confirmingPost ? (
            <>
              <button
                onClick={handlePost}
                disabled={isPosting}
                title="Confirm post"
                className={cn(
                  "text-xs px-2.5 py-2 [@media(hover:none)]:min-h-11 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
                  status === "overdue"
                    ? "bg-rose-600 hover:bg-rose-500 text-white"
                    : status === "due"
                    ? "bg-amber-600 hover:bg-amber-500 text-white"
                    : "border border-slate-600 text-slate-300 hover:bg-slate-700"
                )}
              >
                {isPosting ? "Posting…" : "Confirm?"}
              </button>
              <button
                onClick={() => setConfirmingPost(false)}
                disabled={isPosting}
                className="text-xs text-slate-400 hover:text-slate-200 transition-colors disabled:opacity-50 px-2 py-2 [@media(hover:none)]:min-h-11"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              onClick={() => setConfirmingPost(true)}
              disabled={isPosting || isSkipping || isBackfilling}
              title="Post now"
              className={cn(
                "text-xs px-2.5 py-2 [@media(hover:none)]:min-h-11 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
                status === "overdue"
                  ? "bg-rose-600 hover:bg-rose-500 text-white"
                  : status === "due"
                  ? "bg-amber-600 hover:bg-amber-500 text-white"
                  : "border border-slate-600 text-slate-300 hover:bg-slate-700"
              )}
            >
              Post
            </button>
          )
        )}
        {confirmingDelete ? (
          <>
            <button
              onClick={handleDelete}
              className="text-xs px-2.5 py-2 [@media(hover:none)]:min-h-11 rounded-lg font-medium bg-rose-600 hover:bg-rose-500 text-white transition-colors"
            >
              Delete?
            </button>
            <button
              onClick={() => setConfirmingDelete(false)}
              className="text-xs text-slate-400 hover:text-slate-200 transition-colors px-2 py-2 [@media(hover:none)]:min-h-11"
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => setEditing(true)}
              disabled={isPosting || isSkipping || isDeleting || isBackfilling}
              title="Edit"
              aria-label={`Edit recurring ${rec.name}`}
              className="p-1.5 text-slate-500 hover:text-slate-300 transition-colors rounded-lg disabled:opacity-50 flex items-center justify-center [@media(hover:none)]:min-h-11 [@media(hover:none)]:min-w-11"
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <button
              onClick={() => setDuplicating(true)}
              disabled={isPosting || isSkipping || isDeleting || isBackfilling || duplicating}
              title="Duplicate"
              aria-label={`Duplicate recurring ${rec.name}`}
              className="p-1.5 text-slate-500 hover:text-slate-300 transition-colors rounded-lg disabled:opacity-50 flex items-center justify-center [@media(hover:none)]:min-h-11 [@media(hover:none)]:min-w-11"
            >
              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <button
              onClick={() => setConfirmingDelete(true)}
              disabled={isDeleting || isPosting || isSkipping || isBackfilling}
              title={isDeleting ? "Deleting…" : "Delete"}
              aria-label={`Delete recurring ${rec.name}`}
              className="p-1.5 text-slate-500 hover:text-rose-400 transition-colors rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center [@media(hover:none)]:min-h-11 [@media(hover:none)]:min-w-11"
            >
              {isDeleting ? (
                <svg className="animate-spin h-3.5 w-3.5 text-rose-400" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              )}
            </button>
          </>
        )}
      </div>
    </div>
    {postError && (
      <p role="alert" className="text-xs text-rose-400 px-3 pb-1">{postError}</p>
    )}
    {/* Duplicate: a create-mode form (no id) prefilled from this rule. The
        start date resets to today, and a past end date is dropped — copying
        it verbatim would create an already-ended (invisible) rule. */}
    {duplicating && (
      <RecurringForm
        initial={{
          name: `${rec.name} (copy)`,
          category: rec.category,
          amount: rec.amount,
          type: rec.type as "income" | "expense",
          frequency: rec.frequency as RecurringFrequency,
          startDate: new Date().toISOString().split("T")[0],
          endDate:
            rec.endDate && new Date(rec.endDate) > new Date()
              ? new Date(rec.endDate).toISOString().split("T")[0]
              : undefined,
          note: rec.note ?? undefined,
        }}
        onSave={(created) => {
          onDuplicated(created as RecurringTransaction);
          setDuplicating(false);
        }}
        onCancel={() => setDuplicating(false)}
      />
    )}
    </>
  );
}
