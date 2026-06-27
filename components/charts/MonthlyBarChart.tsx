"use client";

import {
  BarChart,
  Bar,
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

interface MonthlyBarChartProps {
  data: DailyData[];
  emptyMessage?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (active && payload?.length) {
    const income = payload.find((p: { name: string }) => p.name === "income")?.value ?? 0;
    const expense = payload.find((p: { name: string }) => p.name === "expense")?.value ?? 0;
    const net = income - expense;
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
// `DailyData` buckets produced for the trend chart.
export function MonthlyBarChart({ data, emptyMessage }: MonthlyBarChartProps) {
  const hasData = data.some((d) => d.income > 0 || d.expense > 0);

  if (!hasData) {
    return (
      <div className="flex items-center justify-center h-40 text-slate-500 text-sm">
        {emptyMessage ?? "No transactions in this period"}
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
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
        <Bar dataKey="income" name="income" fill="#10b981" radius={[3, 3, 0, 0]} maxBarSize={28} />
        <Bar dataKey="expense" name="expense" fill="#6366f1" radius={[3, 3, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
  );
}
