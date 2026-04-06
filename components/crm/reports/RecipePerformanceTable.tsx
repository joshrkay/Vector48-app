"use client";

import type { RecipePerformanceRow } from "@/lib/reports/queries";

interface RecipePerformanceTableProps {
  rows: RecipePerformanceRow[];
}

function TrendBadge({ trend }: { trend: number }) {
  const positive = trend >= 0;
  const label = `${positive ? "+" : ""}${trend.toFixed(0)}%`;
  return (
    <span
      className={`text-xs font-medium ${positive ? "text-green-600" : "text-red-500"}`}
    >
      {label}
    </span>
  );
}

export function RecipePerformanceTable({ rows }: RecipePerformanceTableProps) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-[var(--text-secondary)]">
        No recipe activity in the last 30 days.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--v48-border)] text-left text-xs font-medium text-[var(--text-secondary)]">
            <th className="pb-2 pr-4">Recipe</th>
            <th className="pb-2 pr-4 text-right">30-day Total</th>
            <th className="pb-2 pr-4 text-right">Prev 30d</th>
            <th className="pb-2 text-right">Trend</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.recipeSlug}
              className="border-b border-[var(--v48-border)] last:border-0"
            >
              <td className="py-3 pr-4 font-medium">{row.recipeSlug}</td>
              <td className="py-3 pr-4 text-right tabular-nums">{row.total30d}</td>
              <td className="py-3 pr-4 text-right tabular-nums text-[var(--text-secondary)]">
                {row.prev30d}
              </td>
              <td className="py-3 text-right">
                <TrendBadge trend={row.trend} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
