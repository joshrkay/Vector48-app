"use client";

import { AlertTriangle } from "lucide-react";

interface Props {
  active: boolean;
}

export function AIContextBanner({ active }: Props) {
  if (!active) return null;

  return (
    <div className="flex items-start gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-950">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
      <p>AI follow-up sequence is active for this contact. Replying here will pause the sequence.</p>
    </div>
  );
}
