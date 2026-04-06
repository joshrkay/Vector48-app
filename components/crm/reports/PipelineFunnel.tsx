"use client";

import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PipelineFunnelRow } from "@/lib/reports/queries";

const BAR_FILL = "#4D7BFF";

interface PipelineFunnelProps {
  stages: PipelineFunnelRow[];
}

function ConversionLabel({ stageName, conversionFromPrev }: PipelineFunnelRow) {
  if (conversionFromPrev === null) return stageName;
  return `${stageName} (${Math.round(conversionFromPrev * 100)}% conv.)`;
}

export function PipelineFunnel({ stages }: PipelineFunnelProps) {
  if (stages.length === 0) {
    return (
      <p className="text-sm text-[var(--text-secondary)]">
        No pipeline data available.
      </p>
    );
  }

  const chartData = stages.map((s) => ({
    name: ConversionLabel(s),
    count: s.count,
  }));

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          layout="vertical"
          data={chartData}
          margin={{ top: 4, right: 48, left: 8, bottom: 4 }}
        >
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="name"
            width={180}
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            formatter={(value: number) => [value, "Open opportunities"]}
            contentStyle={{ fontSize: 12 }}
          />
          <Bar dataKey="count" radius={[0, 4, 4, 0]}>
            {chartData.map((_, index) => (
              <Cell
                key={`cell-${index}`}
                fill={BAR_FILL}
                fillOpacity={1 - index * 0.1}
              />
            ))}
            <LabelList dataKey="count" position="right" style={{ fontSize: 11 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
