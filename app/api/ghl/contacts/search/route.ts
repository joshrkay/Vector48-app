import { NextRequest, NextResponse } from "next/server";
import { requireAccountForUser } from "@/lib/auth/account";
import { getContacts } from "@/lib/ghl/contacts";
import { getAccountGhlCredentials } from "@/lib/ghl";
import { createServerClient } from "@/lib/supabase/server";
import {
  toCachedContact,
  type CRMContactSearchItem,
} from "@/lib/crm/contactCache";
import type { CRMContactSearchResponse } from "@/lib/crm/types";

const MIN_QUERY_LENGTH = 2;
const SEARCH_FETCH_LIMIT = 25;
const MAX_RESULTS = 10;

function scoreContact(contact: CRMContactSearchItem, query: string): number {
  const q = query.toLowerCase();
  const normalizedPhoneQuery = q.replace(/\D/g, "");

  const name = contact.name.toLowerCase();
  const email = (contact.email ?? "").toLowerCase();
  const phoneDigits = (contact.phone ?? "").replace(/\D/g, "");

  if (name === q || email === q || (normalizedPhoneQuery && phoneDigits === normalizedPhoneQuery)) {
    return 0;
  }

  if (name.startsWith(q)) return 1;
  if (email.startsWith(q)) return 2;
  if (normalizedPhoneQuery && phoneDigits.startsWith(normalizedPhoneQuery)) return 3;

  if (name.includes(q)) return 4;
  if (email.includes(q)) return 5;
  if (normalizedPhoneQuery && phoneDigits.includes(normalizedPhoneQuery)) return 6;

  return 7;
}

function sortByRelevance(items: CRMContactSearchItem[], query: string): CRMContactSearchItem[] {
  return items
    .map((item, index) => ({ item, index, score: scoreContact(item, query) }))
    .sort((a, b) => {
      if (a.score !== b.score) return a.score - b.score;
      const nameCompare = a.item.name.localeCompare(b.item.name);
      if (nameCompare !== 0) return nameCompare;
      return a.index - b.index;
    })
    .map((entry) => entry.item);
}

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";

  if (!q) {
    return NextResponse.json<CRMContactSearchResponse>({ contacts: [], error: null });
  }

  if (q.length < MIN_QUERY_LENGTH) {
    return NextResponse.json<CRMContactSearchResponse>(
      {
        contacts: [],
        error: null,
      },
    );
  }

  const supabase = await createServerClient();
  const session = await requireAccountForUser(supabase);

  if (!session) {
    return NextResponse.json<CRMContactSearchResponse>(
      { contacts: [], error: { message: "Unauthorized" } },
      { status: 401 },
    );
  }

  try {
    const { locationId, accessToken } = await getAccountGhlCredentials(session.accountId);

    const response = await getContacts(
      {
        locationId,
        query: q,
        limit: SEARCH_FETCH_LIMIT,
      },
      {
        locationId,
        apiKey: accessToken,
      },
    );

    const normalized = (response.contacts ?? [])
      .map(toCachedContact)
      .filter((item): item is CRMContactSearchItem => item !== null);

    const sorted = sortByRelevance(normalized, q).slice(0, MAX_RESULTS);

    return NextResponse.json<CRMContactSearchResponse>({ contacts: sorted, error: null });
  } catch (error) {
    console.error("[ghl-contact-search] failed", error);

    return NextResponse.json<CRMContactSearchResponse>(
      {
        contacts: [],
        error: {
          message: "Unable to search contacts right now.",
        },
      },
      { status: 502 },
    );
  }
}
