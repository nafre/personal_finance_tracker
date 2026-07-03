"use client";

import { useMemo } from "react";
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { formatCurrency } from "@/lib/utils";

interface DailyData {
  date: string;
  day: number;
  income: number;
  expense: number;
}

interface TrendChartProps {
  data: DailyData[];
  // Force the X-axis label interval (1 = every label). When omitted the chart
  // auto-thins labels based on point count. Monthly trends pass 1 so all 12
  // month labels render.
  labelEvery?: number;
  emptyMessage?: string;
  // Overlay a running balance (cumulative income − expense) line on a second
  // axis — the "net worth" view across the period.
  showCumulative?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (active && payload?.length) {
    return (
      <div className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm shadow-xl min-w-[140px]">
        <p className="text-slate-400 mb-1.5 font-medium">{label}</p>
        {payload.map((p: { name: string; value: number; color: string }, i: number) => (
          <div key={i} className="flex justify-between gap-3 items-center">
            <span style={{ color: p.color }} className="text-xs capitalize">{p.name}</span>
            <span className="font-semibold text-white">{formatCurrency(p.value)}</span>
          </div>
        ))}
      </div>
    );
  }
  return null;
}

export function TrendChart({ data, labelEvery, emptyMessage, showCumulative }: TrendChartProps) {
  // Running balance per bucket — only computed/rendered when requested.
  const chartData = useMemo(() => {
    if (!showCumulative) return data;
    let running = 0;
    return data.map((d) => {
      running += d.income - d.expense;
      return { ...d, balance: Math.round(running * 100) / 100 };
    });
  }, [data, showCumulative]);

  // Only show points that have data for a cleaner chart
  const hasData = data.some((d) => d.income > 0 || d.expense > 0);

  if (!hasData) {
    return (
      <div className="flex items-center justify-center h-[200px] text-slate-500 text-sm">
        {emptyMessage ?? "No transactions this month"}
      </div>
    );
  }

  // Show every Nth label to avoid crowding on mobile (unless a fixed interval
  // is requested, e.g. monthly trends that want every label).
  const step = labelEvery ?? (data.length > 20 ? 5 : data.length > 10 ? 3 : 1);

  return (
    <ResponsiveContainer width="100%" height={200}>
      <ComposedChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="gradExpense" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6366f1" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#6366f1" stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="gradIncome" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
            <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
          </linearGradient>
        </defs>

        <CartesianGrid
          strokeDasharray="3 3"
          stroke="#1e293b"
          vertical={false}
        />
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
          tickFormatter={(v) => (v === 0 ? "0" : `$${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}`)}
        />
        {showCumulative && (
          <YAxis
            yAxisId="balance"
            orientation="right"
            tick={{ fill: "#a16207", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={36}
            tickFormatter={(v) =>
              `${v >= 1000 || v <= -1000 ? `${(v / 1000).toFixed(0)}k` : v}`
            }
          />
        )}
        <Tooltip content={<CustomTooltip />} />

        <Area
          type="monotone"
          dataKey="expense"
          name="expense"
          stroke="#6366f1"
          strokeWidth={2}
          fill="url(#gradExpense)"
          dot={false}
          activeDot={{ r: 4, fill: "#6366f1", stroke: "#0f172a", strokeWidth: 2 }}
        />
        <Area
          type="monotone"
          dataKey="income"
          name="income"
          stroke="#10b981"
          strokeWidth={2}
          fill="url(#gradIncome)"
          dot={false}
          activeDot={{ r: 4, fill: "#10b981", stroke: "#0f172a", strokeWidth: 2 }}
        />
        {showCumulative && (
          <Line
            yAxisId="balance"
            type="monotone"
            dataKey="balance"
            name="balance"
            stroke="#f59e0b"
            strokeWidth={2}
            strokeDasharray="4 3"
            dot={false}
            activeDot={{ r: 4, fill: "#f59e0b", stroke: "#0f172a", strokeWidth: 2 }}
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
