"use client";

import { useState } from "react";
import { toast } from "sonner";

export function DangerZone() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleCancel() {
    setLoading(true);
    try {
      const res = await fetch("/api/billing/cancel", { method: "POST" });
      const json = await res.json() as { success?: boolean; error?: string };
      if (!res.ok) {
        toast.error(json.error ?? "Unable to cancel subscription.");
        return;
      }
      toast.success("Subscription will cancel at the end of your billing period.");
      setOpen(false);
    } catch {
      toast.error("Unable to connect to payment processor. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-red-100 bg-white p-6">
      <h2 className="font-heading text-[16px] font-bold text-gray-900">
        Danger Zone
      </h2>

      <div className="mt-3">
        <button
          onClick={() => setOpen(true)}
          className="text-[13px] text-red-500 hover:text-red-700 hover:underline"
        >
          Cancel subscription
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="mx-4 w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="font-heading text-[18px] font-bold text-gray-900">
              Cancel subscription?
            </h3>
            <p className="mt-2 text-sm text-gray-500">
              Your plan will cancel at the end of your billing period. Your data
              is retained for 30 days after cancellation.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setOpen(false)}
                disabled={loading}
                className="flex-1 rounded-xl border px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Keep subscription
              </button>
              <button
                onClick={handleCancel}
                disabled={loading}
                className="flex-1 rounded-xl bg-red-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-600 disabled:opacity-50"
              >
                {loading ? "Cancelling…" : "Yes, cancel"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
