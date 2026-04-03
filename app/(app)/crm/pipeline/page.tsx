import { redirect } from "next/navigation";

import { PipelineBoard } from "@/components/crm/pipeline/PipelineBoard";
import { cachedGHLClient } from "@/lib/ghl/cache";
import { getAccountGhlCredentials } from "@/lib/ghl";
import { normalizePipelineOpportunity, normalizeUsPhone } from "@/lib/crm/pipeline";
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

  const { data: account } = await supabase
    .from("accounts")
    .select("id, ghl_provisioning_status, ghl_provisioning_error")
    .eq("owner_user_id", user.id)
    .single();

  if (!account) {
    redirect("/login");
  }

  let auth:
    | {
        locationId: string;
        apiKey: string;
      }
    | null = null;
  let ghlUnavailableReason: string | null = null;

  try {
    const { locationId, accessToken } = await getAccountGhlCredentials(account.id);
    auth = { locationId, apiKey: accessToken };
  } catch (error) {
    const reasonFromProvisioning =
      account.ghl_provisioning_status === "failed"
        ? (account.ghl_provisioning_error ?? "GHL provisioning failed.")
        : null;
    ghlUnavailableReason =
      reasonFromProvisioning ??
      (error instanceof Error ? error.message : "Unable to load GHL credentials.");
  }

  if (!auth) {
    return (
      <div className="space-y-4">
        <div className="space-y-1">
          <h1 className="font-heading text-2xl font-bold md:text-[28px]">Pipeline</h1>
          <p className="text-sm text-[var(--text-secondary)]">
            Track open opportunities by stage and move them without leaving CRM.
          </p>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          GoHighLevel is currently unavailable for this account.
          {ghlUnavailableReason ? ` ${ghlUnavailableReason}` : ""}
        </div>
      </div>
    );
  }

  const client = cachedGHLClient(account.id);

  const [pipelinesResult, opportunities, activationsResult] = await Promise.all([
    client.getPipelines(auth),
    (async () => {
      const all: GHLOpportunity[] = [];
      const seenCursors = new Set<string>();
      let cursor: string | undefined;

      while (true) {
        const result = await client.getOpportunities(
          {
            status: "open",
            limit: OPPORTUNITY_PAGE_SIZE,
            sortBy: "dateAdded",
            sortOrder: "desc",
            startAfterId: cursor,
          },
          auth,
        );

        const page = result.opportunities ?? [];
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
    supabase
      .from("recipe_activations")
      .select("*")
      .eq("account_id", account.id)
      .eq("status", "active"),
  ]);

  const missingContactIds = Array.from(
    new Set(
      opportunities
        .filter((opportunity) => {
          const hasName = !!opportunity.contact?.name?.trim();
          const hasPhone = !!opportunity.contact?.phone?.trim();
          return !hasName || !hasPhone;
        })
        .map((opportunity) => opportunity.contactId),
    ),
  );

  const missingContacts = await Promise.allSettled(
    missingContactIds.map(async (contactId) => {
      const result = await client.getContact(contactId, auth);
      return [contactId, result.contact] as const;
    }),
  );

  const contactMap = new Map(
    missingContacts.flatMap((result) => (result.status === "fulfilled" ? [result.value] : [])),
  );

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
        {(pipelinesResult.pipelines ?? []).length}{" "}
        {(pipelinesResult.pipelines ?? []).length === 1 ? "pipeline" : "pipelines"}
      </p>

      <PipelineBoard
        pipelines={pipelinesResult.pipelines ?? []}
        initialOpportunities={normalizedOpportunities}
      />
    </div>
  );
}
