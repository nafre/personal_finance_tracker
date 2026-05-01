import { getDashboardData, getRecurringTransactions, getBudgets } from "@/lib/actions";
import { getCurrentMonthYear, getPrevMonth } from "@/lib/utils";
import { DashboardContent } from "@/components/DashboardContent";

interface PageProps {
  searchParams: Promise<{ month?: string; year?: string }>;
}

export default async function DashboardPage({ searchParams }: PageProps) {
  const { month: currentMonth, year: currentYear } = getCurrentMonthYear();
  const { month: monthParam, year: yearParam } = await searchParams;

  const month = monthParam
    ? Math.max(1, Math.min(12, parseInt(monthParam)))
    : currentMonth;
  const year = yearParam
    ? parseInt(yearParam)
    : currentYear;

  const { month: prevMonth, year: prevYear } = getPrevMonth(month, year);

  const [data, prevData, recurring, budgets] = await Promise.all([
    getDashboardData(month, year),
    getDashboardData(prevMonth, prevYear),
    getRecurringTransactions(),
    getBudgets(),
  ]);

  return (
    <DashboardContent
      initialTransactions={data.transactions}
      initialTotalIncome={data.totalIncome}
      initialTotalExpenses={data.totalExpenses}
      initialNetBalance={data.netBalance}
      initialCategoryData={data.categoryData}
      initialDailyData={data.dailyData}
      initialTopCategory={data.topCategory}
      initialRecurring={recurring}
      initialBudgets={budgets}
      month={month}
      year={year}
      prevTotalExpenses={prevData.totalExpenses}
      prevTotalIncome={prevData.totalIncome}
      prevCategoryData={prevData.categoryData}
    />
  );
}
