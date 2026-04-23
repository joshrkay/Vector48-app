import { NextResponse } from "next/server";

import { requireAccountForUser } from "@/lib/auth/account";
import { ghlPost } from "@/lib/ghl/client";
import { tryGetAccountGhlCredentials } from "@/lib/ghl/token";
import { validateTestSmsRequest } from "@/lib/notifications/testSms";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerClient } from "@/lib/supabase/server";

const TEST_MESSAGE =
  "Test SMS from Vector 48. If you received this, notification alerts are wired up. (This is a manual test — no action needed.)";

export async function POST(request: Request) {
  const supabase = await createServerClient();
  const session = await requireAccountForUser(supabase, { request });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { phone?: string } = {};
  try {
    body = (await request.json()) as { phone?: string };
  } catch {
    // Empty body is valid — we'll fall back to the stored phone.
  }

  // Pull the two values we need to validate against in a single query.
  const admin = createAdminClient();
  const { data: account, error: accountError } = await admin
    .from("accounts")
    .select("notification_contact_phone, ghl_location_id")
    .eq("id", session.accountId)
    .single();
  if (accountError || !account) {
    return NextResponse.json(
      { error: "Account lookup failed" },
      { status: 500 },
    );
  }

  const validation = validateTestSmsRequest({
    requestedPhone: body.phone,
    storedPhone: account.notification_contact_phone,
    ghlLocationId: account.ghl_location_id,
  });

  if (!validation.ok) {
    return NextResponse.json(
      { error: validation.message, code: validation.code },
      { status: validation.status },
    );
  }

  const creds = await tryGetAccountGhlCredentials(session.accountId);
  if (!creds) {
    // Shouldn't happen — validateTestSmsRequest already checked ghl_location_id —
    // but defensive against stale/revoked tokens.
    return NextResponse.json(
      {
        error: "GoHighLevel credentials are missing or expired. Reconnect in Settings.",
        code: "ghl_not_connected",
      },
      { status: 503 },
    );
  }

  try {
    await ghlPost(
      "/conversations/messages",
      {
        type: "SMS",
        phone: `+${validation.phone}`.replace(/^\+1?/, "+1"),
        message: TEST_MESSAGE,
      },
      { locationId: creds.locationId, apiKey: creds.token },
    );
  } catch (err) {
    console.error("[test-sms] GHL send failed", err);
    return NextResponse.json(
      {
        error:
          "Failed to dispatch test SMS through GoHighLevel. Check integration health.",
        code: "ghl_send_failed",
      },
      { status: 502 },
    );
  }

  return NextResponse.json({ success: true, deliveredTo: validation.phone });
}
