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
  const notificationContact = useOnboarding((s) => s.notificationContact);
  const notificationSms = useOnboarding((s) => s.notificationSms);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<NotificationsData>({
    resolver: zodResolver(notificationsSchema),
    defaultValues: {
      notificationContact: notificationContact || "",
      notificationSms: notificationSms ?? false,
    },
    mode: "onSubmit",
  });

  const watchedContact = watch("notificationContact");

  useEffect(() => {
    onValidityChange(watchedContact.trim().length > 0);
  }, [watchedContact, onValidityChange]);

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

      {/* Phone input */}
      <input
        {...register("notificationContact")}
        type="tel"
        placeholder="(555) 123-4567"
        className="mt-6 w-full rounded-xl border border-border bg-white px-4 py-3 text-lg text-text-primary placeholder:text-text-secondary/50 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
      />
      {errors.notificationContact && (
        <p className="mt-2 text-sm text-error">
          {errors.notificationContact.message}
        </p>
      )}

      <label className="mt-4 flex items-center gap-2 text-sm text-text-secondary">
        <input
          {...register("notificationSms")}
          type="checkbox"
          className="h-4 w-4 rounded border-border text-accent focus:ring-accent"
        />
        Enable SMS notifications
      </label>
    </form>
  );
}
