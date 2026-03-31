"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  verticalSchema,
  type VerticalData,
} from "@/lib/validations/onboarding";
import {
  Flame,
  Droplets,
  Zap,
  Home,
  TreePine,
  Briefcase,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useOnboarding } from "./WizardShell";

interface StepProps {
  onNext: (data: Record<string, unknown>) => void;
  onValidityChange: (valid: boolean) => void;
}

const VERTICALS = [
  { value: "hvac" as const, label: "HVAC", icon: Flame },
  { value: "plumbing" as const, label: "Plumbing", icon: Droplets },
  { value: "electrical" as const, label: "Electrical", icon: Zap },
  { value: "roofing" as const, label: "Roofing", icon: Home },
  { value: "landscaping" as const, label: "Landscaping", icon: TreePine },
  { value: "other" as const, label: "Other", icon: Briefcase },
];

export function VerticalStep({ onNext, onValidityChange }: StepProps) {
  const vertical = useOnboarding((s) => s.vertical);

  const { handleSubmit, setValue, watch } = useForm<VerticalData>({
    resolver: zodResolver(verticalSchema),
    defaultValues: { vertical: vertical || undefined },
    mode: "onSubmit",
  });

  const selected = watch("vertical");

  useEffect(() => {
    onValidityChange(!!selected);
  }, [selected, onValidityChange]);

  return (
    <form
      id="onboarding-step"
      onSubmit={handleSubmit((data) => onNext(data))}
    >
      <h2 className="text-center font-heading text-2xl font-bold text-text-primary">
        What industry are you in?
      </h2>
      <p className="mt-2 text-center text-sm text-text-secondary">
        We&apos;ll customize your automations for your trade.
      </p>
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {VERTICALS.map((v) => {
          const Icon = v.icon;
          const isSelected = selected === v.value;
          return (
            <button
              key={v.value}
              type="button"
              onClick={() =>
                setValue("vertical", v.value, { shouldValidate: true })
              }
              className={cn(
                "flex min-h-[72px] flex-col items-center justify-center gap-2 rounded-xl border-2 p-4 text-sm font-medium transition-all",
                isSelected
                  ? "border-accent bg-accent-light text-accent ring-2 ring-accent/20"
                  : "border-border text-text-secondary hover:border-accent/40"
              )}
            >
              <Icon className="h-6 w-6" />
              {v.label}
            </button>
          );
        })}
      </div>
    </form>
  );
}
