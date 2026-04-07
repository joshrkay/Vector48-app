import { redirect } from "next/navigation";

import { PipelineBoard } from "@/components/crm/pipeline/PipelineBoard";
import { tryGetAccountGhlCredentials, withAuthRetry } from "@/lib/ghl";
import { normalizePipelineOpportunity, normalizeUsPhone } from "@/lib/crm/pipeline";
import { requireAccountForUser } from "@/lib/auth/account";
import { createServerClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import type { GHLOpportunity } from "@/lib/ghl/types";

type RecipeActivation = Database["public"]["Tables"]["recipe_activations"]["Row"];
const OPPORTUNITY_PAGE_SIZE = 250;

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

export default async function PipelinePage() {
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

  const { data: account } = await supabase
    .from("accounts")
    .select("id, ghl_provisioning_status, ghl_provisioning_error")
    .eq("id", session.accountId)
    .maybeSingle();

  if (!account) {
    redirect("/login");
  }

  const credentials = await tryGetAccountGhlCredentials(account.id);

  if (!credentials) {
    return (
      <div className="flex flex-col gap-4">
        <div className="space-y-1">
          <h1 className="font-heading text-2xl font-bold md:text-[28px]">Pipeline</h1>
          <p className="text-sm text-[var(--text-secondary)]">
            Track open opportunities by stage and move them without leaving CRM.
          </p>
        </div>
        <p className="text-sm text-[var(--text-secondary)]">0 open opportunities across 0 pipelines</p>
        <PipelineBoard pipelines={[]} initialOpportunities={[]} />
      </div>
    );
  }

  try {
  const [ghlData, activationsResult] = await Promise.all([
    withAuthRetry(account.id, async (client) => {
      const [pipelines, opportunities] = await Promise.all([
        client.pipelines.list(),
        (async () => {
          const all: GHLOpportunity[] = [];
          const seenCursors = new Set<string>();
          let cursor: string | undefined;

          while (true) {
            const result = await client.opportunities.list({
              status: "open",
              limit: OPPORTUNITY_PAGE_SIZE,
              sortBy: "dateAdded",
              sortOrder: "desc",
              startAfterId: cursor,
            });

            const page = result.data ?? [];
            all.push(...page);

            const nextCursor =
              result.meta?.startAfterId ??
              (page.length === OPPORTUNITY_PAGE_SIZE
                ? page[page.length - 1]?.id
                : null);

            if (
              page.length < OPPORTUNITY_PAGE_SIZE ||
              !nextCursor ||
              seenCursors.has(nextCursor)
            ) {
              return all;
            }

            seenCursors.add(nextCursor);
            cursor = nextCursor;
          }
        })(),
      ]);

      // Backfill missing contact details
      const missingContactIds = Array.from(
        new Set(
          opportunities
            .filter((opp) => !opp.contact?.name?.trim() || !opp.contact?.phone?.trim())
            .map((opp) => opp.contactId),
        ),
      );

      const missingContacts = await Promise.allSettled(
        missingContactIds.map(async (contactId) => {
          const contact = await client.contacts.get(contactId);
          return [contactId, contact] as const;
        }),
      );

      const contactMap = new Map(
        missingContacts.flatMap((r) => (r.status === "fulfilled" ? [r.value] : [])),
      );

      return { pipelines, opportunities, contactMap };
    }),
    supabase
      .from("recipe_activations")
      .select("*")
      .eq("account_id", account.id)
      .eq("status", "active"),
  ]);

  const { pipelines, opportunities, contactMap } = ghlData;
  const recipeActivations = (activationsResult.data ?? []) as RecipeActivation[];

  const normalizedOpportunities = opportunities.map((opportunity) => {
    const fallbackContact = contactMap.get(opportunity.contactId);
    const phone = fallbackContact?.phone ?? opportunity.contact?.phone ?? null;

    return normalizePipelineOpportunity(
      opportunity,
      {
        name: fallbackContact?.name ?? opportunity.contact?.name ?? null,
        phone,
      },
      getRecipeSlugsForPhone(phone, recipeActivations),
    );
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="space-y-1">
        <h1 className="font-heading text-2xl font-bold md:text-[28px]">Pipeline</h1>
        <p className="text-sm text-[var(--text-secondary)]">
          Track open opportunities by stage and move them without leaving CRM.
        </p>
      </div>

      <p className="text-sm text-[var(--text-secondary)]">
        {normalizedOpportunities.length}{" "}
        {normalizedOpportunities.length === 1 ? "open opportunity" : "open opportunities"} across{" "}
        {pipelines.length} {pipelines.length === 1 ? "pipeline" : "pipelines"}
      </p>

      <PipelineBoard
        pipelines={pipelines}
        initialOpportunities={normalizedOpportunities}
      />
    </div>
  );
  } catch (err) {
    console.error("[pipeline] GHL API error:", (err as Error).message);
    return (
      <div className="flex flex-col gap-4">
        <div className="space-y-1">
          <h1 className="font-heading text-2xl font-bold md:text-[28px]">Pipeline</h1>
          <p className="text-sm text-[var(--text-secondary)]">
            Track open opportunities by stage and move them without leaving CRM.
          </p>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          Unable to connect to GoHighLevel. Your credentials may have expired &mdash; please reconnect in Settings.
        </div>
        <PipelineBoard pipelines={[]} initialOpportunities={[]} />
      </div>
    );
  }
}
