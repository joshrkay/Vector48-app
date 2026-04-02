"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface ProvisioningBannerProps {
  initialStatus: string;
  accountId: string;
}

const POLL_INTERVAL_MS = 5_000;

export function ProvisioningBanner({ initialStatus, accountId }: ProvisioningBannerProps) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isActive = status === "pending" || status === "in_progress";

  useEffect(() => {
    if (!isActive) return;

    async function poll() {
      try {
        const res = await fetch(
          `/api/onboarding/provision/status?accountId=${encodeURIComponent(accountId)}`,
        );
        if (!res.ok) return;
        const data = (await res.json()) as { status: string };
        setStatus(data.status);
        if (data.status === "complete") {
          router.refresh();
        }
      } catch {
        // silently ignore transient network errors
      }
    }

    intervalRef.current = setInterval(() => void poll(), POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isActive, accountId, router]);

  if (!isActive) return null;

  return (
    <div className="mt-6 flex items-start gap-3 rounded-r-xl border-l-4 border-[#00B4A6] bg-[#F0FFFE] px-4 py-3">
      <svg
        className="mt-0.5 h-[18px] w-[18px] shrink-0 animate-spin text-[#00B4A6]"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
        />
      </svg>
      <div>
        <p className="text-sm font-medium text-[#0F1923]">Setting up your AI assistant…</p>
        <p className="mt-0.5 text-xs text-[#64748B]">
          This usually takes about 30 seconds. You can explore while we set things up.
        </p>
      </div>
    </div>
  );
}
