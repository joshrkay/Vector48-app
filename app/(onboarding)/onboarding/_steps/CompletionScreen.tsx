"use client";

import { motion } from "framer-motion";
import { Check } from "lucide-react";
import Link from "next/link";
import { useOnboarding } from "./WizardShell";

const VERTICAL_LABELS: Record<string, string> = {
  hvac: "HVAC",
  plumbing: "Plumbing",
  electrical: "Electrical",
  roofing: "Roofing",
  landscaping: "Landscaping",
};

export function CompletionScreen() {
  const businessName = useOnboarding((s) => s.businessName);
  const vertical = useOnboarding((s) => s.vertical);
  const activateRecipe1 = useOnboarding((s) => s.activateRecipe1);

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-lg rounded-2xl bg-surface p-8 text-center shadow-xl">
        {/* Animated checkmark */}
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.1 }}
          className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-accent"
        >
          <Check className="h-10 w-10 text-white" strokeWidth={3} />
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mt-6 font-heading text-3xl font-bold text-text-primary"
        >
          You&apos;re live.
        </motion.h1>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45 }}
          className="mt-3 space-y-1 text-sm text-text-secondary"
        >
          <p>
            <span className="font-semibold text-text-primary">
              {businessName}
            </span>{" "}
            is set up for{" "}
            <span className="font-semibold text-text-primary">
              {VERTICAL_LABELS[vertical] || vertical}
            </span>
            .
          </p>
          {activateRecipe1 && (
            <p className="text-accent">
              AI Phone Answering is active and ready.
            </p>
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
        >
          <Link
            href="/dashboard"
            className="mt-8 inline-flex h-12 w-full items-center justify-center rounded-xl bg-accent text-sm font-semibold text-white transition-colors hover:bg-accent/90"
          >
            Go to Dashboard
          </Link>
        </motion.div>
      </div>
    </div>
  );
}
