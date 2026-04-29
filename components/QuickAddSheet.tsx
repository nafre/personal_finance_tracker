"use client";

import { cn } from "@/lib/utils";
import { ExpenseInput, type AddedTx } from "@/components/ExpenseInput";

interface QuickAddSheetProps {
  open: boolean;
  onClose: () => void;
  recentCategories: string[];
  onAdd: (tx: AddedTx) => void;
  onReplace?: (tempId: string, realTx: AddedTx) => void;
  onRemove?: (tempId: string) => void;
}

export function QuickAddSheet({ open, onClose, recentCategories, onAdd, onReplace, onRemove }: QuickAddSheetProps) {
  if (!open) return null;

  function handleAddAndClose(tx: AddedTx) {
    onAdd(tx);
    onClose();
  }

  return (
    <>
      <div className="bottom-sheet-overlay" onClick={onClose} />
      <div
        className={cn("bottom-sheet", open ? "translate-y-0" : "translate-y-full")}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bottom-sheet-handle" />
        <div className="px-4 pb-4">
          <ExpenseInput
            autoFocus
            recentCategories={recentCategories}
            onAdd={handleAddAndClose}
            onReplace={onReplace}
            onRemove={onRemove}
          />
        </div>
      </div>
    </>
  );
}
