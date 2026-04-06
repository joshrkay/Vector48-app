import { NextResponse } from "next/server";

import { requireAccountForUser } from "@/lib/auth/account";
import { stripe } from "@/lib/stripe/client";
import { createServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createServerClient();
  const session = await requireAccountForUser(supabase, { request });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: account } = await supabase
    .from("accounts")
    .select("id, stripe_subscription_id")
    .eq("id", session.accountId)
    .maybeSingle();

  if (!account) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!account.stripe_subscription_id) {
    return NextResponse.json(
      { error: "No active subscription to cancel." },
      { status: 400 },
    );
  }

  try {
    await stripe.subscriptions.update(account.stripe_subscription_id, {
      cancel_at_period_end: true,
    });
  } catch (err) {
    console.error("[billing/cancel] Failed to cancel subscription:", err);
    return NextResponse.json(
      { error: "Unable to connect to payment processor. Please try again." },
      { status: 502 },
    );
  }

  // Do NOT update subscription_status here. With cancel_at_period_end = true,
  // Stripe keeps the subscription "active" until the period ends. Updating to
  // "canceled" now would conflict with the customer.subscription.updated webhook,
  // which fires immediately and would write "active" back, overwriting our update.
  // The customer.subscription.deleted webhook handles the final state transition.

  return NextResponse.json({ success: true });
}
