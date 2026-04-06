"use client";

import * as React from "react";
import Link from "next/link";

export interface VoiceToastState {
  id: number;
  message: string;
  openRoute?: string;
  type?: "answer" | "clarify" | "navigate" | "action";
}

interface VoiceToastProps {
  toast: VoiceToastState | null;
  onDismiss: () => void;
}

const AUTO_DISMISS_MS = 4_000;

export function VoiceToast({ toast, onDismiss }: VoiceToastProps) {
  React.useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => {
      onDismiss();
    }, AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [toast, onDismiss]);

  if (!toast) return null;

  return (
    <div className="pointer-events-none fixed bottom-24 left-1/2 z-50 w-[min(92vw,30rem)] -translate-x-1/2 md:bottom-8">
      <div className="pointer-events-auto flex items-start justify-between gap-3 rounded-xl bg-[#0F1E35] px-4 py-3 text-sm text-white shadow-lg">
        <div className="min-w-0">
          <p className="line-clamp-2">{toast.message}</p>
          {toast.type === "clarify" ? (
            <p className="mt-1 text-xs text-white/60">Tap mic to answer</p>
          ) : null}
        </div>
        {toast.openRoute ? (
          <Link
            href={toast.openRoute}
            className="shrink-0 rounded-md bg-white/15 px-2 py-1 text-xs font-semibold text-white transition-colors hover:bg-white/25"
          >
            Open
          </Link>
        ) : null}
      </div>
    </div>
  );
}
