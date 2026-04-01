"use client";

import { motion } from "framer-motion";
import { CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useOnboarding } from "./WizardShell";

const VERTICAL_LABELS: Record<string, string> = {
  hvac: "HVAC",
  plumbing: "Plumbing",
  electrical: "Electrical",
  roofing: "Roofing",
  landscaping: "Landscaping",
};

export function CompletionScreen() {
  const router = useRouter();
  const businessName = useOnboarding((s) => s.businessName);
  const vertical = useOnboarding((s) => s.vertical);
  const activateRecipe1 = useOnboarding((s) => s.activateRecipe1);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0F1E35] px-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-8 text-center shadow-xl">
        <motion.div
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 220, damping: 16, delay: 0.1 }}
          className="mx-auto"
        >
          <CheckCircle2 className="h-16 w-16 text-teal-500" strokeWidth={2.5} />
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mt-6 text-center font-heading text-[28px] font-bold text-[#0F1E35]"
        >
          You&apos;re live.
        </motion.h1>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45 }}
          className="mt-3 space-y-1 text-sm text-slate-600"
        >
          <p>
            <span className="font-semibold text-slate-900">{businessName}</span> is set up for{" "}
            <span className="font-semibold text-slate-900">{VERTICAL_LABELS[vertical] || vertical}</span>.
          </p>
          {activateRecipe1 && <p className="text-teal-600">AI Phone Answering is active and ready.</p>}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
        >
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="mt-8 inline-flex h-12 w-full items-center justify-center rounded-xl bg-teal-500 text-sm font-semibold text-white transition-colors hover:bg-teal-600"
          >
            Go to Dashboard
          </button>
        </motion.div>
      </div>
    </div>
  );
}
