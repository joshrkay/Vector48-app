"use client";

import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ResponseTimeData } from "@/lib/reports/queries";

const BUCKET_COLORS = ["#4D7BFF", "#6B94FF", "#84A7FF", "#9BB9FF", "#B3CBFF"];

interface ResponseTimeChartProps {
  data: ResponseTimeData;
}

export function ResponseTimeChart({ data }: ResponseTimeChartProps) {
  const hasData = data.buckets.some((b) => b.count > 0);

  return (
    <div className="space-y-4">
      <p className="font-heading text-xl font-bold text-[var(--text-primary)]">
        {data.headline}
      </p>

      {hasData ? (
        <div className="h-48 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data.buckets}
              margin={{ top: 4, right: 8, left: 0, bottom: 4 }}
            >
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
                width={32}
              />
              <Tooltip
                formatter={(value: number) => [value, "Leads"]}
                contentStyle={{ fontSize: 12 }}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {data.buckets.map((_, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={BUCKET_COLORS[index % BUCKET_COLORS.length]}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="text-sm text-[var(--text-secondary)]">
          No response time data for the last 30 days.
        </p>
      )}
    </div>
  );
}
