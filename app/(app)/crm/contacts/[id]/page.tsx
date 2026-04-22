import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireAccountForUser } from "@/lib/auth/account";
import { createServerClient } from "@/lib/supabase/server";
import { getAccountGhlCredentials } from "@/lib/ghl";
import { cachedGHLClient, type CachedGHLClient } from "@/lib/ghl/cache";
import { RECIPE_CATALOG } from "@/lib/recipes/catalog";
import { mergeRecipesWithActivations } from "@/lib/recipes/merge";
import { ContactHeader } from "@/components/crm/contacts/ContactHeader";
import { QuickActionsBar } from "@/components/crm/contacts/QuickActionsBar";
import { ContactTimeline } from "@/components/crm/contacts/ContactTimeline";
import { ContactConversation } from "@/components/crm/contacts/ContactConversation";
import { ContactRecipeStatus } from "@/components/crm/contacts/ContactRecipeStatus";
import { ContactNotes } from "@/components/crm/contacts/ContactNotes";
import { CRMContactCacheHydrator } from "@/components/crm/CRMContactCacheHydrator";
import { activationConfigPhoneMatchesContact } from "@/components/crm/contacts/contactUtils";
import type { Database } from "@/lib/supabase/types";
import type { GHLConversation, GHLMessage, GHLClientOptions, GHLContactResponse } from "@/lib/ghl/types";
import type { AccountProfileSlice } from "@/lib/recipes/activationValidator";

type AutomationEvent = Database["public"]["Tables"]["automation_events"]["Row"];
type RecipeActivationRow = Database["public"]["Tables"]["recipe_activations"]["Row"];

// Bundle both DB queries (run concurrently inside)
async function fetchDbData(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  accountId: string,
  contactId: string,
  contactPhone: string | null,
) {
  const [eventsResult, activationsResult] = await Promise.allSettled([
    supabase
      .from("automation_events")
      .select(
        "id, account_id, recipe_slug, event_type, ghl_event_type, ghl_event_id, contact_id, contact_phone, contact_name, summary, detail, created_at",
      )
      .eq("account_id", accountId)
      .eq("contact_id", contactId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("recipe_activations")
      .select("*")
      .eq("account_id", accountId),
  ]);

  const automationEvents =
    eventsResult.status === "fulfilled" && !eventsResult.value.error
      ? ((eventsResult.value.data ?? []) as AutomationEvent[])
      : null;

  const allActivations =
    activationsResult.status === "fulfilled" && !activationsResult.value.error
      ? (activationsResult.value.data ?? [])
      : [];

  const matchedActivations: RecipeActivationRow[] = allActivations.filter(
    (ra: RecipeActivationRow) =>
      activationConfigPhoneMatchesContact(
        contactPhone,
        ra.config as Record<string, unknown> | null,
      ),
  );

  return { automationEvents, allActivations, matchedActivations };
}

// Fetch all conversations for the contact and their messages
async function fetchConversationsWithMessages(
  client: CachedGHLClient,
  contactId: string,
  ghlOpts: GHLClientOptions,
): Promise<{ conversations: GHLConversation[]; messages: GHLMessage[] }> {
  const convResponse = await client.getConversations({ contactId }, ghlOpts);
  const conversations = convResponse.conversations ?? [];

  if (conversations.length === 0) {
    return { conversations: [], messages: [] };
  }

  // Fetch messages for each conversation in parallel
  const messageResults = await Promise.allSettled(
    conversations.map((conv) =>
      client.getMessages({ conversationId: conv.id, limit: 50 }, ghlOpts),
    ),
  );

  const messages: GHLMessage[] = messageResults.flatMap((r) =>
    r.status === "fulfilled" ? (r.value.messages ?? []) : [],
  );

  return { conversations, messages };
}

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const session = await requireAccountForUser(supabase);
  if (!session) redirect("/login");

  const { data: account } = await supabase
    .from("accounts")
    .select(
      "id, business_name, vertical, plan_slug, phone, voice_gender, greeting_text, business_hours, ghl_provisioning_status, ghl_provisioning_error",
    )
    .eq("id", session.accountId)
    .maybeSingle();
  if (!account) redirect("/login");

  let ghlOpts: GHLClientOptions | null = null;
  let ghlUnavailableReason: string | null = null;
  try {
    const { locationId, accessToken } = await getAccountGhlCredentials(account.id);
    ghlOpts = { locationId, apiKey: accessToken };
  } catch (error) {
    const reasonFromProvisioning =
      account.ghl_provisioning_status === "failed"
        ? (account.ghl_provisioning_error ?? "GHL provisioning failed.")
        : null;
    ghlUnavailableReason =
      reasonFromProvisioning ??
      (error instanceof Error ? error.message : "Unable to load GHL credentials.");
  }

  if (!ghlOpts) {
    return (
      <div className="space-y-4">
        <Link
          href="/crm/contacts"
          className="inline-flex items-center gap-1 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        >
          ← Back to Contacts
        </Link>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          GoHighLevel is currently unavailable for this account.
          {ghlUnavailableReason ? ` ${ghlUnavailableReason}` : ""}
        </div>
      </div>
    );
  }

  // Fire all fetches in parallel. One failure must not break the page.
  const ghl = cachedGHLClient(account.id);
  const [contactResult, dbResult, convResult, apptResult, notesResult, oppsResult, pipelinesResult, integrationsResult] =
    await Promise.allSettled([
      ghl.getContact(id, ghlOpts),                                                   // 0 — CRITICAL
      fetchDbData(supabase, account.id, id, null /* phone filled after contact */),  // 1 — DB (phone patched below)
      fetchConversationsWithMessages(ghl, id, ghlOpts),                              // 2 — GHL conversations
      ghl.getAppointments({ contactId: id }, ghlOpts),                               // 3 — GHL appointments
      ghl.getContactNotes(id, ghlOpts),                                              // 4 — GHL notes
      ghl.getOpportunities({ contactId: id }, ghlOpts),                              // 5 — GHL opportunities
      ghl.getPipelines(ghlOpts),                                                     // 6 — GHL pipelines
      supabase                                                                        // 7 — integrations
        .from("integrations")
        .select("provider, status")
        .eq("account_id", account.id),
    ]);

  // Contact is load-bearing — 404 on failure
  if (contactResult.status !== "fulfilled") {
    notFound();
  }
  const { contact } = (contactResult as PromiseFulfilledResult<GHLContactResponse>).value;

  // Re-run phone-based recipe matching now that we have the contact phone
  let dbData = dbResult.status === "fulfilled" ? dbResult.value : null;
  if (dbData) {
    dbData = {
      ...dbData,
      matchedActivations: dbData.allActivations.filter((ra: RecipeActivationRow) =>
        activationConfigPhoneMatchesContact(
          contact.phone,
          ra.config as Record<string, unknown> | null,
        ),
      ),
    };
  }

  const automationEvents = dbData?.automationEvents ?? null;
  const matchedActivations = dbData?.matchedActivations ?? null;
  const allActivations = dbData?.allActivations ?? [];

  const conversations =
    convResult.status === "fulfilled" ? convResult.value.conversations : [];
  const allMessages =
    convResult.status === "fulfilled" ? convResult.value.messages : [];
  const ghlMessagesForTimeline =
    convResult.status === "fulfilled" ? convResult.value.messages : null;
  const ghlNotesForTimeline =
    notesResult.status === "fulfilled" ? (notesResult.value.notes ?? []) : null;

  const appointments =
    apptResult.status === "fulfilled" ? (apptResult.value.events ?? []) : null;

  const notes =
    notesResult.status === "fulfilled" ? (notesResult.value.notes ?? []) : null;

  const opportunities =
    oppsResult.status === "fulfilled" ? (oppsResult.value.opportunities ?? []) : [];

  const pipelines =
    pipelinesResult.status === "fulfilled" ? (pipelinesResult.value.pipelines ?? []) : [];

  const connectedProviders =
    integrationsResult.status === "fulfilled" && !integrationsResult.value.error
      ? ((integrationsResult.value.data ?? []) as { status: string; provider: string }[])
          .filter((r) => r.status === "connected")
          .map((r) => r.provider)
      : [];

  const profile: AccountProfileSlice = {
    phone: account.phone,
    voice_gender: account.voice_gender,
    greeting_text: account.greeting_text,
    business_hours: account.business_hours,
  };

  const allRecipes = mergeRecipesWithActivations(
    RECIPE_CATALOG,
    allActivations,
    account.vertical ?? undefined,
  );
  const availableRecipes = allRecipes.filter((r) => r.status === "available");

  const primaryConversationId = conversations[0]?.id ?? null;

  return (
    <div className="space-y-4">
      <CRMContactCacheHydrator contacts={[contact]} />

      {/* Back link */}
      <Link
        href="/crm/contacts"
        className="inline-flex items-center gap-1 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
      >
        ← Back to Contacts
      </Link>

      {/* 1. Header */}
      <ContactHeader contact={contact} />

      {/* 2. Quick Actions */}
      <QuickActionsBar
        contactId={id}
        contact={contact}
        primaryConversationId={primaryConversationId}
        opportunities={opportunities}
        pipelines={pipelines}
        availableRecipes={availableRecipes}
        profile={profile}
        connectedProviders={connectedProviders}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {/* 3. Activity Timeline */}
          <ContactTimeline
            automationEvents={automationEvents}
            ghlMessages={ghlMessagesForTimeline}
            ghlNotes={ghlNotesForTimeline}
          />

          {/* 4. Conversations */}
          {convResult.status === "rejected" ? (
            <div className="rounded-2xl border border-[var(--v48-border)] bg-white p-5">
              <h2 className="mb-2 text-sm font-semibold">Conversations</h2>
              <p className="text-sm text-[var(--text-secondary)]">Could not load conversations.</p>
            </div>
          ) : (
            <ContactConversation
              conversations={conversations}
              initialMessages={allMessages}
              contactId={id}
            />
          )}
        </div>

        <div className="space-y-4">
          {/* 5. Appointments */}
          <div className="rounded-2xl border border-[var(--v48-border)] bg-white">
            <div className="border-b border-[var(--v48-border)] px-5 py-3">
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">Appointments</h2>
            </div>
            <div className="p-4">
              {appointments === null ? (
                <p className="text-sm text-[var(--text-secondary)]">Could not load appointments.</p>
              ) : appointments.length === 0 ? (
                <p className="text-sm text-[var(--text-secondary)]">No appointments.</p>
              ) : (
                <ul className="space-y-2">
                  {appointments.map((appt) => (
                    <li
                      key={appt.id}
                      className="rounded-lg border border-[var(--v48-border)] bg-slate-50 p-3"
                    >
                      <p className="text-sm font-medium text-[var(--text-primary)]">
                        {appt.title}
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                        {new Date(appt.startTime).toLocaleString()} ·{" "}
                        <span
                          className={
                            appt.status === "confirmed"
                              ? "text-green-600"
                              : appt.status === "cancelled"
                                ? "text-red-600"
                                : "text-amber-600"
                          }
                        >
                          {appt.status}
                        </span>
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* 6. Notes */}
          <ContactNotes notes={notes} contactId={id} />

          {/* 7. Active Recipes */}
          <ContactRecipeStatus activations={matchedActivations} />
        </div>
      </div>
    </div>
  );
}
