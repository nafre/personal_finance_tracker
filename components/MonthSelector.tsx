"use client";

import { useRouter, usePathname } from "next/navigation";
import { getMonthName, getPrevMonth, getNextMonth } from "@/lib/utils";

interface MonthSelectorProps {
  month: number;
  year: number;
}

export function MonthSelector({ month, year }: MonthSelectorProps) {
  const router = useRouter();
  const pathname = usePathname();

  function navigate(m: number, y: number) {
    router.push(`${pathname}?month=${m}&year=${y}`);
  }

  const prev = getPrevMonth(month, year);
  const next = getNextMonth(month, year);
  const now = new Date();
  const isCurrentMonth = month === now.getMonth() + 1 && year === now.getFullYear();

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={() => navigate(prev.month, prev.year)}
        className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-100 transition-colors"
        aria-label="Previous month"
      >
        ←
      </button>

      <div className="text-center min-w-[140px]">
        <p className="font-semibold text-slate-100">
          {getMonthName(month)} {year}
        </p>
        {isCurrentMonth && (
          <p className="text-xs text-indigo-400 font-medium">Current month</p>
        )}
      </div>

      <button
        onClick={() => navigate(next.month, next.year)}
        disabled={isCurrentMonth}
        className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        aria-label="Next month"
      >
        →
      </button>
    </div>
  );
}
