"use client";

import { formatCurrency, cn } from "@/lib/utils";
import type { Budget } from "@/types";

interface BudgetProgressProps {
  budget: Budget;
  spent: number;
  className?: string;
}

export function BudgetProgress({ budget, spent, className }: BudgetProgressProps) {
  const { amount, name, budgetType, excludedCategories, labels } = budget;
  const pct = amount > 0 ? Math.min((spent / amount) * 100, 100) : 0;
  const isOver = spent > amount;
  const isWarning = !isOver && pct >= 70;

  const barColor = isOver
    ? "bg-rose-500"
    : isWarning
    ? "bg-amber-500"
    : "bg-emerald-500";

  const textColor = isOver
    ? "text-rose-400"
    : isWarning
    ? "text-amber-400"
    : "text-slate-400";

  let subtitle: string | null = null;
  if (budgetType === "excluded" && excludedCategories.length > 0) {
    subtitle = `Excl: ${excludedCategories.join(", ")}`;
  } else if (budgetType === "label" && labels.length > 0) {
    subtitle = `Tagged: ${labels.map((l) => `#${l}`).join(", ")}`;
  }

  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex items-center justify-between text-xs">
        <div className="min-w-0 flex-1 mr-2">
          <span className="text-slate-300 font-medium truncate block">{name}</span>
          {subtitle && (
            <span className="text-slate-500 text-[10px] truncate block">{subtitle}</span>
          )}
        </div>
        <span className={cn("tabular-nums shrink-0", textColor)}>
          {formatCurrency(spent)} / {formatCurrency(amount)}
          {isOver && <span className="ml-1 font-semibold">over</span>}
        </span>
      </div>
      <div className="h-1.5 w-full bg-slate-700 rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-300", barColor)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className={cn("text-xs tabular-nums", isOver ? "text-rose-400" : "text-emerald-400")}>
        {isOver
          ? `${formatCurrency(spent - amount)} over budget`
          : `${formatCurrency(amount - spent)} remaining`}
      </p>
    </div>
  );
}
