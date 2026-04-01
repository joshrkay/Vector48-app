"use client";

import { cn } from "@/lib/utils";
import type { BusinessHoursData } from "@/lib/validations/onboarding";

const DAYS = [
  { key: "mon", label: "Mon" },
  { key: "tue", label: "Tue" },
  { key: "wed", label: "Wed" },
  { key: "thu", label: "Thu" },
  { key: "fri", label: "Fri" },
  { key: "sat", label: "Sat" },
  { key: "sun", label: "Sun" },
] as const;

const DEFAULT_CUSTOM_HOURS: NonNullable<BusinessHoursData["customHours"]> = {
  mon: { open: "08:00", close: "17:00", closed: false },
  tue: { open: "08:00", close: "17:00", closed: false },
  wed: { open: "08:00", close: "17:00", closed: false },
  thu: { open: "08:00", close: "17:00", closed: false },
  fri: { open: "08:00", close: "17:00", closed: false },
  sat: { open: "09:00", close: "13:00", closed: true },
  sun: { open: "09:00", close: "13:00", closed: true },
};

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
  value: Pick<BusinessHoursData, "preset" | "customHours">;
  onChange: (next: Pick<BusinessHoursData, "preset" | "customHours">) => void;
}) {
  const customHours = {
    ...DEFAULT_CUSTOM_HOURS,
    ...(value.customHours || {}),
  };

  function updateCustomDay(
    day: keyof typeof DEFAULT_CUSTOM_HOURS,
    patch: Partial<(typeof DEFAULT_CUSTOM_HOURS)[keyof typeof DEFAULT_CUSTOM_HOURS]>,
  ) {
    onChange({
      preset: "custom",
      customHours: {
        ...customHours,
        [day]: {
          ...customHours[day],
          ...patch,
        },
      },
    });
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {PRESETS.map((p) => (
        <button
          key={p.value}
          type="button"
          onClick={() =>
            onChange({
              preset: p.value,
              customHours:
                p.value === "custom"
                  ? value.customHours || DEFAULT_CUSTOM_HOURS
                  : value.customHours,
            })
          }
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

      {value.preset === "custom" && (
        <div className="mt-2 rounded-xl border border-border bg-white p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-secondary">
            Custom hours
          </p>
          <div className="space-y-2">
            {DAYS.map((day) => {
              const dayValue = customHours[day.key];
              return (
                <div
                  key={day.key}
                  className="grid grid-cols-[44px_1fr_1fr_auto] items-center gap-2"
                >
                  <span className="text-sm font-medium text-text-primary">
                    {day.label}
                  </span>
                  <input
                    type="time"
                    value={dayValue.open}
                    disabled={dayValue.closed}
                    onChange={(e) =>
                      updateCustomDay(day.key, { open: e.target.value })
                    }
                    className="h-10 rounded-lg border border-border px-2 text-sm text-text-primary disabled:bg-bg disabled:text-text-secondary"
                  />
                  <input
                    type="time"
                    value={dayValue.close}
                    disabled={dayValue.closed}
                    onChange={(e) =>
                      updateCustomDay(day.key, { close: e.target.value })
                    }
                    className="h-10 rounded-lg border border-border px-2 text-sm text-text-primary disabled:bg-bg disabled:text-text-secondary"
                  />
                  <label className="flex items-center gap-1 text-xs text-text-secondary">
                    <input
                      type="checkbox"
                      checked={dayValue.closed}
                      onChange={(e) =>
                        updateCustomDay(day.key, { closed: e.target.checked })
                      }
                    />
                    Closed
                  </label>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
