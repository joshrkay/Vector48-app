"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Check,
  Loader2,
  MessageSquare,
  Mic,
} from "lucide-react";
import { VoiceConfirmModal } from "@/components/shared/VoiceConfirmModal";
import { VoiceToast, type VoiceToastState } from "@/components/shared/VoiceToast";
import {
  executeVoiceAction,
  type VoiceToastPayload,
} from "@/lib/voice/actionExecutor";
import {
  startListening,
  VoiceRecognitionError,
} from "@/lib/voice/speechRecognition";
import {
  parseVoiceActionPayload,
  type VoiceMutationAction,
} from "@/lib/voice/types";

type VoiceButtonStatus = "idle" | "listening" | "processing" | "result";
type ResultTone = "success" | "answer";

interface VoiceButtonProps {
  accountId: string | null;
  vertical: "hvac" | "plumbing" | "electrical" | "roofing" | "landscaping" | null;
  activeRecipes: string[];
}

const RESULT_DISPLAY_MS = 900;

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  if (target.isContentEditable) return true;
  if (target.getAttribute("role") === "textbox") return true;
  return false;
}

function mapRecognitionError(error: VoiceRecognitionError): string {
  switch (error.code) {
    case "permission_denied":
      return "Microphone permission is required for voice navigation.";
    case "unavailable":
      return "Voice recognition is not available in this browser.";
    case "no_speech":
      return "I didn't catch that. Please try again.";
    case "network":
      return "Speech recognition had a network issue. Please try again.";
    case "transcription_failed":
      return "I couldn't transcribe that voice clip.";
    case "aborted":
      return "Voice capture cancelled.";
    default:
      return "Voice navigation failed. Please try again.";
  }
}

export function VoiceButton({
  accountId,
  vertical,
  activeRecipes,
}: VoiceButtonProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [status, setStatus] = React.useState<VoiceButtonStatus>("idle");
  const [resultTone, setResultTone] = React.useState<ResultTone>("success");
  const [transcriptPreview, setTranscriptPreview] = React.useState("");
  const [toast, setToast] = React.useState<VoiceToastState | null>(null);
  const [pendingAction, setPendingAction] = React.useState<VoiceMutationAction | null>(null);

  const statusRef = React.useRef<VoiceButtonStatus>("idle");
  const listenAbortRef = React.useRef<AbortController | null>(null);
  const queryAbortRef = React.useRef<AbortController | null>(null);
  const resultTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const confirmResolverRef = React.useRef<((value: boolean) => void) | null>(null);

  React.useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const currentRoute = React.useMemo(() => {
    const query = searchParams.toString();
    return query ? `${pathname}?${query}` : pathname;
  }, [pathname, searchParams]);

  const showToast = React.useCallback((payload: VoiceToastPayload) => {
    setToast({
      id: Date.now(),
      message: payload.message,
      openRoute: payload.openRoute,
    });
  }, []);

  const clearResultTimer = React.useCallback(() => {
    if (resultTimerRef.current) {
      clearTimeout(resultTimerRef.current);
      resultTimerRef.current = null;
    }
  }, []);

  const cancelVoiceSession = React.useCallback(() => {
    listenAbortRef.current?.abort();
    queryAbortRef.current?.abort();
    setTranscriptPreview("");
    clearResultTimer();
    setStatus("idle");
  }, [clearResultTimer]);

  const requestConfirmation = React.useCallback((action: VoiceMutationAction) => {
    return new Promise<boolean>((resolve) => {
      confirmResolverRef.current = resolve;
      setPendingAction(action);
    });
  }, []);

  const closeConfirmation = React.useCallback((confirmed: boolean) => {
    setPendingAction(null);
    const resolver = confirmResolverRef.current;
    confirmResolverRef.current = null;
    resolver?.(confirmed);
  }, []);

  const beginListening = React.useCallback(async () => {
    if (statusRef.current !== "idle") return;
    if (!accountId) {
      showToast({ message: "Voice navigation is unavailable for this account." });
      return;
    }

    setTranscriptPreview("");
    setStatus("listening");

    const listenAbort = new AbortController();
    listenAbortRef.current = listenAbort;

    try {
      const transcript = await startListening({
        signal: listenAbort.signal,
        onInterimResult: (value) => {
          setTranscriptPreview(value);
        },
      });

      if (!transcript.trim()) {
        setStatus("idle");
        showToast({ message: "I didn't catch that. Please try again." });
        return;
      }

      setTranscriptPreview(transcript.trim());
      setStatus("processing");

      const queryAbort = new AbortController();
      queryAbortRef.current = queryAbort;

      const response = await fetch("/api/voice/query", {
        method: "POST",
        signal: queryAbort.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript,
          context: {
            vertical,
            activeRecipes,
            currentRoute,
            accountId,
          },
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message =
          typeof payload?.error === "string"
            ? payload.error
            : "Voice request failed.";
        throw new Error(message);
      }

      const action = parseVoiceActionPayload(payload);
      await executeVoiceAction(action, {
        router,
        showToast,
        requestConfirmation,
      });

      setResultTone(
        action.type === "answer" || action.type === "clarify"
          ? "answer"
          : "success",
      );
      setStatus("result");
      clearResultTimer();
      resultTimerRef.current = setTimeout(() => {
        setStatus("idle");
      }, RESULT_DISPLAY_MS);
    } catch (error) {
      if (error instanceof VoiceRecognitionError) {
        if (error.code !== "aborted") {
          showToast({ message: mapRecognitionError(error) });
        }
      } else if (
        error instanceof Error &&
        (error.name === "AbortError" || error.message === "Voice capture cancelled.")
      ) {
        // no-op
      } else {
        showToast({
          message:
            error instanceof Error
              ? error.message
              : "Voice navigation failed. Please try again.",
        });
      }
      setStatus("idle");
    } finally {
      listenAbortRef.current = null;
      queryAbortRef.current = null;
      if (statusRef.current === "idle") {
        setTranscriptPreview("");
      }
    }
  }, [
    accountId,
    activeRecipes,
    clearResultTimer,
    currentRoute,
    requestConfirmation,
    router,
    showToast,
    vertical,
  ]);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (statusRef.current === "listening" || statusRef.current === "processing") {
          event.preventDefault();
          cancelVoiceSession();
        }
        return;
      }

      if (event.key !== " ") return;
      if (event.repeat) return;
      if (isEditableTarget(event.target)) return;
      if (pendingAction) return;
      if (statusRef.current !== "idle") return;

      event.preventDefault();
      void beginListening();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [beginListening, cancelVoiceSession, pendingAction]);

  React.useEffect(() => {
    return () => {
      clearResultTimer();
      listenAbortRef.current?.abort();
      queryAbortRef.current?.abort();
      if (confirmResolverRef.current) {
        confirmResolverRef.current(false);
      }
    };
  }, [clearResultTimer]);

  return (
    <>
      <div className="fixed bottom-24 right-4 z-50 md:bottom-6 md:right-6">
        {(status === "listening" || status === "processing") && transcriptPreview ? (
          <div className="mb-3 w-[min(80vw,22rem)] rounded-lg border border-[var(--v48-border)] bg-white px-3 py-2 text-xs text-[var(--text-secondary)] shadow-md">
            {transcriptPreview}
          </div>
        ) : null}
        <button
          type="button"
          aria-label="Start voice navigation"
          aria-pressed={status === "listening"}
          className="relative flex h-14 w-14 items-center justify-center rounded-full bg-[var(--v48-accent)] text-white shadow-lg transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--v48-accent)] focus-visible:ring-offset-2"
          onClick={() => {
            if (status === "listening" || status === "processing") {
              cancelVoiceSession();
              return;
            }
            void beginListening();
          }}
        >
          {status === "listening" ? (
            <>
              <span className="absolute inset-0 animate-ping rounded-full bg-[var(--v48-accent)]/45" />
              <Mic className="relative h-6 w-6" />
            </>
          ) : null}
          {status === "processing" ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : null}
          {status === "result" ? (
            resultTone === "success" ? (
              <Check className="h-6 w-6" />
            ) : (
              <MessageSquare className="h-6 w-6" />
            )
          ) : null}
          {status === "idle" ? <Mic className="h-6 w-6" /> : null}
        </button>
      </div>

      <VoiceToast toast={toast} onDismiss={() => setToast(null)} />

      <VoiceConfirmModal
        action={pendingAction}
        open={Boolean(pendingAction)}
        onCancel={() => closeConfirmation(false)}
        onConfirm={() => closeConfirmation(true)}
      />
    </>
  );
}
