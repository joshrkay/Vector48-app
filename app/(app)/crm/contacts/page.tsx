import { redirect } from "next/navigation";
import { requireAccountForUser } from "@/lib/auth/account";
import { createServerClient } from "@/lib/supabase/server";
import { cachedGHLClient } from "@/lib/ghl/cache";
import { normalizePhone } from "@/components/crm/contacts/contactUtils";
import { ContactsClientShell } from "@/components/crm/contacts/ContactsClientShell";
import { getAccountGhlCredentials } from "@/lib/ghl";

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

  let auth:
    | {
        locationId: string;
        accessToken: string;
      }
    | null = null;
  let ghlUnavailableReason: string | null = null;

  try {
    const { locationId, accessToken } = await getAccountGhlCredentials(account.id);
    auth = { locationId, accessToken };
  } catch (error) {
    const reasonFromProvisioning =
      account.ghl_provisioning_status === "failed"
        ? (account.ghl_provisioning_error ?? "GHL provisioning failed.")
        : null;
    ghlUnavailableReason =
      reasonFromProvisioning ??
      (error instanceof Error ? error.message : "Unable to load GHL credentials.");
  }

  // Fetch contacts via cache + active recipe_activations (AI badge) in parallel
  const [contactsResult, activationsResult] = await Promise.allSettled([
    auth
      ? cachedGHLClient(account.id).getContacts(
          {
            limit: 20,
            tag: TAG_MAP[filter],
            query: q,
          },
          { locationId: auth.locationId, apiKey: auth.accessToken },
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
  const aiPhones =
    activationsResult.status === "fulfilled"
      ? (activationsResult.value.data ?? [])
    .map((r) => r.config as Record<string, unknown> | null)
    .filter((config) => config && typeof config.phone === "string")
    .map((config) => normalizePhone(config!.phone as string))
    .filter((phone): phone is string => phone !== null)
      : [];

  if (contactsResult.status === "rejected" && !ghlUnavailableReason) {
    ghlUnavailableReason =
      contactsResult.reason instanceof Error
        ? contactsResult.reason.message
        : "Unable to load contacts from GoHighLevel.";
  }

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
      ghlUnavailableReason={ghlUnavailableReason}
    />
  );
}
