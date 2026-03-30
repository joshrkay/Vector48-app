"use client";

import { useRef, useState, useCallback, useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  createOnboardingStore,
  type OnboardingState,
  type OnboardingStore,
} from "@/lib/stores/onboarding-store";
import { saveOnboardingStep, completeOnboarding } from "../actions";

import { BusinessNameStep } from "./BusinessNameStep";
import { VerticalStep } from "./VerticalStep";
import { PhoneStep } from "./PhoneStep";
import { BusinessHoursStep } from "./BusinessHoursStep";
import { VoiceAIStep } from "./VoiceAIStep";
import { NotificationsStep } from "./NotificationsStep";
import { ActivateRecipeStep } from "./ActivateRecipeStep";
import { CompletionScreen } from "./CompletionScreen";

const TOTAL_STEPS = 7;

interface WizardShellProps {
  accountId: string;
  initialData: Partial<OnboardingState>;
}

// Zustand store context to avoid prop drilling
import { createContext, useContext } from "react";
import { useStore, type StoreApi } from "zustand";

const StoreContext = createContext<StoreApi<OnboardingStore> | null>(null);

export function useOnboarding<T>(selector: (s: OnboardingStore) => T): T {
  const store = useContext(StoreContext);
  if (!store) throw new Error("Missing StoreContext.Provider");
  return useStore(store, selector);
}

export function WizardShell({ accountId, initialData }: WizardShellProps) {
  const storeRef = useRef<StoreApi<OnboardingStore> | null>(null);
  if (!storeRef.current) {
    storeRef.current = createOnboardingStore({ ...initialData, accountId });
  }

  const [direction, setDirection] = useState(1);
  const [isStepValid, setIsStepValid] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const currentStep = useStore(storeRef.current, (s) => s.currentStep);

  const handleNext = useCallback(
    async (data: Record<string, unknown>) => {
      if (!storeRef.current) return;
      setIsSaving(true);

      const store = storeRef.current.getState();

      // Save step data to store
      storeRef.current.getState().setStepData(data);

      // Persist to DB
      if (currentStep < TOTAL_STEPS - 1) {
        await saveOnboardingStep(accountId, currentStep, data);
      } else {
        // Last step — complete onboarding
        await completeOnboarding(
          accountId,
          (data.activateRecipe1 as boolean) ?? true,
          {
            voiceGender: store.voiceGender,
            greetingText: store.greetingText,
          }
        );
      }

      setDirection(1);
      storeRef.current.getState().nextStep();
      setIsStepValid(false);
      setIsSaving(false);
    },
    [accountId, currentStep]
  );

  const handleBack = useCallback(() => {
    setDirection(-1);
    storeRef.current?.getState().prevStep();
    setIsStepValid(true);
  }, []);

  const handleValidityChange = useCallback((valid: boolean) => {
    setIsStepValid(valid);
  }, []);

  const slideVariants = useMemo(
    () => ({
      enter: (dir: number) => ({ x: dir > 0 ? 80 : -80, opacity: 0 }),
      center: { x: 0, opacity: 1 },
      exit: (dir: number) => ({ x: dir > 0 ? -80 : 80, opacity: 0 }),
    }),
    []
  );

  // Completion screen — no header or progress bar
  if (currentStep >= TOTAL_STEPS) {
    return (
      <StoreContext.Provider value={storeRef.current}>
        <CompletionScreen />
      </StoreContext.Provider>
    );
  }

  const progress = ((currentStep + 1) / TOTAL_STEPS) * 100;

  return (
    <StoreContext.Provider value={storeRef.current}>
      <div className="flex min-h-screen flex-col">
        {/* Header bar — 56px */}
        <header className="flex h-14 shrink-0 items-center justify-between bg-brand px-4 sm:px-6">
          <span className="font-heading text-lg font-bold text-white">
            Vector 40
          </span>
          <span className="text-sm text-white/70">
            {currentStep + 1} of {TOTAL_STEPS}
          </span>
        </header>

        {/* Progress bar */}
        <div className="h-1 w-full bg-white/10">
          <motion.div
            className="h-full bg-accent"
            initial={false}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
          />
        </div>

        {/* Step content */}
        <div className="flex flex-1 items-center justify-center px-4 py-8">
          <div className="w-full max-w-lg rounded-2xl bg-surface p-8 shadow-xl">
            <AnimatePresence mode="wait" custom={direction}>
              <motion.div
                key={currentStep}
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.25, ease: "easeInOut" }}
              >
                <StepRenderer
                  step={currentStep}
                  onNext={handleNext}
                  onValidityChange={handleValidityChange}
                />
              </motion.div>
            </AnimatePresence>

            {/* Navigation buttons */}
            <div className="mt-8 flex gap-3">
              {currentStep > 0 && (
                <button
                  type="button"
                  onClick={handleBack}
                  className="flex h-12 items-center justify-center gap-2 rounded-xl border border-border px-4 text-sm font-medium text-text-secondary transition-colors hover:bg-bg sm:w-auto"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </button>
              )}
              <button
                type="submit"
                form="onboarding-step"
                disabled={!isStepValid || isSaving}
                className={cn(
                  "flex h-12 flex-1 items-center justify-center rounded-xl text-sm font-semibold text-white transition-colors",
                  isStepValid && !isSaving
                    ? "bg-accent hover:bg-accent/90"
                    : "cursor-not-allowed bg-accent/40"
                )}
              >
                {isSaving
                  ? "Saving..."
                  : currentStep === TOTAL_STEPS - 1
                    ? "Finish Setup"
                    : "Continue"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </StoreContext.Provider>
  );
}

function StepRenderer({
  step,
  onNext,
  onValidityChange,
}: {
  step: number;
  onNext: (data: Record<string, unknown>) => void;
  onValidityChange: (valid: boolean) => void;
}) {
  const props = { onNext, onValidityChange };
  switch (step) {
    case 0:
      return <BusinessNameStep {...props} />;
    case 1:
      return <VerticalStep {...props} />;
    case 2:
      return <PhoneStep {...props} />;
    case 3:
      return <BusinessHoursStep {...props} />;
    case 4:
      return <VoiceAIStep {...props} />;
    case 5:
      return <NotificationsStep {...props} />;
    case 6:
      return <ActivateRecipeStep {...props} />;
    default:
      return null;
  }
}
