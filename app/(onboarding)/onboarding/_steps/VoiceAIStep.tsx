"use client";

import { useEffect, useState } from "react";
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
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [previewMessage, setPreviewMessage] = useState<string | null>(null);
  const voiceGender = useOnboarding((s) => s.voiceGender);
  const greetingText = useOnboarding((s) => s.greetingText);
  const businessName = useOnboarding((s) => s.businessName);
  const vertical = useOnboarding((s) => s.vertical);
  const businessFirstWord = businessName.trim().split(/\s+/)[0] || "our company";

  const defaultGreeting =
    greetingText ||
    (GREETING_TEMPLATES[vertical || "hvac"] || GREETING_TEMPLATES.hvac).replace(
      "{business}",
      businessFirstWord
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

  const handlePreview = async () => {
    setIsPreviewLoading(true);
    try {
      const res = await fetch("/api/voice/preview");
      const data = (await res.json().catch(() => null)) as
        | { message?: string }
        | null;
      setPreviewMessage(data?.message || "Voice preview coming soon");
    } catch {
      setPreviewMessage(null);
    } finally {
      setIsPreviewLoading(false);
    }
  };

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

      <div className="mt-4 rounded-xl border border-border bg-surface/40 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-text-primary">
              Audio preview
            </p>
            <p className="text-xs text-text-secondary">
              Hear a sample of your current greeting voice.
            </p>
          </div>
          <button
            type="button"
            onClick={handlePreview}
            disabled={isPreviewLoading}
            className={cn(
              "rounded-lg border border-border px-3 py-2 text-xs font-semibold text-text-primary transition-colors",
              isPreviewLoading
                ? "cursor-not-allowed opacity-60"
                : "hover:border-accent/40 hover:bg-accent-light"
            )}
          >
            {isPreviewLoading ? "Loading..." : "Play preview"}
          </button>
        </div>
        {previewMessage && (
          <p className="mt-3 text-xs text-text-secondary">{previewMessage}</p>
        )}
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
