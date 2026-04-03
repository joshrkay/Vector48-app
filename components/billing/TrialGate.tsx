"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LockKeyhole } from "lucide-react";

interface TrialGateProps {
  trialEndsAt: string | null;
  planSlug: string;
  stripeSubscriptionId: string | null;
  children: React.ReactNode;
}

const EXEMPT_PREFIXES = ["/billing", "/settings", "/api/", "/login", "/signup"];

export function TrialGate({
  trialEndsAt,
  planSlug,
  stripeSubscriptionId,
  children,
}: TrialGateProps) {
  const pathname = usePathname();
  const router = useRouter();
  // Defer the date comparison to client-side only to avoid SSR/hydration mismatch.
  // `new Date()` differs between server render and client hydration timestamps.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const isExempt = EXEMPT_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix),
  );

  const trialExpired =
    mounted &&
    !isExempt &&
    planSlug === "trial" &&
    !stripeSubscriptionId &&
    trialEndsAt !== null &&
    new Date(trialEndsAt) < new Date();

  return (
    <>
      {children}
      {trialExpired && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F1E35]/95">
          <div className="mx-4 w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-xl">
            <div className="mb-4 flex justify-center">
              <LockKeyhole size={48} className="text-[#00B4A6]" />
            </div>
            <h2 className="font-heading text-[22px] font-bold text-gray-900">
              Your trial has ended
            </h2>
            <p className="mt-2 text-sm text-gray-500">
              Add a payment method to keep your automations running.
            </p>
            <button
              onClick={() => router.push("/billing")}
              className="mt-6 w-full rounded-xl bg-[#00B4A6] px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#009e91]"
            >
              Choose a plan →
            </button>
          </div>
        </div>
      )}
    </>
  );
}
