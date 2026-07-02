import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { resolvePeriod, monthRange, type PeriodKeyword } from "./db.js";
import * as q from "./queries.js";

const periodShape = {
  period: z
    .enum(["this_month", "last_month", "this_year", "last_year", "all_time", "custom"])
    .default("this_month")
    .describe("Named period. Use 'custom' with from/to for an arbitrary range."),
  from: z
    .string()
    .optional()
    .describe("Start date YYYY-MM-DD (required when period='custom')."),
  to: z
    .string()
    .optional()
    .describe("End date YYYY-MM-DD, inclusive (optional; defaults to now)."),
};

function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function fail(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return { isError: true, content: [{ type: "text" as const, text: `Error: ${message}` }] };
}

export function buildServer(): McpServer {
  const server = new McpServer({
    name: "expense-tracker-finance",
    version: "1.0.0",
  });

  server.registerTool(
    "get_financial_overview",
    {
      title: "Financial overview",
      description:
        "Headline numbers for a period: total income, total expenses, net balance, savings rate, transaction count, and the top expense category. All amounts are MYR (RM).",
      inputSchema: periodShape,
    },
    async ({ period, from, to }) => {
      try {
        return ok(await q.financialOverview(resolvePeriod(period as PeriodKeyword, from, to)));
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.registerTool(
    "get_spending_by_category",
    {
      title: "Spending by category",
      description:
        "Expense breakdown per category for a period, sorted high→low, with each category's % share of total spend. Excludes transactions flagged excludeFromStats. Amounts in MYR.",
      inputSchema: periodShape,
    },
    async ({ period, from, to }) => {
      try {
        return ok(await q.spendingByCategory(resolvePeriod(period as PeriodKeyword, from, to)));
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.registerTool(
    "get_spending_trend",
    {
      title: "Spending trend over time",
      description:
        "Income and expense totals bucketed by day or month across a period (good for spotting trends). Granularity defaults sensibly per period. Amounts in MYR.",
      inputSchema: {
        ...periodShape,
        granularity: z
          .enum(["day", "month"])
          .optional()
          .describe("Override bucket size. Defaults: day for a month, month for year/all-time."),
      },
    },
    async ({ period, from, to, granularity }) => {
      try {
        return ok(
          await q.spendingTrend(resolvePeriod(period as PeriodKeyword, from, to), granularity)
        );
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.registerTool(
    "list_recent_transactions",
    {
      title: "List recent transactions",
      description:
        "Individual transaction line items for a period (newest first), optionally filtered by category or label. Use for detail/spot-checking. Amounts in MYR.",
      inputSchema: {
        ...periodShape,
        category: z.string().optional().describe("Only this category."),
        label: z.string().optional().describe("Only transactions carrying this label/tag."),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .default(50)
          .describe("Max rows to return (1–100)."),
      },
    },
    async ({ period, from, to, category, label, limit }) => {
      try {
        return ok(
          await q.listRecentTransactions({
            range: resolvePeriod(period as PeriodKeyword, from, to),
            category,
            label,
            limit: Math.min(limit ?? 50, 100),
          })
        );
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.registerTool(
    "get_budgets_status",
    {
      title: "Budget status",
      description:
        "For a calendar month, each budget's limit, amount spent, remaining, and % used. Budgets are monthly. Amounts in MYR.",
      inputSchema: {
        month: z
          .number()
          .int()
          .min(1)
          .max(12)
          .optional()
          .describe("Month 1–12. Defaults to the current month (UTC)."),
        year: z.number().int().optional().describe("Year, e.g. 2026. Defaults to current."),
      },
    },
    async ({ month, year }) => {
      try {
        const now = new Date();
        const mm = month ?? now.getUTCMonth() + 1;
        const yy = year ?? now.getUTCFullYear();
        return ok(await q.budgetsStatus(monthRange(mm, yy)));
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.registerTool(
    "get_recurring_commitments",
    {
      title: "Recurring commitments",
      description:
        "Active recurring income/expenses normalized to a monthly figure — your fixed monthly commitment vs recurring income. Useful for fixed-vs-discretionary analysis. Amounts in MYR.",
      inputSchema: {},
    },
    async () => {
      try {
        return ok(await q.recurringCommitments());
      } catch (e) {
        return fail(e);
      }
    }
  );

  // One-click orchestration prompt.
  server.registerPrompt(
    "review_finances",
    {
      title: "Review my finances",
      description:
        "Ask Claude to pull the key data and give actionable feedback on your finances for a period.",
      argsSchema: {
        period: z
          .enum(["this_month", "last_month", "this_year", "last_year", "all_time"])
          .optional(),
      },
    },
    ({ period }) => {
      const p = period ?? "this_month";
      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text:
                `Review my personal finances for period "${p}". Use the expense-tracker tools: ` +
                `call get_financial_overview, get_spending_by_category, and get_spending_trend for that period, ` +
                `get_budgets_status for the relevant month, and get_recurring_commitments. ` +
                `Then give me a concise, specific assessment: how I'm tracking vs budgets, notable category trends, ` +
                `my savings rate, fixed vs discretionary spending, and 2–3 concrete suggestions. ` +
                `All amounts are Malaysian Ringgit — format them as "RM".`,
            },
          },
        ],
      };
    }
  );

  return server;
}
