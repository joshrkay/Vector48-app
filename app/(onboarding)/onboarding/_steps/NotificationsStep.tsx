"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  notificationsSchema,
  type NotificationsData,
} from "@/lib/validations/onboarding";
import { cn } from "@/lib/utils";
import { MessageSquare, Mail } from "lucide-react";
import { useOnboarding } from "./WizardShell";

interface StepProps {
  onNext: (data: Record<string, unknown>) => void;
  onValidityChange: (valid: boolean) => void;
}

export function NotificationsStep({ onNext, onValidityChange }: StepProps) {
  const notificationSms = useOnboarding((s) => s.notificationSms);
  const notificationEmail = useOnboarding((s) => s.notificationEmail);
  const notificationContact = useOnboarding((s) => s.notificationContact);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<NotificationsData>({
    resolver: zodResolver(notificationsSchema),
    defaultValues: {
      notificationSms: notificationSms ?? true,
      notificationEmail: notificationEmail ?? false,
      notificationContact: notificationContact || "",
    },
    mode: "onSubmit",
  });

  const watchedSms = watch("notificationSms");
  const watchedEmail = watch("notificationEmail");
  const watchedContact = watch("notificationContact");

  useEffect(() => {
    const hasMethod = watchedSms || watchedEmail;
    const hasContact = watchedContact.trim().length > 0;
    onValidityChange(hasMethod && hasContact);
  }, [watchedSms, watchedEmail, watchedContact, onValidityChange]);

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

      {/* Toggle buttons */}
      <div className="mt-6 flex gap-3">
        <button
          type="button"
          onClick={() =>
            setValue("notificationSms", !watchedSms, { shouldValidate: true })
          }
          className={cn(
            "flex h-14 flex-1 items-center justify-center gap-2 rounded-xl border-2 text-sm font-semibold transition-all",
            watchedSms
              ? "border-accent bg-accent-light text-accent ring-2 ring-accent/20"
              : "border-border text-text-secondary hover:border-accent/40"
          )}
        >
          <MessageSquare className="h-5 w-5" />
          SMS
        </button>
        <button
          type="button"
          onClick={() =>
            setValue("notificationEmail", !watchedEmail, {
              shouldValidate: true,
            })
          }
          className={cn(
            "flex h-14 flex-1 items-center justify-center gap-2 rounded-xl border-2 text-sm font-semibold transition-all",
            watchedEmail
              ? "border-accent bg-accent-light text-accent ring-2 ring-accent/20"
              : "border-border text-text-secondary hover:border-accent/40"
          )}
        >
          <Mail className="h-5 w-5" />
          Email
        </button>
      </div>
      {errors.notificationSms && (
        <p className="mt-2 text-sm text-error">
          {errors.notificationSms.message}
        </p>
      )}

      {/* Contact input */}
      <input
        {...register("notificationContact")}
        type={watchedEmail && !watchedSms ? "email" : "tel"}
        placeholder={
          watchedEmail && !watchedSms
            ? "your@email.com"
            : "(555) 123-4567"
        }
        className="mt-4 w-full rounded-xl border border-border bg-white px-4 py-3 text-lg text-text-primary placeholder:text-text-secondary/50 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
      />
      {errors.notificationContact && (
        <p className="mt-2 text-sm text-error">
          {errors.notificationContact.message}
        </p>
      )}
    </form>
  );
}
