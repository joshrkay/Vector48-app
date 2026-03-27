// Vector 48 — GHL Webhook Receiver (Supabase Edge Function)
// Receives inbound webhooks from GoHighLevel and logs them as automation_events.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: corsHeaders,
    });
  }

  try {
    const body = await req.json();

    // TODO: Verify GHL webhook signature once GHL documents their signing scheme.
    // const signature = req.headers.get("x-ghl-signature");
    // if (!verifySignature(signature, body)) {
    //   return new Response("Unauthorized", { status: 401, headers: corsHeaders });
    // }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Resolve the tenant account from the GHL location ID in the payload.
    const locationId = body.locationId ?? body.location_id;
    if (!locationId) {
      return new Response(
        JSON.stringify({ error: "Missing locationId in payload" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: account, error: accountError } = await supabase
      .from("accounts")
      .select("id")
      .eq("ghl_sub_account_id", locationId)
      .single();

    if (accountError || !account) {
      console.error("Account lookup failed:", accountError?.message ?? "not found");
      return new Response(
        JSON.stringify({ error: "Account not found for locationId" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Route by event type — extend cases as recipes are added.
    const eventType: string = body.type ?? body.event ?? "unknown";

    // TODO: Add real event handling per recipe type. For now, log everything.
    const { error: insertError } = await supabase
      .from("automation_events")
      .insert({
        account_id: account.id,
        recipe_slug: "ghl-webhook",
        event_type: eventType,
        summary: `GHL webhook received: ${eventType}`,
        detail: body,
      });

    if (insertError) {
      console.error("Failed to insert automation_event:", insertError.message);
      return new Response(
        JSON.stringify({ error: "Failed to log event" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Notify the Next.js app to bust its in-memory cache for this account.
    const nextAppUrl = Deno.env.get("NEXT_APP_URL");
    const cacheSecret = Deno.env.get("GHL_CACHE_INVALIDATE_SECRET");

    if (nextAppUrl && cacheSecret) {
      try {
        await fetch(`${nextAppUrl}/api/ghl/cache-invalidate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            accountId: account.id,
            eventType,
            secret: cacheSecret,
          }),
        });
      } catch (cacheErr) {
        // Non-fatal: cache will expire on its own via TTL
        console.error("Cache invalidation call failed:", cacheErr);
      }
    }

    return new Response(
      JSON.stringify({ received: true, account_id: account.id, event_type: eventType }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("Webhook handler error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
