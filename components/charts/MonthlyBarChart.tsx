"use client";

import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { formatCurrency } from "@/lib/utils";
import { useChartAnimation } from "@/hooks/useChartAnimation";
import type { DailyData } from "@/types";

interface MonthlyBarChartProps {
  data: DailyData[];
  /** Ledger-basis buckets (includes off-chart transactions). When provided,
      the per-month off-chart expense is stacked on the expense bar as a
      hatched segment. */
  wealthData?: DailyData[];
  emptyMessage?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (active && payload?.length) {
    const income = payload.find((p: { name: string }) => p.name === "income")?.value ?? 0;
    const expense = payload.find((p: { name: string }) => p.name === "expense")?.value ?? 0;
    const offChart = payload.find((p: { name: string }) => p.name === "offChart")?.value ?? 0;
    const net = income - expense - offChart;
    return (
      <div className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm shadow-xl min-w-[150px]">
        <p className="text-slate-400 mb-1.5 font-medium">{label}</p>
        <div className="flex justify-between gap-3 items-center">
          <span className="text-emerald-400 text-xs">Income</span>
          <span className="font-semibold text-white">{formatCurrency(income)}</span>
        </div>
        <div className="flex justify-between gap-3 items-center">
          <span className="text-indigo-400 text-xs">Expense</span>
          <span className="font-semibold text-white">{formatCurrency(expense)}</span>
        </div>
        {offChart > 0 && (
          <div className="flex justify-between gap-3 items-center">
            <span className="text-slate-400 text-xs">Off-chart</span>
            <span className="font-semibold text-slate-300">{formatCurrency(offChart)}</span>
          </div>
        )}
        <div className="flex justify-between gap-3 items-center mt-1 pt-1 border-t border-slate-700">
          <span className="text-slate-400 text-xs">Net</span>
          <span className={net >= 0 ? "font-semibold text-emerald-400" : "font-semibold text-rose-400"}>
            {formatCurrency(net)}
          </span>
        </div>
      </div>
    );
  }
  return null;
}

// Grouped income-vs-expense bars per month — makes surplus / deficit months
// pop out more clearly than the overlaid trend areas. Reuses the monthly
// `DailyData` buckets produced for the trend chart. Expense bars stay
// chart-basis (so one-off purchases don't crush the y-axis); when the
// ledger-basis `wealthData` series is available, each month's off-chart
// amount is stacked on top as a dimmer hatched segment so big purchases
// stay visible without polluting the "typical month" reading.
export function MonthlyBarChart({ data, wealthData, emptyMessage }: MonthlyBarChartProps) {
  const anim = useChartAnimation();
  const wealthByDate = new Map((wealthData ?? []).map((w) => [w.date, w]));
  const merged = data.map((d) => ({
    ...d,
    offChart: Math.max(
      0,
      Math.round(((wealthByDate.get(d.date)?.expense ?? d.expense) - d.expense) * 100) / 100
    ),
  }));
  const hasOffChart = merged.some((d) => d.offChart > 0);
  const hasData = merged.some((d) => d.income > 0 || d.expense > 0 || d.offChart > 0);

  if (!hasData) {
    return (
      <div className="flex items-center justify-center h-40 text-slate-500 text-sm">
        {emptyMessage ?? "No transactions in this period"}
      </div>
    );
  }

  return (
    <>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={merged} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <defs>
            {/* Diagonal hatch for the off-chart segment — dimmer than the
                solid expense fill so it reads as "present but atypical". */}
            <pattern
              id="offChartHatch"
              patternUnits="userSpaceOnUse"
              width="6"
              height="6"
              patternTransform="rotate(45)"
            >
              <rect width="6" height="6" fill="rgba(99, 102, 241, 0.12)" />
              <line x1="0" y1="0" x2="0" y2="6" stroke="rgba(99, 102, 241, 0.45)" strokeWidth="2" />
            </pattern>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fill: "#64748b", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            interval={0}
          />
          <YAxis
            tick={{ fill: "#64748b", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => (v === 0 ? "0" : `$${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}`)}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(148,163,184,0.08)" }} />
          <Bar dataKey="income" name="income" fill="#10b981" radius={[3, 3, 0, 0]} maxBarSize={28} {...anim} />
          {/* Recharts only introspects direct children — the stacked pair
              must not be wrapped in a fragment. When stacked, the top
              rounding moves to whichever segment is topmost per month, so
              cells set radius individually. */}
          <Bar
            dataKey="expense"
            name="expense"
            stackId="exp"
            fill="#6366f1"
            radius={hasOffChart ? undefined : [3, 3, 0, 0]}
            maxBarSize={28}
            {...anim}
          >
            {hasOffChart
              ? merged.map((d) => (
                  <Cell
                    key={d.date}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    radius={(d.offChart > 0 ? [0, 0, 0, 0] : [3, 3, 0, 0]) as any}
                  />
                ))
              : null}
          </Bar>
          {hasOffChart && (
            <Bar
              dataKey="offChart"
              name="offChart"
              stackId="exp"
              fill="url(#offChartHatch)"
              stroke="rgba(99, 102, 241, 0.35)"
              strokeWidth={1}
              radius={[3, 3, 0, 0]}
              maxBarSize={28}
              {...anim}
            />
          )}
        </BarChart>
      </ResponsiveContainer>
      {hasOffChart && (
        <div className="flex gap-4 mt-2 justify-center">
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
            Expenses
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <span
              className="w-2.5 h-2.5 rounded-full border border-indigo-500/50"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(45deg, rgba(99,102,241,0.45) 0 1.5px, rgba(99,102,241,0.12) 1.5px 4px)",
              }}
            />
            Off-chart
          </div>
        </div>
      )}
    </>
  );
}
