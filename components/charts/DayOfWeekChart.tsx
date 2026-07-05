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
import { useChartAnimation } from "@/hooks/useChartAnimation";
import type { Transaction } from "@/types";

interface DayOfWeekChartProps {
  /** Range-scoped transactions (server fetch is bounded to the 500 most
      recent — acceptable approximation for a habit profile). */
  transactions: Transaction[];
  rangeStartISO: string;
  rangeEndISO: string;
}

// Display order Mon → Sun; index maps back to JS Date.getDay() (0 = Sunday).
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (active && payload?.length) {
    const { avg, total, occurrences } = payload[0].payload;
    return (
      <div className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm shadow-xl min-w-[150px]">
        <p className="text-slate-400 mb-1.5 font-medium">{label}</p>
        <div className="flex justify-between gap-3 items-center">
          <span className="text-indigo-400 text-xs">Avg / day</span>
          <span className="font-semibold text-white">{formatCurrency(avg)}</span>
        </div>
        <div className="flex justify-between gap-3 items-center">
          <span className="text-slate-400 text-xs">Total</span>
          <span className="font-semibold text-slate-300">{formatCurrency(total)}</span>
        </div>
        <p className="text-xs text-slate-500 mt-1">over {occurrences} {label}s</p>
      </div>
    );
  }
  return null;
}

// Average expense per weekday over the selected range — surfaces habits a
// list hides ("weekends cost 2×"). Chart basis (off-chart rows excluded).
// The average divides each weekday's spend total by how often that weekday
// actually occurred between the range start and today, so sparse spending
// days don't inflate the profile.
export function DayOfWeekChart({ transactions, rangeStartISO, rangeEndISO }: DayOfWeekChartProps) {
  const anim = useChartAnimation();
  const totals = Array(7).fill(0);
  for (const tx of transactions) {
    if (tx.type !== "expense" || tx.excludeFromStats) continue;
    totals[new Date(tx.date).getDay()] += tx.amount;
  }

  // Calendar occurrences of each weekday from range start to the earlier of
  // range end / today (future days haven't had a chance to spend yet).
  const start = new Date(rangeStartISO);
  start.setHours(0, 0, 0, 0);
  const now = new Date();
  const endRaw = new Date(rangeEndISO);
  const end = endRaw < now ? endRaw : now;
  end.setHours(0, 0, 0, 0);
  const totalDays = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;

  const occurrences = Array(7).fill(totalDays > 0 ? Math.floor(totalDays / 7) : 0);
  if (totalDays > 0) {
    let rem = totalDays % 7;
    let d = start.getDay();
    while (rem-- > 0) {
      occurrences[d]++;
      d = (d + 1) % 7;
    }
  }

  const data = DAY_ORDER.map((day, i) => ({
    label: DAY_LABELS[i],
    avg: occurrences[day] > 0 ? Math.round((totals[day] / occurrences[day]) * 100) / 100 : 0,
    total: Math.round(totals[day] * 100) / 100,
    occurrences: occurrences[day],
  }));

  if (!data.some((d) => d.total > 0)) {
    return (
      <div className="flex items-center justify-center h-40 text-slate-500 text-sm">
        No transactions in this period
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }} accessibilityLayer={false}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
        <XAxis
          dataKey="label"
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
        <Bar dataKey="avg" name="avg" fill="#6366f1" radius={[3, 3, 0, 0]} maxBarSize={40} {...anim} />
      </BarChart>
    </ResponsiveContainer>
  );
}
