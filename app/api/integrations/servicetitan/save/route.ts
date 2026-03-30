import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { requireAccountForUser } from "@/lib/auth/account";
import { encryptCredentials } from "@/lib/integrations/credentialStore";
import { servicetitanSaveSchema } from "@/lib/validations/settings";

async function validateServiceTitanCredentials(
  apiKey: string,
  tenantId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const appKey = process.env.SERVICETITAN_APP_KEY;
  if (!appKey) {
    if (process.env.SERVICETITAN_SKIP_VALIDATION === "1") {
      return { ok: true };
    }
    return { ok: false, message: "SERVICETITAN_APP_KEY is not configured" };
  }

  const url = `https://api.servicetitan.io/v2/tenant/${encodeURIComponent(tenantId)}/business-units`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "ST-App-Key": appKey,
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return {
      ok: false,
      message: `ServiceTitan validation failed (${res.status}): ${text.slice(0, 200)}`,
    };
  }

  return { ok: true };
}

export async function POST(req: Request) {
  const supabase = await createServerClient();
  const session = await requireAccountForUser(supabase);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = servicetitanSaveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { api_key, tenant_id } = parsed.data;
  const check = await validateServiceTitanCredentials(api_key, tenant_id);
  if (!check.ok) {
    return NextResponse.json({ error: check.message }, { status: 400 });
  }

  const creds = encryptCredentials({
    api_key,
    tenant_id,
  });
  const now = new Date().toISOString();

  const { data: row } = await supabase
    .from("integrations")
    .select("id")
    .eq("account_id", session.accountId)
    .eq("provider", "servicetitan")
    .maybeSingle();

  if (row) {
    const { error } = await supabase
      .from("integrations")
      .update({
        status: "connected",
        credentials_encrypted: creds as unknown as Record<string, unknown>,
        connected_at: now,
      })
      .eq("id", row.id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  } else {
    const { error } = await supabase.from("integrations").insert({
      account_id: session.accountId,
      provider: "servicetitan",
      status: "connected",
      credentials_encrypted: creds as unknown as Record<string, unknown>,
      connected_at: now,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true });
}
