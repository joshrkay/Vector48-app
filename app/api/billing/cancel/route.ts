import { NextResponse } from "next/server";

import { stripe } from "@/lib/stripe/client";
import { createServerClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: account } = await supabase
    .from("accounts")
    .select("id, stripe_subscription_id")
    .eq("owner_user_id", user.id)
    .single();

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

  // Mark as cancelling in our DB — plan_slug stays until subscription.deleted webhook fires
  await supabase
    .from("accounts")
    .update({ subscription_status: "canceled" })
    .eq("id", account.id);

  return NextResponse.json({ success: true });
}
