"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2 } from "lucide-react";
import type { RecipeWithStatus } from "@/lib/recipes/types";
import type { AccountProfileSlice } from "@/lib/recipes/activationValidator";
import { catalogIntegrationToDbProvider } from "@/lib/recipes/catalogIntegrationMap";
import {
  getAccountProfileValue,
  isProfileValuePresent,
} from "@/lib/recipes/profileFields";
import { useMediaQuery } from "@/lib/hooks/useMediaQuery";
import { getRecipeLucideIcon } from "@/components/recipes/recipeIcons";
import { RecipeConfigForm } from "@/components/recipes/RecipeConfigForm";
import { ActivationSuccess } from "@/components/recipes/ActivationSuccess";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const INTEGRATION_LABELS: Record<string, string> = {
  twilio: "Twilio",
  elevenlabs: "ElevenLabs",
  google_business: "Google Business",
  jobber: "Jobber",
  servicetitan: "ServiceTitan",
};

function integrationDisplayName(key: string): string {
  return INTEGRATION_LABELS[key] ?? key;
}

function missingRequiredIntegrations(
  required: string[],
  connectedProviders: string[],
): string[] {
  const missing: string[] = [];
  for (const key of required) {
    const db = catalogIntegrationToDbProvider(key);
    if (!db || !connectedProviders.includes(db)) {
      missing.push(key);
    }
  }
  return missing;
}

const FORM_ID = "recipe-activation-config";

export interface ActivationSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipe: RecipeWithStatus;
  profile: AccountProfileSlice | null;
  /** DB integration_provider values that are connected */
  connectedProviders: string[];
}

export function ActivationSheet({
  open,
  onOpenChange,
  recipe,
  profile,
  connectedProviders,
}: ActivationSheetProps) {
  const router = useRouter();
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const [phase, setPhase] = useState<
    "form" | "loading" | "success" | "error" | "plan_limit"
  >("form");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [planMessage, setPlanMessage] = useState<{
    message: string;
    upgradeHref: string;
    planDisplayName: string;
  } | null>(null);

  const Icon = getRecipeLucideIcon(recipe.icon);

  const { prefilledCount, totalFields } = useMemo(() => {
    let n = 0;
    for (const f of recipe.configFields) {
      if (!f.defaultFromProfile || !profile) continue;
      const pv = getAccountProfileValue(profile, f.defaultFromProfile);
      if (isProfileValuePresent(pv)) n += 1;
    }
    return { prefilledCount: n, totalFields: recipe.configFields.length };
  }, [recipe.configFields, profile]);

  const missingIntegrations = useMemo(
    () =>
      missingRequiredIntegrations(
        recipe.requiredIntegrations,
        connectedProviders,
      ),
    [recipe.requiredIntegrations, connectedProviders],
  );

  const resetState = useCallback(() => {
    setPhase("form");
    setErrorMessage(null);
    setPlanMessage(null);
  }, []);

  useEffect(() => {
    if (open) {
      resetState();
    }
  }, [open, resetState]);

  useEffect(() => {
    if (!open) return;
    const onVis = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [open, router]);

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      resetState();
    }
    onOpenChange(next);
  };

  const onConfigSubmit = async (config: Record<string, unknown>) => {
    setErrorMessage(null);
    setPlanMessage(null);
    setPhase("loading");
    try {
      const res = await fetch("/api/recipes/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipeSlug: recipe.slug, config }),
      });
      const data = (await res.json()) as Record<string, unknown>;

      if (res.ok && data.ok === false && data.code === "PLAN_LIMIT") {
        setPhase("plan_limit");
        setPlanMessage({
          message: String(data.message ?? ""),
          upgradeHref: String(data.upgradeHref ?? "/settings?tab=billing"),
          planDisplayName: String(data.planDisplayName ?? ""),
        });
        return;
      }

      if (!res.ok) {
        setPhase("error");
        setErrorMessage(
          typeof data.error === "string"
            ? data.error
            : "Something went wrong. Try again.",
        );
        return;
      }

      if (data.success === true) {
        setPhase("success");
        return;
      }

      setPhase("error");
      setErrorMessage("Unexpected response from server.");
    } catch {
      setPhase("error");
      setErrorMessage("Network error. Check your connection and retry.");
    }
  };

  const onSuccessComplete = useCallback(() => {
    resetState();
    onOpenChange(false);
    router.refresh();
  }, [onOpenChange, resetState, router]);

  const descriptionText =
    recipe.detailedDescription?.trim() || recipe.description;

  const body = (
    <div className="flex max-h-[min(70vh,560px)] flex-col gap-4 overflow-y-auto pr-1">
      {phase === "success" ? (
        <ActivationSuccess onComplete={onSuccessComplete} />
      ) : (
        <>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)]">
              What this does
            </p>
            <p className="mt-1 text-sm leading-relaxed text-[var(--text-primary)]">
              {descriptionText}
            </p>
          </div>

          {phase === "plan_limit" && planMessage && (
            <div
              className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"
              role="status"
            >
              <p>{planMessage.message}</p>
              <Link
                href={planMessage.upgradeHref}
                className="mt-2 inline-block font-semibold text-amber-900 underline"
              >
                Upgrade →
              </Link>
            </div>
          )}

          {phase === "error" && errorMessage && (
            <div
              className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900"
              role="alert"
            >
              {errorMessage}
            </div>
          )}

          {missingIntegrations.length > 0 && (
            <div className="space-y-2">
              {missingIntegrations.map((key) => (
                <div
                  key={key}
                  className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"
                >
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <p>
                      This recipe needs your{" "}
                      <strong>{integrationDisplayName(key)}</strong> account
                      connected.
                    </p>
                    <Link
                      href="/settings?tab=integrations"
                      className="mt-1 inline-block font-semibold text-amber-900 underline"
                    >
                      Connect now →
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}

          <RecipeConfigForm
            configFields={recipe.configFields}
            profile={profile}
            formId={FORM_ID}
            onSubmit={onConfigSubmit}
          />
        </>
      )}
    </div>
  );

  const footer = (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <button
        type="button"
        className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        onClick={() => handleOpenChange(false)}
        disabled={phase === "loading"}
      >
        Cancel
      </button>
      <div className="flex gap-2">
        {phase === "error" && (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setPhase("form");
              setErrorMessage(null);
            }}
          >
            Retry
          </Button>
        )}
        {phase !== "success" && (
          <Button
            type="submit"
            form={FORM_ID}
            disabled={
              phase === "loading" ||
              missingIntegrations.length > 0 ||
              phase === "plan_limit"
            }
            className="bg-[var(--v48-accent)] text-white hover:opacity-90"
          >
            {phase === "loading" ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Setting up…
              </>
            ) : (
              "Activate Recipe"
            )}
          </Button>
        )}
      </div>
    </div>
  );

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-h-[90vh] max-w-lg gap-0 overflow-hidden p-0">
          <DialogHeader className="space-y-3 border-b border-[var(--v48-border)] p-6 pb-4">
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gray-100",
                )}
              >
                <Icon
                  className="h-6 w-6 text-[var(--text-primary)]"
                  strokeWidth={1.5}
                />
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-left font-heading text-xl">
                  {recipe.name}
                </DialogTitle>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  {prefilledCount} of {totalFields} fields pre-filled
                </p>
              </div>
            </div>
            <DialogDescription className="sr-only">
              Configure and activate {recipe.name}
            </DialogDescription>
          </DialogHeader>
          <div className="px-6 py-4">{body}</div>
          <DialogFooter className="border-t border-[var(--v48-border)] p-6 pt-4">
            {footer}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="bottom"
        className="flex max-h-[90vh] flex-col gap-0 overflow-hidden rounded-t-2xl p-0"
      >
        <SheetHeader className="space-y-3 border-b border-[var(--v48-border)] p-5 pb-4 text-left">
          <div className="flex items-start gap-3">
            <div
              className={cn(
                "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gray-100",
              )}
            >
              <Icon
                className="h-6 w-6 text-[var(--text-primary)]"
                strokeWidth={1.5}
              />
            </div>
            <div className="min-w-0">
              <SheetTitle className="text-left font-heading text-xl">
                {recipe.name}
              </SheetTitle>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                {prefilledCount} of {totalFields} fields pre-filled
              </p>
            </div>
          </div>
          <SheetDescription className="sr-only">
            Configure and activate {recipe.name}
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-5 py-4">{body}</div>
        <SheetFooter className="border-t border-[var(--v48-border)] p-5 pt-4 sm:flex-col">
          {footer}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
