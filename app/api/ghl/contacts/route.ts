import { NextRequest, NextResponse } from "next/server";
import { requireAccountForUser } from "@/lib/auth/account";
import { withAuthRetry } from "@/lib/ghl";
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

  const result = await withAuthRetry(session.accountId, async (client) => {
    return client.contacts.list({
      limit: 20,
      startAfterId: cursor,
      tag: TAG_MAP[filter],
      query: q,
    });
  });

  const contacts = result.data;
  const nextCursor =
    contacts.length === 20 ? contacts[contacts.length - 1].id : null;

  return NextResponse.json({ contacts, nextCursor });
}

export async function POST(req: NextRequest) {
  const supabase = await createServerClient();
  const session = await requireAccountForUser(supabase);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json() as {
    firstName?: string;
    lastName?: string;
    phone?: string;
    email?: string;
    tags?: string[];
    source?: string;
  };

  const contact = await withAuthRetry(session.accountId, async (client) => {
    return client.contacts.create({
      firstName: body.firstName,
      lastName: body.lastName,
      phone: body.phone,
      email: body.email,
      tags: body.tags ?? [],
      source: body.source,
    });
  });

  return NextResponse.json({ contact }, { status: 201 });
}
