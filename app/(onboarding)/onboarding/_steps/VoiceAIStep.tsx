"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { voiceAISchema, type VoiceAIData } from "@/lib/validations/onboarding";
import { cn } from "@/lib/utils";
import { useOnboarding } from "./WizardShell";

interface StepProps {
  onNext: (data: Record<string, unknown>) => void;
  onValidityChange: (valid: boolean) => void;
}

const GREETING_TEMPLATES: Record<string, string> = {
  hvac: "Hi, you've reached {business}. I'm out on a job right now but I want to make sure we take care of you. How can I help?",
  plumbing:
    "Thanks for calling {business}. We handle everything from leaks to full remodels. How can I help you today?",
  electrical:
    "Hi, you've reached {business}. Whether it's a small repair or a big project, we've got you covered. How can I help?",
  roofing:
    "Hi, this is {business}. If you're dealing with storm damage or a leak, you've called the right place. How can I help?",
  landscaping:
    "Thanks for calling {business}. We'd love to help with your outdoor space. What can we do for you?",
};

export function VoiceAIStep({ onNext, onValidityChange }: StepProps) {
  const voiceGender = useOnboarding((s) => s.voiceGender);
  const greetingText = useOnboarding((s) => s.greetingText);
  const businessName = useOnboarding((s) => s.businessName);
  const vertical = useOnboarding((s) => s.vertical);

  const defaultGreeting =
    greetingText ||
    (GREETING_TEMPLATES[vertical || "hvac"] || GREETING_TEMPLATES.hvac).replace(
      "{business}",
      businessName || "our company"
    );

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<VoiceAIData>({
    resolver: zodResolver(voiceAISchema),
    defaultValues: {
      voiceGender: voiceGender || "male",
      greetingText: defaultGreeting,
    },
    mode: "onSubmit",
  });

  const watchedGender = watch("voiceGender");
  const watchedGreeting = watch("greetingText");

  useEffect(() => {
    onValidityChange(watchedGreeting.trim().length > 0);
  }, [watchedGreeting, onValidityChange]);

  return (
    <form
      id="onboarding-step"
      onSubmit={handleSubmit((data) => onNext(data))}
    >
      <h2 className="text-center font-heading text-2xl font-bold text-text-primary">
        Set up your AI voice greeting
      </h2>
      <p className="mt-2 text-center text-sm text-text-secondary">
        Choose a voice and customize what callers hear.
      </p>

      {/* Gender toggle */}
      <div className="mt-6 flex gap-3">
        {(["male", "female"] as const).map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => setValue("voiceGender", g, { shouldValidate: true })}
            className={cn(
              "flex h-12 flex-1 items-center justify-center rounded-xl border-2 text-sm font-semibold capitalize transition-all",
              watchedGender === g
                ? "border-accent bg-accent-light text-accent ring-2 ring-accent/20"
                : "border-border text-text-secondary hover:border-accent/40"
            )}
          >
            {g}
          </button>
        ))}
      </div>

      {/* Greeting textarea */}
      <textarea
        {...register("greetingText")}
        rows={4}
        className="mt-4 w-full resize-none rounded-xl border border-border bg-white px-4 py-3 text-sm text-text-primary placeholder:text-text-secondary/50 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
        placeholder="Enter your greeting message..."
      />
      {errors.greetingText && (
        <p className="mt-2 text-sm text-error">
          {errors.greetingText.message}
        </p>
      )}
      <p className="mt-1 text-xs text-text-secondary">
        {watchedGreeting.length}/500 characters
      </p>
    </form>
  );
}
