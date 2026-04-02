import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { cachedGHLClient } from "@/lib/ghl/cache";
import { normalizePhone } from "@/components/crm/contacts/contactUtils";
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

  // Fetch contacts via cache + active recipe_activations (AI badge) in parallel
  const [contactsResult, activationsResult] = await Promise.all([
    cachedGHLClient(account.id).getContacts({
      limit: 20,
      tag: TAG_MAP[filter],
      query: q,
    }),
    supabase
      .from("recipe_activations")
      .select("config")
      .eq("account_id", account.id)
      .eq("status", "active"),
  ]);

  const contacts = contactsResult.contacts ?? [];
  const aiPhones = (activationsResult.data ?? [])
    .map((r) => r.config as Record<string, unknown> | null)
    .filter((config) => config && typeof config.phone === "string")
    .map((config) => normalizePhone(config!.phone as string))
    .filter((phone): phone is string => phone !== null);

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
    />
  );
}
