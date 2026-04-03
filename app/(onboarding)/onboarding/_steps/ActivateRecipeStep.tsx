"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  activateRecipeSchema,
  type ActivateRecipeData,
} from "@/lib/validations/onboarding";
import { cn } from "@/lib/utils";
import { Phone, CheckCircle2 } from "lucide-react";
import { useOnboarding } from "./WizardShell";

interface StepProps {
  onNext: (data: Record<string, unknown>) => void;
  onValidityChange: (valid: boolean) => void;
}

export function ActivateRecipeStep({ onNext, onValidityChange }: StepProps) {
  const activateRecipe1 = useOnboarding((s) => s.activateRecipe1);

  const { handleSubmit, setValue, watch } = useForm<ActivateRecipeData>({
    resolver: zodResolver(activateRecipeSchema),
    defaultValues: { activateRecipe1: activateRecipe1 ?? true },
    mode: "onSubmit",
  });

  const isActive = watch("activateRecipe1");

  useEffect(() => {
    // Always valid — user can choose yes or no
    onValidityChange(true);
  }, [onValidityChange]);

  return (
    <form
      id="onboarding-step"
      onSubmit={handleSubmit((data) => onNext(data))}
    >
      <h2 className="text-center font-heading text-2xl font-bold text-text-primary">
        Activate your first recipe?
      </h2>
      <p className="mt-2 text-center text-sm text-text-secondary">
        Start capturing missed calls with AI right away.
      </p>

      <button
        type="button"
        onClick={() =>
          setValue("activateRecipe1", !isActive, { shouldValidate: true })
        }
        className={cn(
          "mt-6 flex w-full items-start gap-4 rounded-2xl border-2 p-5 text-left transition-all",
          isActive
            ? "border-v48-accent bg-v48-accent-light ring-2 ring-v48-accent/20"
            : "border-border hover:border-v48-accent/40"
        )}
      >
        <div
          className={cn(
            "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl",
            isActive ? "bg-v48-accent text-white" : "bg-bg text-text-secondary"
          )}
        >
          <Phone className="h-6 w-6" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="font-heading text-base font-bold text-text-primary">
              AI Phone Answering
            </span>
            {isActive && (
              <CheckCircle2 className="h-5 w-5 text-v48-accent" />
            )}
          </div>
          <p className="mt-1 text-sm text-text-secondary">
            Never miss a call again. AI answers when you can&apos;t, captures
            the caller&apos;s info, and texts you a summary instantly.
          </p>
          <span
            className={cn(
              "mt-3 inline-block rounded-full px-3 py-1 text-xs font-semibold",
              isActive
                ? "bg-v48-accent/10 text-v48-accent"
                : "bg-bg text-text-secondary"
            )}
          >
            {isActive ? "Active" : "Tap to activate"}
          </span>
        </div>
      </button>
    </form>
  );
}
