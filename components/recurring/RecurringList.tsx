"use client";

import { useState, useEffect } from "react";
import { RecurringRow } from "./RecurringRow";
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

interface PostedTransaction {
  id: string;
  category: string;
  amount: number;
  type: string;
  note: string | null;
  date: Date | string;
  labels: string[];
}

interface RecurringListProps {
  initialRecurring: RecurringTransaction[];
  onTransactionPosted?: (tx: PostedTransaction) => void;
}

export function RecurringList({ initialRecurring, onTransactionPosted }: RecurringListProps) {
  const [items, setItems] = useState<RecurringTransaction[]>(initialRecurring);
  const [showForm, setShowForm] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Sync state when server sends fresh data (after revalidatePath)
  useEffect(() => {
    setItems(initialRecurring);
  }, [initialRecurring]);

  function handlePosted(postedId: string, updatedRec: RecurringTransaction) {
    setItems((prev) => prev.map((r) => (r.id === postedId ? updatedRec : r)));
  }

  function handleDeleted(id: string) {
    setItems((prev) => prev.filter((r) => r.id !== id));
    setDeleteError(null);
  }

  function handleRestored(rec: RecurringTransaction) {
    setItems((prev) => [...prev, rec]);
  }

  function handleSkipped(updated: RecurringTransaction) {
    setItems((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
  }

  function handleUpdated(updated: RecurringTransaction) {
    setItems((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
  }

  function handleCreated(rec: RecurringTransaction) {
    setItems((prev) => [...prev, rec]);
    setShowForm(false);
  }

  if (items.length === 0 && !showForm) {
    return (
      <div className="text-center py-4">
        <p className="text-sm text-slate-500 mb-3">No recurring transactions yet.</p>
        <button
          onClick={() => setShowForm(true)}
          className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors font-medium"
        >
          + Add recurring
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {deleteError && (
        <p className="text-xs text-rose-400 px-3 pb-1">{deleteError}</p>
      )}
      {items.map((rec) => (
        <RecurringRow
          key={rec.id}
          rec={rec}
          onPosted={handlePosted}
          onSkipped={handleSkipped}
          onDeleted={handleDeleted}
          onRestored={handleRestored}
          onDeleteError={setDeleteError}
          onUpdated={handleUpdated}
          onTransactionPosted={onTransactionPosted}
        />
      ))}

      {showForm ? (
        <RecurringForm
          onSave={(rec) => handleCreated(rec as RecurringTransaction)}
          onCancel={() => setShowForm(false)}
        />
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="w-full py-2 text-sm text-slate-500 hover:text-indigo-400 transition-colors border border-dashed border-slate-700 hover:border-indigo-500 rounded-xl"
        >
          + Add recurring
        </button>
      )}
    </div>
  );
}
