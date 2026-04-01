"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  businessHoursSchema,
  type BusinessHoursData,
} from "@/lib/validations/onboarding";
import { useOnboarding } from "./WizardShell";
import { BusinessHoursFields } from "@/components/settings/BusinessHoursFields";

interface StepProps {
  onNext: (data: Record<string, unknown>) => void;
  onValidityChange: (valid: boolean) => void;
}

export function BusinessHoursStep({ onNext, onValidityChange }: StepProps) {
  const businessHours = useOnboarding((s) => s.businessHours);

  const { handleSubmit, setValue, watch } = useForm<BusinessHoursData>({
    resolver: zodResolver(businessHoursSchema),
    defaultValues: {
      preset: businessHours.preset || "weekday_8_5",
      customHours: businessHours.customHours,
    },
    mode: "onSubmit",
  });

  const selected = watch("preset");
  const customHours = watch("customHours");

  useEffect(() => {
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
      <BusinessHoursFields
        className="mt-6"
        value={{ preset: selected, customHours }}
        onChange={(next) => {
          setValue("preset", next.preset, { shouldValidate: true })
          setValue("customHours", next.customHours, { shouldValidate: true });
        }}
      />
    </form>
  );
}
