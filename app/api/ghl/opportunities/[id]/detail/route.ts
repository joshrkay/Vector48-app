import { NextResponse } from "next/server";

import { requireAccountForUser } from "@/lib/auth/account";
import { normalizePipelineOpportunity, normalizeUsPhone, messagesToActivityItems, type PipelineActivityItem } from "@/lib/crm/pipeline";
import { getAccountGhlCredentials } from "@/lib/ghl";
import { getContact, getContactNotes } from "@/lib/ghl/contacts";
import { getConversations, getMessages } from "@/lib/ghl/conversations";
import { getOpportunity } from "@/lib/ghl/opportunities";
import { createServerClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type AutomationEvent = Database["public"]["Tables"]["automation_events"]["Row"];
type RecipeActivation = Database["public"]["Tables"]["recipe_activations"]["Row"];

function getRecipeSlugsForPhone(
  phone: string | null,
  activations: RecipeActivation[],
): string[] {
  const normalized = normalizeUsPhone(phone);
  if (!normalized) return [];

  return Array.from(
    new Set(
      activations.flatMap((activation) => {
        const config = activation.config as Record<string, unknown> | null;
        return normalizeUsPhone(String(config?.phone ?? "")) === normalized
          ? [activation.recipe_slug]
          : [];
      }),
    ),
  ).sort();
}

function automationEventsToActivityItems(
  events: AutomationEvent[],
): PipelineActivityItem[] {
  return events.map((event) => ({
    id: `automation:${event.id}`,
    timestamp: event.created_at,
    type: "automation_event",
    title: event.summary,
    body: event.recipe_slug ? `Recipe: ${event.recipe_slug}` : event.event_type,
  }));
}

export async function GET(
  _request: Request,
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
    const auth = { locationId, apiKey: accessToken };

    const opportunity = await getOpportunity(id, auth);

    const [contactResult, notesResult, conversationsResult, eventsResult, activationsResult] =
      await Promise.all([
        getContact(opportunity.contactId, auth),
        getContactNotes(opportunity.contactId, auth),
        getConversations(
          {
            contactId: opportunity.contactId,
            limit: 3,
            sortBy: "last_message_date",
            sort: "desc",
          },
          auth,
        ),
        supabase
          .from("automation_events")
          .select("*")
          .eq("account_id", session.accountId)
          .eq("contact_id", opportunity.contactId)
          .order("created_at", { ascending: false })
          .limit(10),
        supabase
          .from("recipe_activations")
          .select("*")
          .eq("account_id", session.accountId)
          .eq("status", "active"),
      ]);

    const conversations = conversationsResult.conversations ?? [];
    const messageResults = await Promise.allSettled(
      conversations.map((conversation) =>
        getMessages({ conversationId: conversation.id, limit: 5 }, auth),
      ),
    );

    const messages = messageResults.flatMap((result) =>
      result.status === "fulfilled" ? (result.value.messages ?? []) : [],
    );

    const contact = contactResult.contact;
    const recipeSlugs = getRecipeSlugsForPhone(
      contact.phone,
      (activationsResult.data ?? []) as RecipeActivation[],
    );

    const detail = {
      opportunity: normalizePipelineOpportunity(
        opportunity,
        { name: contact.name, phone: contact.phone },
        recipeSlugs,
      ),
      contact: {
        id: contact.id,
        name: contact.name?.trim() || "Contact",
        email: contact.email ?? null,
        phone: contact.phone ?? null,
      },
      notes: notesResult.notes ?? [],
      activity: [...messagesToActivityItems(messages), ...automationEventsToActivityItems(
        (eventsResult.data ?? []) as AutomationEvent[],
      )]
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 12),
    };

    return NextResponse.json(detail);
  } catch (error) {
    console.error("[ghl-opportunity-detail]", error);
    return NextResponse.json({ error: "Failed to load opportunity detail" }, { status: 502 });
  }
}
