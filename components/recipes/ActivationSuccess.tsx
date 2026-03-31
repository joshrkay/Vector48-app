"use client";

import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { useEffect } from "react";

export function ActivationSuccess({
  onComplete,
}: {
  onComplete: () => void;
}) {
  useEffect(() => {
    const t = window.setTimeout(onComplete, 1500);
    return () => window.clearTimeout(t);
  }, [onComplete]);

  return (
    <div className="flex flex-col items-center justify-center py-10">
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 420, damping: 22 }}
        className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500 text-white shadow-lg"
      >
        <Check className="h-8 w-8" strokeWidth={3} />
      </motion.div>
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.12 }}
        className="mt-4 text-center font-heading text-lg font-semibold text-[var(--text-primary)]"
      >
        Recipe is live.
      </motion.p>
    </div>
  );
}
