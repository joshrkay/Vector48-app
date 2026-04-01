import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { getAccountGhlCredentials } from "@/lib/ghl";
import { getContacts } from "@/lib/ghl/contacts";
import { ContactsClientShell } from "@/components/crm/contacts/ContactsClientShell";

const TAG_MAP: Record<string, string> = {
  new_lead: "New Lead",
  contacted: "Contacted",
  active_customer: "Active Customer",
  inactive: "Inactive",
};

export default async function ContactsPage({
  searchParams,
}: {
  searchParams?: { filter?: string; q?: string };
}) {
  const filter = searchParams?.filter ?? "all";
  const q = searchParams?.q;

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: account } = await supabase
    .from("accounts")
    .select("id")
    .eq("owner_user_id", user.id)
    .single();
  if (!account) redirect("/login");

  const { locationId, accessToken } = await getAccountGhlCredentials(account.id);

  // Fetch contacts + active recipe_triggers (AI badge) in parallel
  const [contactsResult, triggersResult] = await Promise.all([
    getContacts(
      {
        locationId,
        limit: 20,
        tag: TAG_MAP[filter],
        query: q,
      },
      { locationId, apiKey: accessToken },
    ),
    supabase
      .from("recipe_triggers")
      .select("contact_id")
      .eq("account_id", account.id)
      .eq("fired", false),
  ]);

  const contacts = contactsResult.contacts ?? [];
  const aiContactIds = (triggersResult.data ?? [])
    .map((r) => r.contact_id)
    .filter((id): id is string => Boolean(id));

  const nextCursor =
    contacts.length === 20 ? contacts[contacts.length - 1].id : null;

  return (
    <ContactsClientShell
      key={filter}
      initialContacts={contacts}
      initialNextCursor={nextCursor}
      aiContactIds={aiContactIds}
      filter={filter}
      accountId={account.id}
    />
  );
}
