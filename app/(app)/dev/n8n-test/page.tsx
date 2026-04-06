import { notFound } from "next/navigation";

import { N8nProvisionTestPanel } from "@/components/dev/N8nProvisionTestPanel";
import { isN8nDevToolsEnabled } from "@/lib/n8n/devGate";
import { requireAccountForUser } from "@/lib/auth/account";
import { createServerClient } from "@/lib/supabase/server";

export default async function N8nDevTestPage() {
  if (!isN8nDevToolsEnabled()) {
    notFound();
  }

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    notFound();
  }
  const session = await requireAccountForUser(supabase);
  if (!session) {
    notFound();
  }

  const { data: account } = await supabase
    .from("accounts")
    .select("id")
    .eq("id", session.accountId)
    .maybeSingle();

  if (!account) {
    notFound();
  }

  return (
    <div>
      <h1 className="font-heading text-[28px] font-bold">n8n provisioning test</h1>
      <p className="mt-1 max-w-2xl text-sm text-[var(--text-secondary)]">
        Development-only page. Requires{" "}
        <code className="rounded bg-muted px-1 text-xs">N8N_BASE_URL</code> and{" "}
        <code className="rounded bg-muted px-1 text-xs">N8N_API_KEY</code>, plus a
        connected GHL account for full provisioning. In production, set{" "}
        <code className="rounded bg-muted px-1 text-xs">ENABLE_N8N_DEV_TOOLS=true</code>{" "}
        to enable this route.
      </p>
      <div className="mt-8">
        <N8nProvisionTestPanel accountId={account.id} />
      </div>
    </div>
  );
}
