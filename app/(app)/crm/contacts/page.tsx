import { redirect } from "next/navigation";
import { requireAccountForUser } from "@/lib/auth/account";
import { createServerClient } from "@/lib/supabase/server";
import { cachedGHLClient } from "@/lib/ghl/cache";
import { normalizePhone } from "@/components/crm/contacts/contactUtils";
import { ContactsClientShell } from "@/components/crm/contacts/ContactsClientShell";
import { tryGetAccountGhlCredentials } from "@/lib/ghl";

const TAG_MAP: Record<string, string> = {
  new_lead: "New Lead",
  contacted: "Contacted",
  active_customer: "Active Customer",
  inactive: "Inactive",
};

export default async function ContactsPage({
  searchParams,
}: {
  searchParams?: Promise<{ filter?: string; q?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  const filter = resolvedSearchParams?.filter ?? "all";
  const q = resolvedSearchParams?.q;

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const session = await requireAccountForUser(supabase);
  if (!session) redirect("/login");

  const { data: account } = await supabase
    .from("accounts")
    .select("id, ghl_provisioning_status, ghl_provisioning_error")
    .eq("id", session.accountId)
    .maybeSingle();
  if (!account) redirect("/login");

  const credentials = await tryGetAccountGhlCredentials(account.id);

  // Fetch contacts via cache + active recipe_activations (AI badge) in parallel
  const [contactsResult, activationsResult] = await Promise.allSettled([
    credentials
      ? cachedGHLClient(account.id).getContacts(
          {
            limit: 20,
            tag: TAG_MAP[filter],
            query: q,
          },
          { locationId: credentials.locationId, apiKey: credentials.accessToken },
        )
      : Promise.resolve({ contacts: [] }),
    supabase
      .from("recipe_activations")
      .select("config")
      .eq("account_id", account.id)
      .eq("status", "active"),
  ]);

  const contacts =
    contactsResult.status === "fulfilled" ? (contactsResult.value.contacts ?? []) : [];

  // Distinguish "not connected" from "connected but fetch failed" so the
  // empty-state resolver can route the user to Settings vs. a retry CTA.
  const ghlConnected = credentials !== null;
  const ghlUnavailableReason =
    credentials && contactsResult.status === "rejected"
      ? contactsResult.reason instanceof Error
        ? contactsResult.reason.message.slice(0, 160)
        : String(contactsResult.reason).slice(0, 160)
      : null;
  const aiPhones =
    activationsResult.status === "fulfilled"
      ? (activationsResult.value.data ?? [])
    .map((r) => r.config as Record<string, unknown> | null)
    .filter((config) => config && typeof config.phone === "string")
    .map((config) => normalizePhone(config!.phone as string))
    .filter((phone): phone is string => phone !== null)
      : [];

  const nextCursor =
    contacts.length === 20 ? contacts[contacts.length - 1].id : null;

  return (
    <ContactsClientShell
      key={filter}
      initialContacts={contacts}
      initialNextCursor={nextCursor}
      aiPhones={aiPhones}
      filter={filter}
      accountId={account.id}
      ghlConnected={ghlConnected}
      ghlUnavailableReason={ghlUnavailableReason}
    />
  );
}
