import { NextResponse } from "next/server";

import { requireAccountForUser } from "@/lib/auth/account";
import { normalizePipelineOpportunity, normalizeUsPhone, messagesToActivityItems, type PipelineActivityItem } from "@/lib/crm/pipeline";
import { withAuthRetry } from "@/lib/ghl";
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
    const { opportunity, contactResult, notesResult, conversations } =
      await withAuthRetry(session.accountId, async (client) => {
        const opp = await client.opportunities.get(id);

        const [contact, notes, convResult] = await Promise.all([
          client.contacts.get(opp.contactId),
          client.contacts.getNotes(opp.contactId),
          client.conversations.list({
            contactId: opp.contactId,
            limit: 3,
            sortBy: "last_message_date",
            sort: "desc",
          } as never),
        ]);

        return {
          opportunity: opp,
          contactResult: contact,
          notesResult: notes,
          conversations: convResult.data ?? [],
        };
      });

    const [messageResults, eventsResult, activationsResult] = await Promise.all([
      withAuthRetry(session.accountId, async (client) => {
        return Promise.allSettled(
          conversations.map((conversation) =>
            client.conversations.getMessages(conversation.id, { limit: 5 }),
          ),
        );
      }),
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

    const messages = messageResults.flatMap((result) =>
      result.status === "fulfilled" ? (result.value ?? []) : [],
    );

    const contact = contactResult;
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
      notes: notesResult ?? [],
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
