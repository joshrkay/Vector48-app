"use client";

import { useEffect } from "react";

interface StepProps {
  onNext: (data: Record<string, unknown>) => void;
  onValidityChange: (valid: boolean) => void;
}

export function WelcomeStep({ onNext, onValidityChange }: StepProps) {
  useEffect(() => {
    onValidityChange(true);
  }, [onValidityChange]);

  return (
    <form id="onboarding-step" onSubmit={(e) => {
      e.preventDefault();
      onNext({});
    }}>
      <p className="text-center font-heading text-2xl font-bold text-text-primary">
        Let&apos;s get your AI set up.
      </p>
    </form>
  );
}
