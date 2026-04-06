import { redirect } from "next/navigation";
import type Stripe from "stripe";

import { requireAccountForUser } from "@/lib/auth/account";
import { createServerClient } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe/client";
import { getPricingConfig, type PricingConfig } from "@/lib/stripe/config";
import { BillingToasts } from "@/components/billing/BillingToasts";
import { CurrentPlanCard } from "@/components/billing/CurrentPlanCard";
import { DangerZone } from "@/components/billing/DangerZone";
import { PaymentMethodCard } from "@/components/billing/PaymentMethodCard";
import { PlanComparisonTable } from "@/components/billing/PlanComparisonTable";

export default async function BillingPage({
  searchParams,
}: {
  searchParams: { success?: string; reason?: string };
}) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");
  const session = await requireAccountForUser(supabase);
  if (!session) redirect("/login");

  const { data: account } = await supabase
    .from("accounts")
    .select(
      "id, plan_slug, trial_ends_at, stripe_customer_id, stripe_subscription_id, subscription_status",
    )
    .eq("id", session.accountId)
    .maybeSingle();

  if (!account) redirect("/login");

  const pricingConfig = await getPricingConfig();
  const currentPlan: PricingConfig | null =
    pricingConfig.find((p: PricingConfig) => p.plan_slug === account.plan_slug) ?? null;

  // Determine the next plan to upgrade to (next higher sort_order, excluding trial + custom).
  const upgradeablePlans = pricingConfig.filter(
    (p: PricingConfig) => p.plan_slug !== "trial" && p.plan_slug !== "custom",
  );
  const currentSortOrder = currentPlan?.sort_order ?? -1;
  const nextPlan =
    upgradeablePlans.find((p: PricingConfig) => p.sort_order > currentSortOrder) ?? null;
  const upgradePlanSlug = nextPlan?.plan_slug ?? null;

  // Stripe subscription — fails gracefully when key is stubbed
  let subscription: Stripe.Subscription | null = null;
  if (account.stripe_subscription_id) {
    try {
      subscription = await stripe.subscriptions.retrieve(
        account.stripe_subscription_id,
        { expand: ["default_payment_method"] },
      );
    } catch (err) {
      console.warn("[billing] Could not fetch Stripe subscription:", err);
    }
  }

  // Stripe invoices — fails gracefully when key is stubbed
  let invoices: Stripe.Invoice[] = [];
  if (account.stripe_customer_id) {
    try {
      const result = await stripe.invoices.list({
        customer: account.stripe_customer_id,
        limit: 10,
      });
      invoices = result.data;
    } catch (err) {
      console.warn("[billing] Could not fetch Stripe invoices:", err);
    }
  }

  // Narrow payment method from expanded subscription
  const paymentMethod =
    subscription?.default_payment_method !== null &&
    subscription?.default_payment_method !== undefined &&
    typeof subscription.default_payment_method === "object" &&
    !("deleted" in subscription.default_payment_method)
      ? (subscription.default_payment_method as Stripe.PaymentMethod)
      : null;

  const MS_PER_DAY = 86_400_000;
  const daysRemaining = account.trial_ends_at
    ? Math.max(
        0,
        Math.ceil(
          (new Date(account.trial_ends_at).getTime() - Date.now()) / MS_PER_DAY,
        ),
      )
    : 0;

  const { success, reason } = searchParams;

  return (
    <div className="space-y-6">
      <BillingToasts success={success} reason={reason} />

      <div>
        <h1 className="font-heading text-2xl font-bold">Billing</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Manage your plan, payment method, and billing history.
        </p>
      </div>

      <CurrentPlanCard
        planSlug={account.plan_slug}
        subscriptionStatus={account.subscription_status}
        currentPlan={currentPlan}
        trialEndsAt={account.trial_ends_at}
        daysRemaining={daysRemaining}
        renewsAt={subscription?.current_period_end ?? null}
        upgradePlanSlug={upgradePlanSlug}
      />

      <PaymentMethodCard
        stripeCustomerId={account.stripe_customer_id}
        paymentMethod={paymentMethod}
      />

      {/* Billing History */}
      <div className="rounded-2xl border bg-white p-6">
        <h2 className="font-heading text-[16px] font-bold">Billing History</h2>

        {invoices.length === 0 ? (
          <p className="mt-4 text-sm text-gray-400">No billing history yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-400">
                  <th className="pb-2 font-medium">Date</th>
                  <th className="pb-2 font-medium">Description</th>
                  <th className="pb-2 font-medium">Amount</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td className="py-3 text-gray-600">
                      {invoice.created
                        ? new Date(invoice.created * 1000).toLocaleDateString(
                            "en-US",
                            { month: "short", day: "numeric", year: "numeric" },
                          )
                        : "—"}
                    </td>
                    <td className="py-3 text-gray-600">
                      {invoice.description ?? "Subscription"}
                    </td>
                    <td className="py-3 text-gray-600">
                      {invoice.amount_paid !== undefined
                        ? `$${(invoice.amount_paid / 100).toFixed(2)}`
                        : "—"}
                    </td>
                    <td className="py-3">
                      <InvoiceStatusBadge status={invoice.status ?? "draft"} />
                    </td>
                    <td className="py-3 text-right">
                      {invoice.hosted_invoice_url && (
                        <a
                          href={invoice.hosted_invoice_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#00B4A6] hover:underline"
                        >
                          Receipt
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <PlanComparisonTable
        pricingConfig={pricingConfig}
        currentPlanSlug={account.plan_slug}
      />

      {account.stripe_subscription_id && <DangerZone />}
    </div>
  );
}

function InvoiceStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    paid: "bg-teal-100 text-teal-700",
    open: "bg-amber-100 text-amber-700",
    void: "bg-gray-100 text-gray-500",
    uncollectible: "bg-red-100 text-red-600",
    draft: "bg-gray-100 text-gray-400",
  };
  const labels: Record<string, string> = {
    paid: "Paid",
    open: "Pending",
    void: "Void",
    uncollectible: "Failed",
    draft: "Draft",
  };
  const cls = styles[status] ?? "bg-gray-100 text-gray-400";
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}
    >
      {labels[status] ?? status}
    </span>
  );
}
