import "server-only";

import { getAccountGhlCredentials } from "@/lib/ghl";
import { getContact } from "@/lib/ghl/contacts";
import { getConversations } from "@/lib/ghl/conversations";
import type { GHLConversation } from "@/lib/ghl/types";

export interface InboxContactPreview {
  name: string;
  phone: string;
}

export interface EnrichedInboxConversations {
  conversations: GHLConversation[];
  contacts: Record<string, InboxContactPreview>;
}

function contactDisplayName(contact: {
  name: string | null;
  firstName: string | null;
  lastName: string | null;
}): string {
  if (contact.name?.trim()) return contact.name.trim();
  const parts = [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim();
  return parts || "Unknown";
}

export async function loadEnrichedInboxConversations(accountId: string): Promise<EnrichedInboxConversations> {
  const { locationId, accessToken } = await getAccountGhlCredentials(accountId);
  const ghlOpts = { locationId, apiKey: accessToken };
  const { conversations: raw = [] } = await getConversations(
    {
      locationId,
      limit: 20,
      sortBy: "last_message_date",
      sort: "desc",
    },
    ghlOpts,
  );

  const uniqueIds = [...new Set(raw.map((c) => c.contactId))];
  const contacts: Record<string, InboxContactPreview> = {};

  await Promise.all(
    uniqueIds.map(async (id) => {
      try {
        const { contact } = await getContact(id, ghlOpts);
        contacts[id] = {
          name: contactDisplayName(contact),
          phone: contact.phone ?? "",
        };
      } catch {
        contacts[id] = { name: "Unknown", phone: "" };
      }
    }),
  );

  return { conversations: raw, contacts };
}
