"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Check } from "lucide-react";
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
  const accountId = useOnboarding((s) => s.accountId);
  const businessName = useOnboarding((s) => s.businessName);
  const vertical = useOnboarding((s) => s.vertical);
  const activateRecipe1 = useOnboarding((s) => s.activateRecipe1);
  const [status, setStatus] = useState<
    "booting" | "pending" | "in_progress" | "complete" | "failed"
  >("booting");
  const [error, setError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    async function fetchStatus() {
      const response = await fetch(
        `/api/onboarding/provision/status?accountId=${encodeURIComponent(accountId)}`,
        { cache: "no-store" },
      );

      if (!response.ok) {
        throw new Error(`Status request failed: ${response.status}`);
      }

      return (await response.json()) as {
        status: "pending" | "in_progress" | "complete" | "failed";
        error?: string;
      };
    }

    async function startProvisioning() {
      try {
        const response = await fetch("/api/onboarding/provision", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accountId }),
        });

        if (!response.ok && response.status !== 409) {
          throw new Error(`Provision request failed: ${response.status}`);
        }

        const next = await fetchStatus();
        if (cancelled) return;

        setStatus(next.status);
        setError(next.error ?? null);

        if (next.status === "complete") {
          router.replace("/dashboard");
          return;
        }

        intervalId = setInterval(() => {
          void fetchStatus()
            .then((payload) => {
              if (cancelled) return;
              setStatus(payload.status);
              setError(payload.error ?? null);
              if (payload.status === "complete") {
                router.replace("/dashboard");
              }
            })
            .catch((requestError) => {
              if (cancelled) return;
              console.error("[onboarding] status polling failed", requestError);
              setStatus("failed");
              setError("Unable to check provisioning status.");
            });
        }, 2000);
      } catch (requestError) {
        if (cancelled) return;
        console.error("[onboarding] failed to start provisioning", requestError);
        setStatus("failed");
        setError("Unable to start provisioning.");
      }
    }

    void startProvisioning();

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [accountId, router]);

  const statusCopy = useMemo(() => {
    if (status === "failed") {
      return error ?? "Provisioning failed. You can retry now.";
    }
    if (status === "complete") {
      return "Account setup is complete. Redirecting you now.";
    }
    if (activateRecipe1) {
      return "Setting up your account, webhook subscriptions, and AI Phone Answering.";
    }
    return "Setting up your account and webhook subscriptions.";
  }, [activateRecipe1, error, status]);

  async function retryProvisioning() {
    try {
      setIsRetrying(true);
      setError(null);
      const response = await fetch("/api/onboarding/provision/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId }),
      });

      if (!response.ok) {
        throw new Error(`Retry failed: ${response.status}`);
      }

      window.location.reload();
    } catch (requestError) {
      console.error("[onboarding] retry failed", requestError);
      setStatus("failed");
      setError("Retry failed. Open the dashboard and try again from the alert banner.");
    } finally {
      setIsRetrying(false);
    }
  }

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
          {status === "failed" ? "Setup paused." : "Setting up your account..."}
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
          <p className={status === "failed" ? "text-[#B45309]" : "text-accent"}>
            {statusCopy}
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
        >
          {status === "failed" ? (
            <div className="mt-8 space-y-3">
              <button
                type="button"
                onClick={() => void retryProvisioning()}
                disabled={isRetrying}
                className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-accent text-sm font-semibold text-white transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isRetrying ? "Retrying..." : "Retry setup"}
              </button>
              <button
                type="button"
                onClick={() => router.push("/dashboard")}
                className="inline-flex h-12 w-full items-center justify-center rounded-xl border border-border text-sm font-semibold text-text-primary transition-colors hover:bg-white"
              >
                Open dashboard
              </button>
            </div>
          ) : (
            <div className="mt-8 inline-flex h-12 w-full items-center justify-center rounded-xl bg-[#E2E8F0] text-sm font-semibold text-[#475569]">
              {status === "complete" ? "Redirecting..." : "Working..."}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
