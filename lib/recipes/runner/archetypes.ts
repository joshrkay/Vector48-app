// ---------------------------------------------------------------------------
// Recipe Archetype Registry
//
// Operator-authored defaults for each Agent SDK recipe. When a tenant
// activates a recipe, we COPY the archetype into a tenant_agents row,
// resolving template placeholders ({{vertical}}, {{business_name}}) from
// the account. Tenants then edit their copy.
//
// Tool sets are archetype-fixed because exposing tools is a security
// boundary — tenants never edit them directly. The archetype's
// `toolConfig` ends up in tenant_agents.tool_config and the runner reads
// it at execution time.
// ---------------------------------------------------------------------------

import { aiPhoneAnsweringArchetype } from "./archetypes/ai-phone-answering.ts";
import { appointmentReminderArchetype } from "./archetypes/appointment-reminder.ts";
import { estimateFollowUpArchetype } from "./archetypes/estimate-follow-up.ts";
import { googleReviewBoosterArchetype } from "./archetypes/google-review-booster.ts";
import { leadQualificationArchetype } from "./archetypes/lead-qualification.ts";
import { newLeadInstantResponseArchetype } from "./archetypes/new-lead-instant-response.ts";
import { postJobUpsellArchetype } from "./archetypes/post-job-upsell.ts";
import { missedCallTextBackArchetype } from "./archetypes/missed-call-text-back.ts";
import { reviewRequestArchetype } from "./archetypes/review-request.ts";
import { techOnTheWayArchetype } from "./archetypes/tech-on-the-way.ts";

export interface RecipeArchetype {
  /** Recipe slug — must match lib/recipes/catalog.ts. */
  slug: string;
  /** Default display name shown in the Agents dashboard. */
  displayName: string;
  /**
   * System prompt with `{{placeholder}}` substitutions. Resolved against
   * the account row when the archetype is copied into a tenant_agents row.
   * Supported placeholders: business_name, vertical, greeting_name.
   */
  systemPrompt: string;
  /** Default Anthropic model. Tenants can change within an allowed list. */
  model: string;
  maxTokens: number;
  temperature?: number;
  /** Operator-controlled tool config blob — not editable by tenants. */
  toolConfig: Record<string, unknown>;
  /** Default ElevenLabs voice id, where applicable. */
  voiceId?: string;
  /** Default monthly spend cap (USD micros). null = unlimited. */
  monthlySpendCapMicros: number | null;
  /** Default rate limit per hour. null = unlimited. */
  rateLimitPerHour: number | null;
}

const ARCHETYPES: Record<string, RecipeArchetype> = {
  [aiPhoneAnsweringArchetype.slug]: aiPhoneAnsweringArchetype,
  [missedCallTextBackArchetype.slug]: missedCallTextBackArchetype,
  [reviewRequestArchetype.slug]: reviewRequestArchetype,
  [estimateFollowUpArchetype.slug]: estimateFollowUpArchetype,
  [appointmentReminderArchetype.slug]: appointmentReminderArchetype,
  [leadQualificationArchetype.slug]: leadQualificationArchetype,
  [newLeadInstantResponseArchetype.slug]: newLeadInstantResponseArchetype,
  [googleReviewBoosterArchetype.slug]: googleReviewBoosterArchetype,
  [techOnTheWayArchetype.slug]: techOnTheWayArchetype,
  [postJobUpsellArchetype.slug]: postJobUpsellArchetype,
};

export function getArchetype(slug: string): RecipeArchetype | null {
  return ARCHETYPES[slug] ?? null;
}

export function listArchetypes(): RecipeArchetype[] {
  return Object.values(ARCHETYPES);
}

/** Slugs of every recipe handled by the Agent SDK runner. */
export const AGENT_SDK_RECIPE_SLUGS = Object.keys(ARCHETYPES);

/**
 * Resolves `{{placeholder}}` tokens in the archetype's system prompt
 * against an account row, producing the concrete prompt that will be
 * stored in tenant_agents.system_prompt.
 */
export interface ArchetypeAccount {
  business_name: string | null;
  vertical: string | null;
  greeting_name: string | null;
}

export function resolveSystemPrompt(
  template: string,
  account: ArchetypeAccount,
): string {
  return template
    .replaceAll("{{business_name}}", account.business_name ?? "the business")
    .replaceAll("{{vertical}}", account.vertical ?? "home services")
    .replaceAll(
      "{{greeting_name}}",
      account.greeting_name ?? account.business_name ?? "the team",
    );
}
