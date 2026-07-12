"use client";

import { cn } from "@/lib/utils";
import { ExpenseInput, type AddedTx } from "@/components/ExpenseInput";
import { useDialogBehavior } from "@/hooks/useDialogBehavior";
import { usePresence } from "@/hooks/usePresence";
import type { CategoryOption } from "@/types";

interface QuickAddSheetProps {
  open: boolean;
  onClose: () => void;
  recentCategories: string[];
  recentTransactions?: { amount: number; category: string; date: Date | string }[];
  categories?: CategoryOption[];
  onAdd: (tx: AddedTx) => void;
  onReplace?: (tempId: string, realTx: AddedTx) => void;
  onRemove?: (tempId: string) => void;
}

export function QuickAddSheet({ open, onClose, recentCategories, recentTransactions, categories, onAdd, onReplace, onRemove }: QuickAddSheetProps) {
  // Keep mounted through the exit so the slide-down can play; `visible` flips a
  // frame after mount so the enter transition runs too. The dialog keys off
  // `mounted`, not `visible` — closing it early would display:none the sheet
  // and swallow the exit animation.
  const { mounted, visible } = usePresence(open, 300);
  const sheetRef = useDialogBehavior(mounted, onClose);

  if (!mounted) return null;

  function handleAddAndClose(tx: AddedTx) {
    onAdd(tx);
    onClose();
  }

  return (
    <dialog
      ref={sheetRef}
      aria-label="Quick add transaction"
      className="dialog-shell bg-transparent"
    >
      <div
        className={cn(
          "bottom-sheet-overlay transition-opacity duration-300",
          visible ? "opacity-100" : "opacity-0"
        )}
        onClick={onClose}
        aria-hidden="true"
      />
      <div className={cn("bottom-sheet", visible ? "translate-y-0" : "translate-y-full")}>
        <div className="bottom-sheet-handle" aria-hidden="true" />
        <div className="px-4 pb-4">
          <ExpenseInput
            autoFocus
            recentCategories={recentCategories}
            recentTransactions={recentTransactions}
            categories={categories}
            onAdd={handleAddAndClose}
            onReplace={onReplace}
            onRemove={onRemove}
          />
        </div>
      </div>
    </dialog>
  );
}
