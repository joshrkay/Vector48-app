"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type ProvisioningState = "pending" | "in_progress" | "complete" | "failed";

interface ProvisioningBannerProps {
  initialStatus: ProvisioningState;
  initialError: string | null;
}

const SUPPORT_MAIL =
  process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "support@vector48.com";

export function ProvisioningBanner({
  initialStatus,
  initialError,
}: ProvisioningBannerProps) {
  const router = useRouter();
  const [status, setStatus] = useState<ProvisioningState>(initialStatus);
  const [error, setError] = useState<string | null>(initialError);
  const [retrying, setRetrying] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setStatus(initialStatus);
    setError(initialError);
  }, [initialStatus, initialError]);

  useEffect(() => {
    if (status !== "pending" && status !== "in_progress") {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    const poll = async () => {
      try {
        const res = await fetch("/api/provisioning/status");
        if (!res.ok) return;
        const data = (await res.json()) as {
          status: ProvisioningState;
          error?: string;
        };
        setStatus(data.status);
        if (data.error) setError(data.error);
        if (data.status === "complete") {
          if (intervalRef.current) clearInterval(intervalRef.current);
          router.refresh();
        }
      } catch {
        /* ignore */
      }
    };

    intervalRef.current = setInterval(poll, 5000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [status, router]);

  if (status === "complete") {
    return null;
  }

  if (status === "failed") {
    return (
      <div
        className="mb-6 rounded-xl border border-red-800/60 bg-red-950/40 px-4 py-4 text-red-100"
        role="alert"
      >
        <p className="font-heading text-base font-semibold text-white">
          Setup hit a snag
        </p>
        {error ? (
          <p className="mt-2 text-sm text-red-200/90">{error}</p>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-3">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={retrying}
            onClick={async () => {
              setRetrying(true);
              try {
                const res = await fetch("/api/provisioning/retry", {
                  method: "POST",
                });
                if (res.ok) {
                  setStatus("in_progress");
                  setError(null);
                  router.refresh();
                }
              } finally {
                setRetrying(false);
              }
            }}
          >
            {retrying ? "Retrying…" : "Retry Setup"}
          </Button>
          <a
            href={`mailto:${SUPPORT_MAIL}`}
            className="inline-flex items-center text-sm font-medium text-teal-400 underline-offset-4 hover:underline"
          >
            Contact Support
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-6 rounded-xl border border-blue-800/50 bg-blue-950/35 px-4 py-4 text-blue-100">
      <div className="flex items-start gap-3">
        <Loader2
          className="h-6 w-6 shrink-0 animate-spin text-[var(--v48-accent)]"
          aria-hidden
        />
        <div>
          <p className="font-heading text-base font-semibold text-white">
            Setting up your AI assistant…
          </p>
          <p className="mt-1 text-sm text-blue-200/90">
            This usually takes about 30 seconds. You can explore while we set
            things up.
          </p>
        </div>
      </div>
    </div>
  );
}
