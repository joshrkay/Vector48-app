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
    .select("id, stripe_customer_id")
    .eq("owner_user_id", user.id)
    .single();

  if (!account) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!account.stripe_customer_id) {
    return NextResponse.json(
      { error: "No billing account on file." },
      { status: 400 },
    );
  }

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: account.stripe_customer_id,
      return_url: process.env.NEXT_PUBLIC_APP_URL + "/billing",
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[billing/portal] Failed to create portal session:", err);
    return NextResponse.json(
      { error: "Unable to connect to payment processor. Please try again." },
      { status: 502 },
    );
  }
}
