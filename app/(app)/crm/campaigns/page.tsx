import { redirect } from "next/navigation";

import { CampaignList } from "@/components/crm/campaigns/CampaignList";
import { withAuthRetry, tryGetAccountGhlCredentials } from "@/lib/ghl";
import { requireAccountForUser } from "@/lib/auth/account";
import { createServerClient } from "@/lib/supabase/server";
import type { GHLCampaign } from "@/lib/ghl/types";

export default async function CampaignsPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const session = await requireAccountForUser(supabase);
  if (!session) {
    redirect("/login");
  }

  const credentials = await tryGetAccountGhlCredentials(session.accountId);

  if (!credentials) {
    return (
      <div className="flex flex-col gap-4">
        <div className="space-y-1">
          <h1 className="font-heading text-2xl font-bold md:text-[28px]">Campaigns</h1>
          <p className="text-sm text-[var(--text-secondary)]">
            View and manage your GoHighLevel marketing campaigns.
          </p>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          Connect GoHighLevel in Settings to view campaigns.
        </div>
      </div>
    );
  }

  let campaigns: GHLCampaign[] = [];
  try {
    campaigns = await withAuthRetry(session.accountId, async (client) =>
      client.campaigns.list(),
    );
  } catch (err) {
    console.error("[campaigns] GHL API error:", (err as Error).message);
    return (
      <div className="flex flex-col gap-4">
        <div className="space-y-1">
          <h1 className="font-heading text-2xl font-bold md:text-[28px]">Campaigns</h1>
          <p className="text-sm text-[var(--text-secondary)]">
            View and manage your GoHighLevel marketing campaigns.
          </p>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          Unable to connect to GoHighLevel. Your credentials may have expired &mdash; please reconnect in Settings.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="space-y-1">
        <h1 className="font-heading text-2xl font-bold md:text-[28px]">Campaigns</h1>
        <p className="text-sm text-[var(--text-secondary)]">
          View and manage your GoHighLevel marketing campaigns.
        </p>
      </div>

      <p className="text-sm text-[var(--text-secondary)]">
        {campaigns.length} {campaigns.length === 1 ? "campaign" : "campaigns"}
      </p>

      <CampaignList campaigns={campaigns} />
    </div>
  );
}
