"use client";

import { cn } from "@/lib/utils";
import { ExpenseInput } from "@/components/ExpenseInput";

interface QuickAddSheetProps {
  open: boolean;
  onClose: () => void;
  recentCategories: string[];
  onAdd: (tx: {
    id: string;
    category: string;
    amount: number;
    type: "income" | "expense";
    note?: string;
    labels: string[];
    date: Date | string;
    isPending?: boolean;
  }) => void;
}

export function QuickAddSheet({ open, onClose, recentCategories, onAdd }: QuickAddSheetProps) {
  if (!open) return null;

  function handleAddAndClose(tx: Parameters<QuickAddSheetProps["onAdd"]>[0]) {
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
          />
        </div>
      </div>
    </>
  );
}
