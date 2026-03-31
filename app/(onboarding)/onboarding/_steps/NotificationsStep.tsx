"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  notificationsSchema,
  type NotificationsData,
} from "@/lib/validations/onboarding";
import { useOnboarding } from "./WizardShell";

interface StepProps {
  onNext: (data: Record<string, unknown>) => void;
  onValidityChange: (valid: boolean) => void;
}

export function NotificationsStep({ onNext, onValidityChange }: StepProps) {
  const notificationContactName = useOnboarding((s) => s.notificationContactName);
  const notificationContactPhone = useOnboarding((s) => s.notificationContactPhone);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<NotificationsData>({
    resolver: zodResolver(notificationsSchema),
    defaultValues: {
      notificationContactName: notificationContactName || "",
      notificationContactPhone: notificationContactPhone || "",
    },
    mode: "onSubmit",
  });

  const watchedPhone = watch("notificationContactPhone");

  useEffect(() => {
    onValidityChange(watchedPhone.trim().length > 0);
  }, [watchedPhone, onValidityChange]);

  return (
    <form
      id="onboarding-step"
      onSubmit={handleSubmit((data) => onNext(data))}
    >
      <h2 className="text-center font-heading text-2xl font-bold text-text-primary">
        How should we notify you?
      </h2>
      <p className="mt-2 text-center text-sm text-text-secondary">
        Get alerts when AI handles a call or a lead comes in.
      </p>

      {/* Contact name */}
      <input
        {...register("notificationContactName")}
        type="text"
        placeholder="Contact name (optional)"
        className="mt-6 w-full rounded-xl border border-border bg-white px-4 py-3 text-sm text-text-primary placeholder:text-text-secondary/50 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
      />

      {/* Phone input */}
      <input
        {...register("notificationContactPhone")}
        type="tel"
        placeholder="(555) 123-4567"
        className="mt-4 w-full rounded-xl border border-border bg-white px-4 py-3 text-lg text-text-primary placeholder:text-text-secondary/50 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
      />
      {errors.notificationContactPhone && (
        <p className="mt-2 text-sm text-error">
          {errors.notificationContactPhone.message}
        </p>
      )}
    </form>
  );
}
