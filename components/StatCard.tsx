"use client";

import { formatCurrency, cn } from "@/lib/utils";
import { useCountUp } from "@/hooks/useCountUp";
import { ArrowDown, ArrowUp } from "lucide-react";
import type { ReactNode } from "react";

export function StatCard({
  label,
  amount,
  variant,
  icon,
  momDelta,
  deltaLabel = "vs last month",
  subtitle,
}: {
  label: string;
  amount: number;
  variant: "income" | "expense" | "balance";
  icon: ReactNode;
  momDelta?: number | null;
  deltaLabel?: string;
  subtitle?: string;
}) {
  // Tween toward the new amount after optimistic mutations (first render and
  // reduced-motion show it instantly). The sign/color logic keys off the real
  // `amount` so the styling never flips mid-tween.
  const displayAmount = useCountUp(amount);
  const isNegative = variant === "balance" && amount < 0;
  const effectiveKey: "income" | "expense" | "balance" =
    variant === "balance" && isNegative ? "expense" : variant;

  const colorMap = {
    income: "text-emerald-400",
    expense: "text-rose-400",
    balance: "text-indigo-300",
  };

  const gradientMap = {
    income: "linear-gradient(135deg, #052e16, #14532d)",
    expense: "linear-gradient(135deg, #2d0a14, #4c0519)",
    balance: "linear-gradient(135deg, #1e1b4b, #2e1065)",
  };

  const borderMap = {
    income: "rgba(16,185,129,0.25)",
    expense: "rgba(244,63,94,0.25)",
    balance: "rgba(99,102,241,0.25)",
  };

  const glowMap = {
    income: "0 1px 3px rgba(0,0,0,0.5), 0 4px 20px rgba(16,185,129,0.15)",
    expense: "0 1px 3px rgba(0,0,0,0.5), 0 4px 20px rgba(244,63,94,0.15)",
    balance: "0 1px 3px rgba(0,0,0,0.5), 0 4px 20px rgba(99,102,241,0.15)",
  };

  const decorMap = {
    income: "#10b981",
    expense: "#f43f5e",
    balance: "#818cf8",
  };

  const iconBgMap = {
    income: "rgba(16,185,129,0.15)",
    expense: "rgba(244,63,94,0.15)",
    balance: "rgba(129,140,248,0.15)",
  };

  return (
    <div
      className="rounded-2xl border p-3 sm:p-5 relative overflow-hidden"
      style={{
        background: gradientMap[effectiveKey],
        borderColor: borderMap[effectiveKey],
        boxShadow: glowMap[effectiveKey],
      }}
    >
      {/* Decorative circle */}
      <div
        className="absolute -top-6 -right-6 w-24 h-24 rounded-full opacity-10 pointer-events-none"
        style={{ background: decorMap[effectiveKey] }}
      />

      <div className="flex items-center justify-between mb-2 sm:mb-3 relative">
        <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-widest text-slate-400 truncate min-w-0 flex-1 mr-1">
          {label}
        </span>
        <div
          className={cn(
            "w-6 h-6 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center shrink-0",
            colorMap[effectiveKey]
          )}
          style={{ background: iconBgMap[effectiveKey] }}
          aria-hidden="true"
        >
          {icon}
        </div>
      </div>

      <p
        title={`${variant === "balance" && amount < 0 ? "-" : ""}${formatCurrency(Math.abs(amount))}`}
        className={cn("text-lg sm:text-3xl font-bold tabular-nums truncate relative", colorMap[effectiveKey])}
      >
        {variant === "balance" && amount < 0 ? "-" : ""}
        {formatCurrency(Math.abs(displayAmount))}
      </p>

      {momDelta != null && isFinite(momDelta) && (
        <span
          className={cn(
            "text-[10px] sm:text-xs font-medium mt-1 sm:mt-2 flex items-center gap-0.5 relative",
            variant === "expense"
              ? momDelta > 0 ? "text-rose-400" : "text-emerald-400"
              : momDelta > 0 ? "text-emerald-400" : "text-rose-400"
          )}
        >
          {momDelta > 0 ? (
            <ArrowUp className="w-3 h-3 shrink-0" aria-hidden="true" />
          ) : (
            <ArrowDown className="w-3 h-3 shrink-0" aria-hidden="true" />
          )}
          {Math.abs(momDelta).toFixed(0)}%
          <span className="hidden sm:inline"> {deltaLabel}</span>
          <span className="sr-only sm:hidden">{deltaLabel}</span>
        </span>
      )}

      {momDelta == null && subtitle && (
        <span className="text-[10px] sm:text-xs font-medium mt-1 sm:mt-2 block relative text-slate-400">
          {subtitle}
        </span>
      )}
    </div>
  );
}
