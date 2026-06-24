"use client";

import { useRouter, usePathname } from "next/navigation";
import { getMonthName, getPrevMonth, getNextMonth } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { Period } from "@/types";

interface MonthSelectorProps {
  period: Period;
  month: number;
  year: number;
  // The transactions page reuses this control for month stepping only.
  showPeriodToggle?: boolean;
}

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
  { value: "all", label: "All-time" },
];

export function MonthSelector({ period, month, year, showPeriodToggle = true }: MonthSelectorProps) {
  const router = useRouter();
  const pathname = usePathname();

  function go(next: { period: Period; month?: number; year?: number }) {
    const params = new URLSearchParams();
    params.set("period", next.period);
    if (next.month != null) params.set("month", String(next.month));
    if (next.year != null) params.set("year", String(next.year));
    router.push(`${pathname}?${params.toString()}`);
  }

  function switchPeriod(p: Period) {
    if (p === "all") go({ period: "all" });
    else go({ period: p, month, year });
  }

  const now = new Date();
  const isCurrentMonth = month === now.getMonth() + 1 && year === now.getFullYear();
  const isCurrentYear = year === now.getFullYear();

  return (
    <div data-testid="period-selector" className="flex items-center gap-3">
      {/* Period toggle */}
      {showPeriodToggle && (
      <div className="inline-flex rounded-lg bg-slate-800/60 p-0.5 border border-slate-700">
        {PERIOD_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => switchPeriod(opt.value)}
            className={cn(
              "px-2.5 py-1 text-xs font-medium rounded-md transition-colors",
              period === opt.value
                ? "bg-indigo-500/20 text-indigo-300"
                : "text-slate-400 hover:text-slate-200"
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
      )}

      {/* Stepper — month mode */}
      {period === "month" && (
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const p = getPrevMonth(month, year);
              go({ period: "month", month: p.month, year: p.year });
            }}
            className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-100 transition-colors"
            aria-label="Previous month"
          >
            ←
          </button>
          <div className="text-center min-w-[120px]">
            <p className="font-semibold text-slate-100">
              {getMonthName(month)} {year}
            </p>
            {isCurrentMonth && (
              <p className="text-xs text-indigo-400 font-medium">Current month</p>
            )}
          </div>
          <button
            onClick={() => {
              const n = getNextMonth(month, year);
              go({ period: "month", month: n.month, year: n.year });
            }}
            disabled={isCurrentMonth}
            className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Next month"
          >
            →
          </button>
        </div>
      )}

      {/* Stepper — year mode */}
      {period === "year" && (
        <div className="flex items-center gap-2">
          <button
            onClick={() => go({ period: "year", month, year: year - 1 })}
            className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-100 transition-colors"
            aria-label="Previous year"
          >
            ←
          </button>
          <div className="text-center min-w-[80px]">
            <p className="font-semibold text-slate-100">{year}</p>
            {isCurrentYear && (
              <p className="text-xs text-indigo-400 font-medium">This year</p>
            )}
          </div>
          <button
            onClick={() => go({ period: "year", month, year: year + 1 })}
            disabled={isCurrentYear}
            className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Next year"
          >
            →
          </button>
        </div>
      )}

      {/* All-time label */}
      {period === "all" && (
        <div className="text-center min-w-[80px]">
          <p className="font-semibold text-slate-100">All time</p>
        </div>
      )}
    </div>
  );
}
