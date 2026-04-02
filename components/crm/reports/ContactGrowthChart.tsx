"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ContactGrowthRow } from "@/lib/reports/queries";

interface ContactGrowthChartProps {
  data: ContactGrowthRow[];
}

export function ContactGrowthChart({ data }: ContactGrowthChartProps) {
  if (data.length === 0) {
    return (
      <p className="text-sm text-[var(--text-secondary)]">
        No contact growth data available.
      </p>
    );
  }

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 4, right: 8, left: 0, bottom: 4 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="var(--v48-border)" />
          <XAxis
            dataKey="weekLabel"
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            interval={2}
          />
          <YAxis
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
            width={32}
          />
          <Tooltip
            formatter={(value: number) => [value, "New contacts"]}
            contentStyle={{ fontSize: 12 }}
          />
          <Line
            type="monotone"
            dataKey="count"
            stroke="#4D7BFF"
            strokeWidth={2}
            dot={{ r: 3, fill: "#4D7BFF" }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
