"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  serviceAreaSchema,
  type ServiceAreaData,
} from "@/lib/validations/onboarding";
import { useOnboarding } from "./WizardShell";

interface StepProps {
  onNext: (data: Record<string, unknown>) => void;
  onValidityChange: (valid: boolean) => void;
}

export function ServiceAreaStep({ onNext, onValidityChange }: StepProps) {
  const serviceArea = useOnboarding((s) => s.serviceArea);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<ServiceAreaData>({
    resolver: zodResolver(serviceAreaSchema),
    defaultValues: { serviceArea },
    mode: "onSubmit",
  });

  const watched = watch("serviceArea");
  useEffect(() => {
    onValidityChange(watched.trim().length > 0);
  }, [watched, onValidityChange]);

  return (
    <form
      id="onboarding-step"
      onSubmit={handleSubmit((data) => onNext(data))}
    >
      <h2 className="text-center font-heading text-2xl font-bold text-text-primary">
        Where do you serve?
      </h2>
      <p className="mt-2 text-center text-sm text-text-secondary">
        City, zip code, or region. Helps us personalize outreach.
      </p>
      <input
        {...register("serviceArea")}
        type="text"
        placeholder="e.g. Dallas, TX or 75001"
        autoFocus
        className="mt-6 w-full rounded-xl border border-border bg-white px-4 py-3 text-lg text-text-primary placeholder:text-text-secondary/50 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
      />
      {errors.serviceArea && (
        <p className="mt-2 text-sm text-error">
          {errors.serviceArea.message}
        </p>
      )}
    </form>
  );
}
