import { NextRequest, NextResponse } from "next/server";
import { requireAccountForUser } from "@/lib/auth/account";
import { getAccountGhlCredentials } from "@/lib/ghl";
import { createContact } from "@/lib/ghl/contacts";
import { cachedGHLClient } from "@/lib/ghl/cache";
import { createServerClient } from "@/lib/supabase/server";

const TAG_MAP: Record<string, string> = {
  new_lead: "New Lead",
  contacted: "Contacted",
  active_customer: "Active Customer",
  inactive: "Inactive",
};

export async function GET(req: NextRequest) {
  const supabase = await createServerClient();
  const session = await requireAccountForUser(supabase);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const filter = url.searchParams.get("filter") ?? "all";
  const q = url.searchParams.get("q") ?? undefined;

  try {
    const { contacts } = await cachedGHLClient(session.accountId).getContacts({
      limit: 20,
      startAfterId: cursor,
      tag: TAG_MAP[filter],
      query: q,
    });

    const nextCursor =
      contacts.length === 20 ? contacts[contacts.length - 1].id : null;

    return NextResponse.json({ contacts, nextCursor });
  } catch (error) {
    console.error("[ghl-contacts-list]", error);
    return NextResponse.json(
      { error: "Failed to load contacts", contacts: [], nextCursor: null },
      { status: 502 },
    );
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createServerClient();
  const session = await requireAccountForUser(supabase);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { locationId, accessToken } = await getAccountGhlCredentials(session.accountId);

  const body = await req.json() as {
    firstName?: string;
    lastName?: string;
    phone?: string;
    email?: string;
    tags?: string[];
    source?: string;
  };

  const { contact } = await createContact(
    {
      locationId,
      firstName: body.firstName,
      lastName: body.lastName,
      phone: body.phone,
      email: body.email,
      tags: body.tags ?? [],
      source: body.source,
    },
    { locationId, apiKey: accessToken },
  );

  return NextResponse.json({ contact }, { status: 201 });
}
