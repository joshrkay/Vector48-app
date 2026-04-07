import "server-only";

import { tryGetAccountGhlCredentials, withAuthRetry } from "@/lib/ghl";
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
  const credentials = await tryGetAccountGhlCredentials(accountId);
  if (!credentials) return { conversations: [], contacts: {} };

  return withAuthRetry(accountId, async (client) => {
    const convResult = await client.conversations.list({
      limit: 20,
      sortBy: "last_message_date",
      sort: "desc",
    });
    const raw = convResult.data ?? [];

    const uniqueIds = Array.from(new Set(raw.map((c: GHLConversation) => c.contactId)));
    const contacts: Record<string, InboxContactPreview> = {};

    await Promise.all(
      uniqueIds.map(async (id) => {
        try {
          const contact = await client.contacts.get(id);
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
  });
}
