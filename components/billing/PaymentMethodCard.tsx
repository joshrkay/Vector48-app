"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CreditCard } from "lucide-react";
import type Stripe from "stripe";

interface PaymentMethodCardProps {
  stripeCustomerId: string | null;
  paymentMethod: Stripe.PaymentMethod | null;
}

export function PaymentMethodCard({
  stripeCustomerId,
  paymentMethod,
}: PaymentMethodCardProps) {
  const [loading, setLoading] = useState(false);

  async function openPortal() {
    setLoading(true);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const json = await res.json() as { url?: string; error?: string };
      if (!res.ok) {
        toast.error(json.error ?? "Unable to open billing portal.");
        return;
      }
      if (json.url) window.location.href = json.url;
    } catch {
      toast.error("Unable to connect to payment processor. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (!stripeCustomerId) return null;

  const card = paymentMethod?.card;

  return (
    <div className="rounded-2xl border bg-white p-6">
      <h2 className="font-heading text-[16px] font-bold">Payment Method</h2>

      <div className="mt-4 flex items-center justify-between gap-4">
        {card ? (
          <div className="flex items-center gap-3 text-sm text-gray-700">
            <CreditCard size={20} className="shrink-0 text-gray-400" />
            <div>
              <p className="font-medium capitalize">
                {card.brand} •••• {card.last4}
              </p>
              <p className="text-xs text-gray-400">
                Expires {card.exp_month}/{card.exp_year}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-500">No payment method on file.</p>
        )}

        <button
          onClick={openPortal}
          disabled={loading}
          className="shrink-0 text-sm font-medium text-[#00B4A6] hover:underline disabled:opacity-50"
        >
          {loading ? "Loading…" : card ? "Update payment method" : "Add payment method"}
        </button>
      </div>
    </div>
  );
}
