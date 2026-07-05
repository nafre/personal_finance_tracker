"use client";

import { useEffect, useRef, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import { getMonthName, getPrevMonth, getNextMonth } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Period } from "@/types";

const STEPPER_BTN =
  "flex items-center justify-center min-w-11 min-h-11 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed";

interface MonthSelectorProps {
  period: Period;
  month: number;
  year: number;
  // The transactions page reuses this control for month stepping only.
  showPeriodToggle?: boolean;
}

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
  { value: "all", label: "All-time" },
];

export function MonthSelector({ period, month, year, showPeriodToggle = true }: MonthSelectorProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const navInFlight = useRef(false);

  // isPending stays true until the new server payload commits (the URL itself
  // updates optimistically, long before the data arrives) — so completion is
  // signalled from here rather than from a URL change.
  useEffect(() => {
    if (!isPending && navInFlight.current) {
      navInFlight.current = false;
      window.dispatchEvent(new Event("nav-end"));
    }
  }, [isPending]);

  function go(next: { period: Period; month?: number; year?: number }) {
    const params = new URLSearchParams();
    params.set("period", next.period);
    if (next.month != null) params.set("month", String(next.month));
    if (next.year != null) params.set("year", String(next.year));
    // Same event NavBar links fire; `managed` tells TopLoadingBar to wait for
    // our nav-end instead of hiding on the (optimistic) URL change.
    window.dispatchEvent(new CustomEvent("nav-start", { detail: { managed: true } }));
    navInFlight.current = true;
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  }

  function switchPeriod(p: Period) {
    if (p === period) return; // no-op nav would leave the loading bar stuck
    if (p === "all") go({ period: "all" });
    else go({ period: p, month, year });
  }

  const now = new Date();
  const isCurrentMonth = month === now.getMonth() + 1 && year === now.getFullYear();
  const isCurrentYear = year === now.getFullYear();

  return (
    <div
      data-testid="period-selector"
      aria-busy={isPending}
      className={cn(
        "flex items-center gap-x-3 gap-y-2 flex-wrap transition-opacity",
        isPending && "opacity-60 animate-pulse"
      )}
    >
      {/* Period toggle */}
      {showPeriodToggle && (
      <div className="inline-flex rounded-lg bg-slate-800/60 p-0.5 border border-slate-700">
        {PERIOD_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => switchPeriod(opt.value)}
            aria-pressed={period === opt.value}
            className={cn(
              "px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap",
              period === opt.value
                ? "bg-indigo-500/20 text-indigo-300"
                : "text-slate-400 hover:text-slate-200"
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
      )}

      {/* Stepper — month mode */}
      {period === "month" && (
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              const p = getPrevMonth(month, year);
              go({ period: "month", month: p.month, year: p.year });
            }}
            className={STEPPER_BTN}
            aria-label="Previous month"
          >
            <ChevronLeft className="w-5 h-5" aria-hidden="true" />
          </button>
          <div className="text-center min-w-[120px]">
            <p className="font-semibold text-slate-100">
              {getMonthName(month)} {year}
            </p>
            {isCurrentMonth && (
              <p className="text-xs text-indigo-400 font-medium">Current month</p>
            )}
          </div>
          <button
            onClick={() => {
              const n = getNextMonth(month, year);
              go({ period: "month", month: n.month, year: n.year });
            }}
            disabled={isCurrentMonth}
            className={STEPPER_BTN}
            aria-label="Next month"
          >
            <ChevronRight className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Stepper — year mode */}
      {period === "year" && (
        <div className="flex items-center gap-1">
          <button
            onClick={() => go({ period: "year", month, year: year - 1 })}
            className={STEPPER_BTN}
            aria-label="Previous year"
          >
            <ChevronLeft className="w-5 h-5" aria-hidden="true" />
          </button>
          <div className="text-center min-w-[80px]">
            <p className="font-semibold text-slate-100">{year}</p>
            {isCurrentYear && (
              <p className="text-xs text-indigo-400 font-medium">This year</p>
            )}
          </div>
          <button
            onClick={() => go({ period: "year", month, year: year + 1 })}
            disabled={isCurrentYear}
            className={STEPPER_BTN}
            aria-label="Next year"
          >
            <ChevronRight className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* All-time label */}
      {period === "all" && (
        <div className="text-center min-w-[80px]">
          <p className="font-semibold text-slate-100">All time</p>
        </div>
      )}
    </div>
  );
}
