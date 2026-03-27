"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  businessHoursSchema,
  type BusinessHoursData,
} from "@/lib/validations/onboarding";
import { cn } from "@/lib/utils";
import { useOnboarding } from "./WizardShell";

interface StepProps {
  onNext: (data: Record<string, unknown>) => void;
  onValidityChange: (valid: boolean) => void;
}

const PRESETS = [
  {
    value: "weekday_8_5" as const,
    label: "Mon–Fri, 8am–5pm",
    desc: "Standard business hours",
  },
  {
    value: "weekday_7_6" as const,
    label: "Mon–Fri, 7am–6pm",
    desc: "Extended weekday hours",
  },
  {
    value: "all_week" as const,
    label: "7 Days a Week",
    desc: "Mon–Sun, 8am–6pm",
  },
  {
    value: "custom" as const,
    label: "Custom Hours",
    desc: "Set your own schedule",
  },
];

export function BusinessHoursStep({ onNext, onValidityChange }: StepProps) {
  const businessHours = useOnboarding((s) => s.businessHours);

  const { handleSubmit, setValue, watch } = useForm<BusinessHoursData>({
    resolver: zodResolver(businessHoursSchema),
    defaultValues: { preset: businessHours.preset || "weekday_8_5" },
    mode: "onSubmit",
  });

  const selected = watch("preset");

  useEffect(() => {
    // All presets are valid — always enable Continue
    onValidityChange(true);
  }, [selected, onValidityChange]);

  return (
    <form
      id="onboarding-step"
      onSubmit={handleSubmit((data) => onNext(data))}
    >
      <h2 className="text-center font-heading text-2xl font-bold text-text-primary">
        What are your business hours?
      </h2>
      <p className="mt-2 text-center text-sm text-text-secondary">
        AI will handle calls outside these hours automatically.
      </p>
      <div className="mt-6 flex flex-col gap-3">
        {PRESETS.map((p) => (
          <button
            key={p.value}
            type="button"
            onClick={() =>
              setValue("preset", p.value, { shouldValidate: true })
            }
            className={cn(
              "flex min-h-[56px] flex-col rounded-xl border-2 px-4 py-3 text-left transition-all",
              selected === p.value
                ? "border-accent bg-accent-light ring-2 ring-accent/20"
                : "border-border hover:border-accent/40"
            )}
          >
            <span className="text-sm font-semibold text-text-primary">
              {p.label}
            </span>
            <span className="text-xs text-text-secondary">{p.desc}</span>
          </button>
        ))}
      </div>
    </form>
  );
}
