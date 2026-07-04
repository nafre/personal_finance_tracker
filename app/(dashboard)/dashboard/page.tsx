import {
  getDashboardData,
  getRangeDashboardData,
  getEarliestTransactionDate,
  getRecurringTransactions,
  getBudgets,
  getCategories,
} from "@/lib/actions";
import { getCurrentMonthYear, getPrevMonth } from "@/lib/utils";
import { DashboardContent } from "@/components/DashboardContent";
import { DashboardErrorBoundary } from "@/components/DashboardErrorBoundary";
import type { Period, CategoryData } from "@/types";

interface PageProps {
  searchParams: Promise<{ period?: string; month?: string; year?: string }>;
}

export default async function DashboardPage({ searchParams }: PageProps) {
  const { month: currentMonth, year: currentYear } = getCurrentMonthYear();
  const { period: periodParam, month: monthParam, year: yearParam } = await searchParams;

  const period: Period =
    periodParam === "year" || periodParam === "all" ? periodParam : "month";

  const month = monthParam
    ? Math.max(1, Math.min(12, parseInt(monthParam)))
    : currentMonth;
  const parsedYear = yearParam ? parseInt(yearParam) : NaN;
  const year = !isNaN(parsedYear) && parsedYear > 1900 && parsedYear < 2200
    ? parsedYear
    : currentYear;

  // Resolve the active range, the (optional) comparison totals, and the trend
  // granularity per period mode. Month → MoM, Year → YoY, All-time → none.
  let rangeStart: Date;
  let rangeEnd: Date;
  let data: Awaited<ReturnType<typeof getDashboardData>>;
  let prevData: { totalExpenses: number; totalIncome: number; categoryData: CategoryData[] };
  let deltaLabel: string;

  if (period === "month") {
    rangeStart = new Date(year, month - 1, 1);
    rangeEnd = new Date(year, month, 0, 23, 59, 59, 999);
    const { month: prevMonth, year: prevYear } = getPrevMonth(month, year);
    const [d, prev] = await Promise.all([
      getDashboardData(month, year),
      getDashboardData(prevMonth, prevYear),
    ]);
    data = d;
    prevData = prev;
    deltaLabel = "vs last month";
  } else if (period === "year") {
    rangeStart = new Date(year, 0, 1);
    rangeEnd = new Date(year, 11, 31, 23, 59, 59, 999);
    const prevStart = new Date(year - 1, 0, 1);
    const prevEnd = new Date(year - 1, 11, 31, 23, 59, 59, 999);
    const [d, prev] = await Promise.all([
      getRangeDashboardData(rangeStart.toISOString(), rangeEnd.toISOString(), "month"),
      getRangeDashboardData(prevStart.toISOString(), prevEnd.toISOString(), "month"),
    ]);
    data = d;
    prevData = prev;
    deltaLabel = "vs last year";
  } else {
    // all-time: earliest transaction → now, no comparison
    const earliestISO = await getEarliestTransactionDate();
    rangeStart = earliestISO ? new Date(earliestISO) : new Date(year, 0, 1);
    rangeEnd = new Date();
    data = await getRangeDashboardData(rangeStart.toISOString(), rangeEnd.toISOString(), "month");
    prevData = { totalExpenses: 0, totalIncome: 0, categoryData: [] };
    deltaLabel = "";
  }

  const [recurring, budgets, categories] = await Promise.all([
    getRecurringTransactions(),
    getBudgets(),
    getCategories(),
  ]);
  const categoryOptions = categories.map((c) => ({
    name: c.name,
    icon: c.icon,
    color: c.color,
  }));

  return (
    <DashboardErrorBoundary>
      <DashboardContent
        initialTransactions={data.transactions}
        initialTotalIncome={data.totalIncome}
        initialTotalExpenses={data.totalExpenses}
        initialCategoryData={data.categoryData}
        initialDailyData={data.dailyData}
        initialTopCategory={data.topCategory}
        initialRecurring={recurring}
        initialBudgets={budgets}
        initialCategories={categoryOptions}
        period={period}
        month={month}
        year={year}
        rangeStartISO={rangeStart.toISOString()}
        rangeEndISO={rangeEnd.toISOString()}
        deltaLabel={deltaLabel}
        prevTotalExpenses={prevData.totalExpenses}
        prevTotalIncome={prevData.totalIncome}
        prevCategoryData={prevData.categoryData}
      />
    </DashboardErrorBoundary>
  );
}
