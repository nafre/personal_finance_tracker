"use client";

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { formatCurrency } from "@/lib/utils";

interface DataItem {
  name: string;
  value: number;
}

interface SpendingPieChartProps {
  data: DataItem[];
}

const COLORS = [
  "#6366f1", "#10b981", "#f59e0b", "#ef4444",
  "#8b5cf6", "#06b6d4", "#f97316", "#84cc16",
  "#ec4899", "#14b8a6", "#a16207", "#0891b2",
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload }: any) {
  if (active && payload?.length) {
    const { name, value } = payload[0];
    return (
      <div className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm shadow-xl">
        <p className="text-slate-300 font-medium">{name}</p>
        <p className="text-white font-bold">{formatCurrency(value)}</p>
      </div>
    );
  }
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomLegend({ payload }: any) {
  if (!payload) return null;
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 justify-center mt-2">
      {payload.map((entry: { color: string; value: string }, index: number) => (
        <div key={index} className="flex items-center gap-1.5 text-xs text-slate-400">
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ backgroundColor: entry.color }}
          />
          {entry.value}
        </div>
      ))}
    </div>
  );
}

export function SpendingPieChart({ data }: SpendingPieChartProps) {
  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-[280px] text-slate-500 text-sm">
        No expense data this month
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="45%"
          innerRadius={60}
          outerRadius={100}
          paddingAngle={2}
          stroke="none"
        >
          {data.map((_, index) => (
            <Cell
              key={`cell-${index}`}
              fill={COLORS[index % COLORS.length]}
            />
          ))}
        </Pie>
        <Tooltip content={<CustomTooltip />} />
        <Legend content={<CustomLegend />} />
      </PieChart>
    </ResponsiveContainer>
  );
}
