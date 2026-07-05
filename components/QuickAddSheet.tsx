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
  categories?: CategoryOption[];
  onAdd: (tx: AddedTx) => void;
  onReplace?: (tempId: string, realTx: AddedTx) => void;
  onRemove?: (tempId: string) => void;
}

export function QuickAddSheet({ open, onClose, recentCategories, categories, onAdd, onReplace, onRemove }: QuickAddSheetProps) {
  // Keep mounted through the exit so the slide-down can play; `visible` flips a
  // frame after mount so the enter transition runs too. Focus/Escape behavior
  // keys off `visible` — the container must exist before it tries to focus.
  const { mounted, visible } = usePresence(open, 300);
  const sheetRef = useDialogBehavior(visible, onClose);

  if (!mounted) return null;

  function handleAddAndClose(tx: AddedTx) {
    onAdd(tx);
    onClose();
  }

  return (
    <>
      <div
        className={cn(
          "bottom-sheet-overlay transition-opacity duration-300",
          visible ? "opacity-100" : "opacity-0"
        )}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label="Quick add transaction"
        className={cn("bottom-sheet", visible ? "translate-y-0" : "translate-y-full")}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bottom-sheet-handle" aria-hidden="true" />
        <div className="px-4 pb-4">
          <ExpenseInput
            autoFocus
            recentCategories={recentCategories}
            categories={categories}
            onAdd={handleAddAndClose}
            onReplace={onReplace}
            onRemove={onRemove}
          />
        </div>
      </div>
    </>
  );
}
