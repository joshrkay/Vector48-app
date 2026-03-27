"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  businessNameSchema,
  type BusinessNameData,
} from "@/lib/validations/onboarding";
import { useOnboarding } from "./WizardShell";

interface StepProps {
  onNext: (data: Record<string, unknown>) => void;
  onValidityChange: (valid: boolean) => void;
}

export function BusinessNameStep({ onNext, onValidityChange }: StepProps) {
  const businessName = useOnboarding((s) => s.businessName);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<BusinessNameData>({
    resolver: zodResolver(businessNameSchema),
    defaultValues: { businessName },
    mode: "onSubmit",
  });

  const watched = watch("businessName");
  useEffect(() => {
    onValidityChange(watched.trim().length > 0);
  }, [watched, onValidityChange]);

  return (
    <form
      id="onboarding-step"
      onSubmit={handleSubmit((data) => onNext(data))}
    >
      <h2 className="text-center font-heading text-2xl font-bold text-text-primary">
        What&apos;s your business name?
      </h2>
      <p className="mt-2 text-center text-sm text-text-secondary">
        This is how your customers will see you.
      </p>
      <input
        {...register("businessName")}
        type="text"
        placeholder="e.g. Smith HVAC Services"
        autoFocus
        className="mt-6 w-full rounded-xl border border-border bg-white px-4 py-3 text-lg text-text-primary placeholder:text-text-secondary/50 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
      />
      {errors.businessName && (
        <p className="mt-2 text-sm text-error">{errors.businessName.message}</p>
      )}
    </form>
  );
}
