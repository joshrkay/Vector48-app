import { Suspense } from "react";
import { redirect } from "next/navigation";
import { InboxClientShell } from "@/components/crm/inbox/InboxClientShell";
import { loadEnrichedInboxConversations } from "@/lib/crm/loadEnrichedInboxConversations";
import { requireAccountForUser } from "@/lib/auth/account";
import { createServerClient } from "@/lib/supabase/server";

export default async function InboxPage({
  searchParams,
}: {
  searchParams?: { conversation?: string; filter?: string };
}) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const session = await requireAccountForUser(supabase);
  if (!session) redirect("/login");

  const { data: account } = await supabase.from("accounts").select("id").eq("id", session.accountId).maybeSingle();
  if (!account) redirect("/login");

  let initial;
  try {
    initial = await loadEnrichedInboxConversations(account.id);
  } catch {
    initial = { conversations: [], contacts: {} };
  }

  const conversationId = searchParams?.conversation?.trim() || null;
  const filter = searchParams?.filter?.trim() || null;

  return (
    <Suspense
      fallback={<p className="text-sm text-[var(--text-secondary)]">Loading inbox…</p>}
    >
      <InboxClientShell
        initial={initial}
        initialConversationId={conversationId}
        initialFilter={filter}
      />
    </Suspense>
  );
}
