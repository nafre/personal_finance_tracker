"use client";

import { formatCurrency, cn } from "@/lib/utils";

interface BudgetProgressProps {
  category: string;
  budget: number;
  spent: number;
  className?: string;
}

export function BudgetProgress({ category, budget, spent, className }: BudgetProgressProps) {
  const pct = budget > 0 ? Math.min((spent / budget) * 100, 100) : 0;
  const isOver = spent > budget;
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

  const label = category === "_overall_" ? "Overall" : category;

  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-300 font-medium truncate">{label}</span>
        <span className={cn("tabular-nums shrink-0 ml-2", textColor)}>
          {formatCurrency(spent)} / {formatCurrency(budget)}
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
          ? `${formatCurrency(spent - budget)} over budget`
          : `${formatCurrency(budget - spent)} remaining`}
      </p>
    </div>
  );
}
