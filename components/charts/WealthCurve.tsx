"use client";

import { useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { cn, formatCurrency } from "@/lib/utils";
import { useChartAnimation } from "@/hooks/useChartAnimation";
import type { DailyData } from "@/types";

interface WealthCurveProps {
  /** All-time monthly buckets (ledger basis — includes off-chart transactions). */
  data: DailyData[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function WealthTooltip({ active, payload, label }: any) {
  if (active && payload?.length) {
    const value: number = payload[0].value;
    return (
      <div className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm shadow-xl min-w-[140px]">
        <p className="text-slate-400 mb-1 font-medium">{label}</p>
        <div className="flex justify-between gap-3 items-center">
          <span className="text-xs text-emerald-400">Net balance</span>
          <span className="font-semibold text-white">{formatCurrency(value)}</span>
        </div>
      </div>
    );
  }
  return null;
}

// Running sum of (income − expense) from the first transaction to today — the
// all-time view's hero chart. Ledger basis (unlike the trend chart): excluding
// a transaction here would offset the cumulative line permanently, so off-chart
// rows still count. The headline derives from the plotted points, matching the
// curve endpoint exactly.
export function WealthCurve({ data }: WealthCurveProps) {
  const anim = useChartAnimation();
  const { points, finalBalance, hasNegative } = useMemo(() => {
    let running = 0;
    let hasNegative = false;
    const points = data.map((d) => {
      running += d.income - d.expense;
      const balance = Math.round(running * 100) / 100;
      if (balance < 0) hasNegative = true;
      return { date: d.date, balance };
    });
    return { points, finalBalance: points[points.length - 1]?.balance ?? 0, hasNegative };
  }, [data]);

  const hasData = data.some((d) => d.income > 0 || d.expense > 0);

  // Thin X labels when many months are plotted (multi-year all-time ranges)
  const step = points.length > 20 ? 4 : points.length > 12 ? 2 : 1;

  return (
    <div data-testid="wealth-curve" className="card animate-fade-in">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-1 h-4 rounded-full bg-emerald-500 opacity-60 shrink-0" />
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-slate-200">Wealth Curve</h3>
            <p className="text-xs text-slate-500">
              Cumulative net balance{points[0] ? ` since ${points[0].date}` : ""}
            </p>
          </div>
        </div>
        {hasData && (
          <span
            className={cn(
              "text-lg font-bold tabular-nums shrink-0",
              finalBalance >= 0 ? "text-emerald-400" : "text-rose-400"
            )}
          >
            {formatCurrency(finalBalance)}
          </span>
        )}
      </div>

      {!hasData ? (
        <div className="flex items-center justify-center h-[240px] text-slate-500 text-sm">
          No transactions yet
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={points} margin={{ top: 4, right: 4, left: -20, bottom: 0 }} accessibilityLayer={false}>
            <defs>
              <linearGradient id="gradWealth" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fill: "#64748b", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              interval={step - 1}
            />
            <YAxis
              tick={{ fill: "#64748b", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) =>
                v === 0 ? "0" : Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${v}`
              }
            />
            <Tooltip content={<WealthTooltip />} />
            {hasNegative && (
              <ReferenceLine y={0} stroke="#475569" strokeDasharray="4 3" />
            )}
            <Area
              type="monotone"
              dataKey="balance"
              name="Net balance"
              stroke="#10b981"
              strokeWidth={2.5}
              fill="url(#gradWealth)"
              dot={false}
              activeDot={{ r: 4, fill: "#10b981", stroke: "#0f172a", strokeWidth: 2 }}
              {...anim}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
