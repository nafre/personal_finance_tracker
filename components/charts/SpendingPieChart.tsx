"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { formatCurrency, stringToColor } from "@/lib/utils";
import { useChartAnimation } from "@/hooks/useChartAnimation";
import type { CategoryData, CategoryOption } from "@/types";

interface SpendingPieChartProps {
  /** Chart-basis category breakdown (excludeFromStats filtered), sorted desc. */
  categoryData: CategoryData[];
  /** Category metadata for stored colours; falls back to stringToColor. */
  categories: CategoryOption[];
  month: number;
  year: number;
}

const MAX_SLICES = 6;
const OTHER_COLOR = "#475569"; // slate-600

interface Slice {
  name: string;
  value: number;
  color: string;
  isOther?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function DonutTooltip({ active, payload, total }: any) {
  if (active && payload?.length) {
    const p = payload[0];
    const pct = total > 0 ? ((p.value / total) * 100).toFixed(0) : "0";
    return (
      <div className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm shadow-xl">
        <div className="flex justify-between gap-3 items-center">
          <span style={{ color: p.payload.color }} className="text-xs">{p.name}</span>
          <span className="font-semibold text-white">
            {formatCurrency(p.value)} · {pct}%
          </span>
        </div>
      </div>
    );
  }
  return null;
}

// Donut of the period's expense breakdown by category. Centre label shows the
// chart-basis total; slice / legend click drills into the transactions page
// filtered to that category and month.
export function SpendingPieChart({ categoryData, categories, month, year }: SpendingPieChartProps) {
  const router = useRouter();
  const anim = useChartAnimation();

  const { slices, total } = useMemo(() => {
    const total = categoryData.reduce((s, c) => s + c.value, 0);
    const colorByName = new Map(categories.map((c) => [c.name, c.color]));
    const top = categoryData.slice(0, MAX_SLICES);
    const rest = categoryData.slice(MAX_SLICES);

    const slices: Slice[] = top.map((c) => ({
      name: c.name,
      value: c.value,
      color: colorByName.get(c.name) ?? stringToColor(c.name),
    }));
    const otherValue = rest.reduce((s, c) => s + c.value, 0);
    if (otherValue > 0) {
      slices.push({
        name: "Other",
        value: Math.round(otherValue * 100) / 100,
        color: OTHER_COLOR,
        isOther: true,
      });
    }
    return { slices, total };
  }, [categoryData, categories]);

  function drillDown(slice: Slice) {
    if (slice.isOther) return; // aggregate slice — no single category to filter by
    router.push(
      `/transactions?month=${month}&year=${year}&category=${encodeURIComponent(slice.name)}`
    );
  }

  return (
    <div data-testid="category-donut" className="card animate-fade-in">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-1 h-4 rounded-full bg-indigo-500 opacity-60" />
        <h3 className="text-sm font-semibold text-slate-200">Category Breakdown</h3>
      </div>

      {slices.length === 0 ? (
        <div className="flex items-center justify-center h-[200px] text-slate-500 text-sm">
          No expense data
        </div>
      ) : (
        <>
          <div className="relative">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart accessibilityLayer={false}>
                <Tooltip content={<DonutTooltip total={total} />} />
                <Pie
                  data={slices}
                  dataKey="value"
                  nameKey="name"
                  innerRadius="64%"
                  outerRadius="95%"
                  paddingAngle={2}
                  stroke="#0f172a"
                  strokeWidth={2}
                  onClick={(_, index) => drillDown(slices[index])}
                  {...anim}
                >
                  {slices.map((s) => (
                    <Cell
                      key={s.name}
                      fill={s.color}
                      cursor={s.isOther ? "default" : "pointer"}
                    />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            {/* Centre label — HTML (not SVG) so tests can mask the amount */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-lg font-bold text-slate-100 tabular-nums">
                {formatCurrency(total)}
              </span>
              <span className="text-[11px] text-slate-500">spent</span>
            </div>
          </div>

          {/* Legend — buttons so the drilldown is keyboard-accessible too */}
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-3">
            {slices.map((s) => {
              const pct = total > 0 ? (s.value / total) * 100 : 0;
              return (
                <button
                  key={s.name}
                  type="button"
                  onClick={() => drillDown(s)}
                  disabled={s.isOther}
                  aria-label={s.isOther ? "Other categories" : `View ${s.name} transactions`}
                  className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 disabled:hover:text-slate-400 transition-colors rounded-lg px-1 py-1 min-w-0 text-left [@media(hover:none)]:min-h-8"
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: s.color }}
                    aria-hidden="true"
                  />
                  <span className="truncate">{s.name}</span>
                  <span className="ml-auto tabular-nums text-slate-500 shrink-0">
                    {pct.toFixed(0)}%
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
