import { NextResponse } from "next/server";
import { z } from "zod";

import { stripe } from "@/lib/stripe/client";
import { requireAccountForUserWithRole } from "@/lib/auth/account";
import { createServerClient } from "@/lib/supabase/server";

const bodySchema = z.object({
  planSlug: z.string().min(1),
});

export async function POST(req: Request) {
  const supabase = await createServerClient();
  const session = await requireAccountForUserWithRole(supabase, {
    request: req,
    requiredRole: "admin",
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session === "forbidden") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: account } = await supabase
    .from("accounts")
    .select("id, email, stripe_customer_id")
    .eq("id", session.accountId)
    .single();

  if (!account) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "planSlug is required" }, { status: 400 });
  }

  const { planSlug } = parsed.data;

  // Get the Stripe price ID for this plan
  const { data: pricing } = await supabase
    .from("pricing_config")
    .select("stripe_price_id, display_name")
    .eq("plan_slug", planSlug)
    .eq("is_active", true)
    .single();

  if (!pricing?.stripe_price_id) {
    return NextResponse.json(
      { error: "This plan is not available for purchase yet." },
      { status: 400 },
    );
  }

  let stripeCustomerId = account.stripe_customer_id;

  // Create Stripe customer if one doesn't exist yet
  if (!stripeCustomerId) {
    try {
      const customer = await stripe.customers.create({
        email: account.email ?? undefined,
        metadata: { accountId: account.id },
      });
      stripeCustomerId = customer.id;

      await supabase
        .from("accounts")
        .update({ stripe_customer_id: stripeCustomerId })
        .eq("id", account.id);
    } catch (err) {
      console.error("[billing/create-checkout] Failed to create customer:", err);
      return NextResponse.json(
        { error: "Unable to connect to payment processor. Please try again." },
        { status: 502 },
      );
    }
  }

  // Create Stripe Checkout session
  try {
    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: "subscription",
      line_items: [{ price: pricing.stripe_price_id, quantity: 1 }],
      success_url:
        process.env.NEXT_PUBLIC_APP_URL + "/billing?success=true",
      cancel_url: process.env.NEXT_PUBLIC_APP_URL + "/billing",
      metadata: { accountId: account.id, planSlug },
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[billing/create-checkout] Failed to create session:", err);
    return NextResponse.json(
      { error: "Unable to connect to payment processor. Please try again." },
      { status: 502 },
    );
  }
}
