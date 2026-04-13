// ---------------------------------------------------------------------------
// Recipe Context
//
// Per-invocation state passed to recipe handlers. Loaded fresh for every
// runRecipe() call so two tenants firing the same recipe simultaneously
// never share any state — the entire object is local to its stack frame.
//
// Loads:
//   - The account row (business_name, vertical, plan, voice settings, etc.)
//   - GHL credentials via getAccountGhlCredentials() — single chokepoint
//   - A spend-cap-aware Anthropic client bound to (account, agent)
// ---------------------------------------------------------------------------

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getAccountGhlCredentials } from "@/lib/ghl/token";
import {
  createTrackedAnthropic,
  type TrackedAnthropic,
} from "./trackedClient";

export interface TenantAgent {
  id: string;
  account_id: string;
  recipe_slug: string;
  display_name: string;
  system_prompt: string;
  model: string;
  max_tokens: number;
  temperature: number | null;
  voice_id: string | null;
  tool_config: Record<string, unknown>;
  monthly_spend_cap_micros: number | null;
  rate_limit_per_hour: number | null;
  status: "active" | "paused" | "disabled";
}

export interface AccountSnapshot {
  id: string;
  business_name: string;
  vertical: string | null;
  plan_slug: string | null;
  greeting_name: string | null;
  notification_contact_phone: string | null;
}

export interface RecipeContext {
  accountId: string;
  agent: TenantAgent;
  account: AccountSnapshot;
  ghl: {
    locationId: string;
    accessToken: string;
  };
  ai: TrackedAnthropic;
  /** Trigger correlation id propagated through to llm_usage_events. */
  triggerId: string | null;
}

export interface BuildContextOptions {
  accountId: string;
  agent: TenantAgent;
  triggerId?: string | null;
}

export async function buildRecipeContext(
  options: BuildContextOptions,
): Promise<RecipeContext> {
  const { accountId, agent } = options;

  if (agent.account_id !== accountId) {
    throw new Error(
      `Agent ${agent.id} belongs to account ${agent.account_id}, not ${accountId}`,
    );
  }
  if (agent.status !== "active") {
    throw new Error(
      `Agent ${agent.id} (${agent.recipe_slug}) is not active: status=${agent.status}`,
    );
  }

  const supabase = getSupabaseAdmin();
  const { data: account, error: accountError } = await supabase
    .from("accounts")
    .select(
      "id, business_name, vertical, plan_slug, greeting_name, notification_contact_phone",
    )
    .eq("id", accountId)
    .maybeSingle();

  if (accountError || !account) {
    throw new Error(
      `Account ${accountId} not found while building recipe context: ${accountError?.message ?? "no row"}`,
    );
  }

  const ghl = await getAccountGhlCredentials(accountId);

  const ai = createTrackedAnthropic({
    accountId,
    recipeSlug: agent.recipe_slug,
    agent,
    triggerId: options.triggerId ?? null,
  });

  return {
    accountId,
    agent,
    account: account as AccountSnapshot,
    ghl: {
      locationId: ghl.locationId,
      accessToken: ghl.accessToken,
    },
    ai,
    triggerId: options.triggerId ?? null,
  };
}
