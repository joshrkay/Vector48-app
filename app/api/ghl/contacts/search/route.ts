import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { ghlGet } from "@/lib/ghl/client";
import type { CRMContactSearchItem } from "@/lib/crm/contactCache";

function toDisplayName(contact: {
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
}) {
  return (
    contact.name?.trim() ||
    [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim() ||
    contact.email ||
    contact.phone ||
    "Unnamed contact"
  );
}

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";

  if (!q) {
    return NextResponse.json({ contacts: [] satisfies CRMContactSearchItem[] });
  }

  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: account, error } = await supabase
      .from("accounts")
      .select("ghl_location_id")
      .eq("owner_user_id", user.id)
      .single();

    if (error || !account?.ghl_location_id) {
      return NextResponse.json({ contacts: [] satisfies CRMContactSearchItem[] });
    }

    const response = await ghlGet<{ contacts?: Array<Record<string, string | null>> }>("/contacts/", {
      locationId: account.ghl_location_id,
      params: {
        query: q,
        limit: 10,
      },
    });

    const contacts: CRMContactSearchItem[] = (response.contacts ?? []).slice(0, 10).map((contact) => ({
      id: (contact.id as string) ?? "",
      name: toDisplayName(contact),
      email: (contact.email as string | null) ?? null,
      phone: (contact.phone as string | null) ?? null,
    })).filter((contact) => Boolean(contact.id));

    return NextResponse.json({ contacts });
  } catch {
    return NextResponse.json({ contacts: [] satisfies CRMContactSearchItem[] });
  }
}
