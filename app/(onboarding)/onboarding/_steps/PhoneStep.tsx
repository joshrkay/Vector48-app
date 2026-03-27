"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { phoneSchema, type PhoneData } from "@/lib/validations/onboarding";
import { useOnboarding } from "./WizardShell";

interface StepProps {
  onNext: (data: Record<string, unknown>) => void;
  onValidityChange: (valid: boolean) => void;
}

export function PhoneStep({ onNext, onValidityChange }: StepProps) {
  const phone = useOnboarding((s) => s.phone);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<PhoneData>({
    resolver: zodResolver(phoneSchema),
    defaultValues: { phone },
    mode: "onSubmit",
  });

  const watched = watch("phone");
  useEffect(() => {
    onValidityChange(watched.trim().length >= 10);
  }, [watched, onValidityChange]);

  return (
    <form
      id="onboarding-step"
      onSubmit={handleSubmit((data) => onNext(data))}
    >
      <h2 className="text-center font-heading text-2xl font-bold text-text-primary">
        What&apos;s your business phone number?
      </h2>
      <p className="mt-2 text-center text-sm text-text-secondary">
        This is the number your customers call. We&apos;ll route missed calls
        through AI.
      </p>
      <input
        {...register("phone")}
        type="tel"
        placeholder="(555) 123-4567"
        autoFocus
        className="mt-6 w-full rounded-xl border border-border bg-white px-4 py-3 text-lg text-text-primary placeholder:text-text-secondary/50 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
      />
      {errors.phone && (
        <p className="mt-2 text-sm text-error">{errors.phone.message}</p>
      )}
    </form>
  );
}
