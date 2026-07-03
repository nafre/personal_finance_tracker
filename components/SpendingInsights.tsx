"use client";

import { cn, formatCurrency } from "@/lib/utils";
import { ArrowDown, ArrowUp } from "lucide-react";

interface CategoryData {
  name: string;
  value: number;
}

interface SpendingInsightsProps {
  categoryData: CategoryData[];
  prevCategoryData: CategoryData[];
  month: number;
  year: number;
  // Burn rate / pace badge are month-specific; suppressed when false.
  monthView?: boolean;
}

type PaceStatus = "under" | "over" | "on";

export function SpendingInsights({
  categoryData,
  prevCategoryData,
  month,
  year,
  monthView = true,
}: SpendingInsightsProps) {
  const today = new Date();
  const isCurrentMonth =
    monthView && today.getMonth() + 1 === month && today.getFullYear() === year;

  const daysInMonth = new Date(year, month, 0).getDate();
  const daysElapsed = isCurrentMonth ? today.getDate() : daysInMonth;

  // Chart-basis total: sum of the (already excludeFromStats-filtered) category
  // data. Keeps the bars, burn rate, and pace badge consistent with the pie /
  // trend charts — off-chart transactions are uniformly absent here too.
  const chartTotal = categoryData.reduce((s, c) => s + c.value, 0);
  const dailyBurnRate = daysElapsed > 0 ? chartTotal / daysElapsed : 0;

  const prevTotal = prevCategoryData.reduce((s, c) => s + c.value, 0);
  const targetDailyRate = prevTotal > 0 ? prevTotal / daysInMonth : 0;

  const paceStatus: PaceStatus =
    targetDailyRate === 0
      ? "on"
      : dailyBurnRate > targetDailyRate * 1.1
      ? "over"
      : dailyBurnRate < targetDailyRate * 0.9
      ? "under"
      : "on";

  const prevCategoryMap = new Map(prevCategoryData.map((c) => [c.name, c.value]));
  const top5 = categoryData.slice(0, 5);

  const paceConfig: Record<PaceStatus, { label: string; className: string }> = {
    over: { label: "Overpacing", className: "bg-rose-500/20 text-rose-400" },
    under: { label: "Underpacing", className: "bg-emerald-500/20 text-emerald-400" },
    on: { label: "On pace", className: "bg-slate-700 text-slate-300" },
  };

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-300">Top spending</h3>
        {isCurrentMonth && targetDailyRate > 0 && (
          <span
            className={cn(
              "text-xs font-medium px-2 py-0.5 rounded-full",
              paceConfig[paceStatus].className
            )}
          >
            {paceConfig[paceStatus].label}
          </span>
        )}
      </div>

      {top5.length === 0 ? (
        <p className="text-sm text-slate-500 text-center py-4">No expense data</p>
      ) : (
        top5.map((cat) => {
          const pct = chartTotal > 0 ? (cat.value / chartTotal) * 100 : 0;
          const prevVal = prevCategoryMap.get(cat.name);
          const momDelta =
            prevVal != null && prevVal > 0
              ? ((cat.value - prevVal) / prevVal) * 100
              : null;

          return (
            <div key={cat.name} className="mb-3 last:mb-0">
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-slate-300 font-medium">
                  {cat.name}
                  {!monthView && (
                    <span className="text-slate-500 font-normal ml-1.5 tabular-nums">
                      {pct.toFixed(0)}%
                    </span>
                  )}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-slate-400 tabular-nums">
                    {formatCurrency(cat.value)}
                  </span>
                  {momDelta != null && isFinite(momDelta) && (
                    <span
                      className={cn(
                        "font-medium inline-flex items-center",
                        momDelta > 0 ? "text-rose-400" : "text-emerald-400"
                      )}
                    >
                      {momDelta > 0 ? (
                        <ArrowUp className="w-3 h-3" aria-hidden="true" />
                      ) : (
                        <ArrowDown className="w-3 h-3" aria-hidden="true" />
                      )}
                      {Math.abs(momDelta).toFixed(0)}%
                      <span className="sr-only"> vs last month</span>
                    </span>
                  )}
                </div>
              </div>
              <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })
      )}

      {monthView && (
        <div className="mt-4 pt-3 border-t border-slate-800 flex justify-between text-xs text-slate-500">
          <span>Daily avg</span>
          <span className="text-slate-300 font-medium tabular-nums">
            {formatCurrency(dailyBurnRate)}/day
          </span>
        </div>
      )}
    </div>
  );
}
