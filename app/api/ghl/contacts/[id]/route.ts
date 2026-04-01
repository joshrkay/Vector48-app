import { type NextRequest, NextResponse } from "next/server";
import { requireAccountForUser } from "@/lib/auth/account";
import { getContact, updateContact } from "@/lib/ghl/contacts";
import { getAccountGhlCredentials } from "@/lib/ghl";
import { createServerClient } from "@/lib/supabase/server";
import type { GHLUpdateContactPayload } from "@/lib/ghl/types";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createServerClient();
  const session = await requireAccountForUser(supabase);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { locationId, accessToken } = await getAccountGhlCredentials(session.accountId);
    const result = await getContact(id, { locationId, apiKey: accessToken });
    return NextResponse.json(result);
  } catch (error) {
    console.error("[ghl-contact-get]", error);
    return NextResponse.json({ error: "Failed to fetch contact" }, { status: 502 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createServerClient();
  const session = await requireAccountForUser(supabase);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: GHLUpdateContactPayload;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const { locationId, accessToken } = await getAccountGhlCredentials(session.accountId);
    const result = await updateContact(id, body, { locationId, apiKey: accessToken });
    return NextResponse.json(result);
  } catch (error) {
    console.error("[ghl-contact-update]", error);
    return NextResponse.json({ error: "Failed to update contact" }, { status: 502 });
  }
}
