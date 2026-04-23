import { NextResponse } from "next/server";
import type Stripe from "stripe";

import { stripe } from "@/lib/stripe/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { flush, track } from "@/lib/analytics/posthog";
import { recordWebhookFailure } from "@/lib/observability/webhookFailures";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  // Read raw body — required for Stripe signature verification
  const body = await request.text();
  const sig = request.headers.get("stripe-signature") ?? "";

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!,
    );
  } catch (err) {
    console.error("[webhooks/stripe] Invalid signature:", err);
    void recordWebhookFailure({
      provider: "stripe",
      reason: err instanceof Error ? err.message : "invalid_signature",
      rawBody: body,
    });
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Idempotency: insert event.id into the ledger. If it already exists, the
  // event has been processed — return early without re-applying mutations.
  const { error: ledgerError } = await supabase
    .from("stripe_processed_events")
    .insert({ event_id: event.id, event_type: event.type });

  if (ledgerError) {
    if (ledgerError.code === "23505") {
      return NextResponse.json({ received: true, duplicate: true });
    }
    console.error("[webhooks/stripe] Ledger insert failed:", ledgerError.message);
    // Non-fatal: still attempt to handle the event so we don't lose data.
  }

  try {
    await handleStripeEvent(event, supabase);
  } catch (err) {
    // Always return 200 on handler errors — Stripe retries otherwise
    console.error("[webhooks/stripe] Handler error for", event.type, ":", err);
  }

  // Serverless runtimes may freeze the lambda immediately after the response,
  // dropping queued PostHog events. Flush before returning.
  await flush();

  return NextResponse.json({ received: true });
}

type AdminClient = ReturnType<typeof createAdminClient>;

async function handleStripeEvent(event: Stripe.Event, supabase: AdminClient) {

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const accountId = session.metadata?.accountId;
      const planSlug = session.metadata?.planSlug;
      const subscriptionId =
        typeof session.subscription === "string"
          ? session.subscription
          : session.subscription?.id ?? null;

      if (!accountId || !planSlug) {
        console.warn("[webhooks/stripe] checkout.session.completed missing metadata");
        break;
      }

      await supabase
        .from("accounts")
        .update({
          plan_slug: planSlug,
          stripe_subscription_id: subscriptionId,
          subscription_status: "active",
          // Clear trial window now that the user has a paid subscription — otherwise
          // downstream daysRemaining math can go negative and trial banners flicker.
          trial_ends_at: null,
        })
        .eq("id", accountId);

      track(accountId, "subscription_activated", {
        plan_slug: planSlug,
      });

      break;
    }

    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId =
        typeof subscription.customer === "string"
          ? subscription.customer
          : subscription.customer.id;

      // Map Stripe status to our subscription_status enum
      const statusMap: Record<
        string,
        "trialing" | "active" | "past_due" | "canceled" | "paused"
      > = {
        trialing: "trialing",
        active: "active",
        past_due: "past_due",
        canceled: "canceled",
        paused: "paused",
        incomplete: "past_due",
        incomplete_expired: "canceled",
        unpaid: "past_due",
      };

      const subscriptionStatus =
        statusMap[subscription.status] ?? "active";

      await supabase
        .from("accounts")
        .update({ subscription_status: subscriptionStatus })
        .eq("stripe_customer_id", customerId);

      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId =
        typeof subscription.customer === "string"
          ? subscription.customer
          : subscription.customer.id;

      await supabase
        .from("accounts")
        .update({
          plan_slug: "trial",
          stripe_subscription_id: null,
          subscription_status: "canceled",
        })
        .eq("stripe_customer_id", customerId);

      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId =
        typeof invoice.customer === "string"
          ? invoice.customer
          : (invoice.customer as Stripe.Customer | null)?.id ?? null;

      if (!customerId) break;

      // Look up account for the customer
      const { data: account } = await supabase
        .from("accounts")
        .select("id")
        .eq("stripe_customer_id", customerId)
        .single();

      if (!account) break;

      // Update subscription status to past_due
      await supabase
        .from("accounts")
        .update({ subscription_status: "past_due" })
        .eq("id", account.id);

      // Create an alert in the activity feed
      await supabase.from("automation_events").insert({
        account_id: account.id,
        event_type: "alert",
        summary: "Payment failed — update your payment method to keep your automations running.",
        detail: { invoice_id: invoice.id, amount_due: invoice.amount_due },
      });

      break;
    }

    case "invoice.payment_succeeded": {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId =
        typeof invoice.customer === "string"
          ? invoice.customer
          : (invoice.customer as Stripe.Customer | null)?.id ?? null;

      if (!customerId) break;

      await supabase
        .from("accounts")
        .update({ subscription_status: "active" })
        .eq("stripe_customer_id", customerId);

      break;
    }

    default:
      // Unhandled event type — ignore
      break;
  }
}
