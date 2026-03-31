"use client";

import { cn } from "@/lib/utils";
import type { BusinessHoursData } from "@/lib/validations/onboarding";

const PRESETS: {
  value: BusinessHoursData["preset"];
  label: string;
  desc: string;
}[] = [
  {
    value: "weekday_8_5",
    label: "Mon–Fri, 8am–5pm",
    desc: "Standard business hours",
  },
  {
    value: "weekday_7_6",
    label: "Mon–Fri, 7am–6pm",
    desc: "Extended weekday hours",
  },
  {
    value: "all_week",
    label: "7 Days a Week",
    desc: "Mon–Sun, 8am–6pm",
  },
  {
    value: "custom",
    label: "Custom Hours",
    desc: "Set your own schedule",
  },
];

export function BusinessHoursFields({
  className,
  value,
  onChange,
}: {
  className?: string;
  value: Pick<BusinessHoursData, "preset">;
  onChange: (next: Pick<BusinessHoursData, "preset">) => void;
}) {
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {PRESETS.map((p) => (
        <button
          key={p.value}
          type="button"
          onClick={() => onChange({ preset: p.value })}
          className={cn(
            "flex min-h-[56px] flex-col rounded-xl border-2 px-4 py-3 text-left transition-all",
            value.preset === p.value
              ? "border-accent bg-accent-light ring-2 ring-accent/20"
              : "border-border hover:border-accent/40",
          )}
        >
          <span className="text-sm font-semibold text-text-primary">
            {p.label}
          </span>
          <span className="text-xs text-text-secondary">{p.desc}</span>
        </button>
      ))}
    </div>
  );
}
