"use client";

import { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { cn, formatCurrency } from "@/lib/utils";
import type { DailyData } from "@/types";

interface PaceChartProps {
  /** Current month's per-day buckets (chart basis — excludeFromStats filtered). */
  dailyData: DailyData[];
  /** Previous month's per-day buckets, same basis. May be shorter/longer. */
  prevDailyData: DailyData[];
  /** The overall budget's monthly amount, when one exists. */
  budgetAmount: number | null;
  month: number;
  year: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function PaceTooltip({ active, payload, label }: any) {
  if (active && payload?.length) {
    return (
      <div className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm shadow-xl min-w-[150px]">
        <p className="text-slate-400 mb-1.5 font-medium">{label}</p>
        {payload.map((p: { name: string; value: number; color: string }, i: number) => (
          <div key={i} className="flex justify-between gap-3 items-center">
            <span style={{ color: p.color }} className="text-xs">{p.name}</span>
            <span className="font-semibold text-white">{formatCurrency(p.value)}</span>
          </div>
        ))}
      </div>
    );
  }
  return null;
}

// Cumulative spend climbing day by day vs a straight "even pace" line to the
// overall budget and last month's cumulative curve (muted). Month view only.
export function PaceChart({ dailyData, prevDailyData, budgetAmount, month, year }: PaceChartProps) {
  const { points, spentToDate, paceToDate, cutoff, isCurrentMonth } = useMemo(() => {
    const daysInMonth = dailyData.length;
    const today = new Date();
    const isCurrentMonth =
      month === today.getMonth() + 1 && year === today.getFullYear();
    // In the current month the spend line stops at today; in past months it
    // runs the full month (and the pace comparison becomes full-month vs budget).
    const cutoff = isCurrentMonth ? Math.min(today.getDate(), daysInMonth) : daysInMonth;

    let run = 0;
    let prevRun = 0;
    let spentToDate = 0;
    const points = dailyData.map((d, i) => {
      const day = i + 1;
      run += d.expense;
      if (day <= cutoff) spentToDate = run;
      const prev = prevDailyData[i];
      if (prev) prevRun += prev.expense;
      return {
        date: d.date,
        day,
        // undefined past the cutoff / past the prev month's length — Recharts
        // simply stops the line there instead of drawing a false flat tail.
        spent: day <= cutoff ? round2(run) : undefined,
        prev: prev ? round2(prevRun) : undefined,
        pace:
          budgetAmount != null && daysInMonth > 0
            ? round2((budgetAmount * day) / daysInMonth)
            : undefined,
      };
    });

    const paceToDate =
      budgetAmount != null && daysInMonth > 0
        ? (budgetAmount * cutoff) / daysInMonth
        : null;

    return { points, spentToDate, paceToDate, cutoff, isCurrentMonth };
  }, [dailyData, prevDailyData, budgetAmount, month, year]);

  const hasData =
    dailyData.some((d) => d.expense > 0) ||
    prevDailyData.some((d) => d.expense > 0) ||
    budgetAmount != null;

  // "RM X ahead of / under pace" — vs the even-pace budget line at the cutoff day.
  const paceDiff = paceToDate != null && cutoff > 0 ? spentToDate - paceToDate : null;

  const step = dailyData.length > 20 ? 5 : dailyData.length > 10 ? 3 : 1;

  return (
    <div data-testid="pace-chart" className="card">
      <div className="flex items-center justify-between mb-3 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-1 h-4 rounded-full bg-indigo-500 opacity-60 shrink-0" />
          <h3 className="text-sm font-semibold text-slate-200">Spending Pace</h3>
        </div>
        {paceDiff != null && Math.abs(paceDiff) >= 0.01 && (
          <span
            className={cn(
              "text-xs font-medium px-2 py-0.5 rounded-full shrink-0 tabular-nums",
              paceDiff > 0 ? "bg-rose-500/20 text-rose-400" : "bg-emerald-500/20 text-emerald-400"
            )}
          >
            {formatCurrency(Math.abs(paceDiff))} {paceDiff > 0 ? "ahead of" : "under"}{" "}
            {isCurrentMonth ? "pace" : "budget"}
          </span>
        )}
      </div>

      {!hasData ? (
        <div className="flex items-center justify-center h-[200px] text-slate-500 text-sm">
          No spending this month yet
        </div>
      ) : (
        <div data-testid="pace-chart-plot">
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={points} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
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
                  v === 0 ? "0" : v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${v}`
                }
              />
              <Tooltip content={<PaceTooltip />} />
              {prevDailyData.length > 0 && (
                <Line
                  type="monotone"
                  dataKey="prev"
                  name="Last month"
                  stroke="#475569"
                  strokeWidth={1.5}
                  dot={false}
                  activeDot={{ r: 3, fill: "#475569", stroke: "#0f172a", strokeWidth: 2 }}
                />
              )}
              {budgetAmount != null && (
                <Line
                  type="linear"
                  dataKey="pace"
                  name="Budget pace"
                  stroke="#f59e0b"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  dot={false}
                  activeDot={{ r: 3, fill: "#f59e0b", stroke: "#0f172a", strokeWidth: 2 }}
                />
              )}
              <Line
                type="monotone"
                dataKey="spent"
                name="This month"
                stroke="#6366f1"
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 4, fill: "#6366f1", stroke: "#0f172a", strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="flex gap-4 mt-2 justify-center flex-wrap">
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <span className="w-2.5 h-0.5 rounded-full bg-indigo-500" />
          This month
        </div>
        {prevDailyData.length > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <span className="w-2.5 h-0.5 rounded-full bg-slate-600" />
            Last month
          </div>
        )}
        {budgetAmount != null && (
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <span className="w-2.5 h-0.5 rounded-full bg-amber-500" />
            Budget pace
          </div>
        )}
      </div>
    </div>
  );
}
