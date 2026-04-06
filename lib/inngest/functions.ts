// ---------------------------------------------------------------------------
// Inngest Functions — Background jobs for Vector 48
// ---------------------------------------------------------------------------

import { inngest } from "./client";
import { provisionCustomer } from "@/lib/ghl/provisioning";
import { provisionRecipe } from "@/lib/n8n/provision";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getN8nWebhookUrl } from "@/lib/recipes/eventMapping";

// ── Customer Provisioning ──────────────────────────────────────────────────

/**
 * Triggered after onboarding completion. Runs GHL provisioning (sub-account,
 * Voice AI, webhooks) and optionally activates Recipe 1 via n8n.
 */
export const provisionCustomerFn = inngest.createFunction(
  {
    id: "provision-customer",
    retries: 2,
  },
  { event: "app/customer.onboarding.completed" },
  async ({ event, step }) => {
    const { accountId, activateRecipe, voiceConfig, activationId } =
      event.data as {
        accountId: string;
        activateRecipe: boolean;
        voiceConfig?: { voiceGender: string; voiceGreeting: string };
        activationId?: string;
      };

    // Step 1: GHL infrastructure provisioning
    const result = await step.run("provision-ghl", async () => {
      return provisionCustomer(accountId);
    });

    if (!result.success) {
      return { status: "failed", error: result.error };
    }

    // Step 2: Activate Recipe 1 (AI Phone Answering) via n8n if requested
    if (activateRecipe && activationId) {
      await step.run("provision-n8n-recipe", async () => {
        const config = voiceConfig
          ? {
              voice_gender: voiceConfig.voiceGender,
              voice_greeting: voiceConfig.voiceGreeting,
            }
          : null;

        await provisionRecipe(
          accountId,
          "ai-phone-answering",
          config,
          activationId,
        );
      });
    }

    return { status: "complete", ghl_sub_account_id: result.ghl_sub_account_id };
  },
);

// ── Recipe Trigger Processor (Cron) ────────────────────────────────────────

/**
 * Runs every 5 minutes. Picks up pending recipe_triggers whose fire_at has
 * passed, then fires each to the appropriate n8n webhook endpoint.
 */
export const processRecipeTriggersFn = inngest.createFunction(
  {
    id: "process-recipe-triggers",
    retries: 1,
  },
  { cron: "*/5 * * * *" },
  async ({ step }) => {
    const stats = await step.run("process-pending-triggers", async () => {
      const supabase = getSupabaseAdmin();

      // Fetch triggers that are due
      const { data: triggers, error } = await supabase
        .from("recipe_triggers")
         .select("id, account_id, recipe_slug, payload")
        .eq("status", "queued")
        .lte("fire_at", new Date().toISOString())
        .limit(100);

      if (error || !triggers?.length) {
        return { processed: 0, failed: 0 };
      }

      let processed = 0;
      let failed = 0;

      for (const trigger of triggers) {
        try {
          const webhookUrl = getN8nWebhookUrl(
            trigger.recipe_slug,
            trigger.account_id,
          );

          // Fire to n8n — best-effort, don't block on failures
          const res = await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              account_id: trigger.account_id,
              recipe_slug: trigger.recipe_slug,
              trigger_id: trigger.id,
              ...(trigger.payload as Record<string, unknown> ?? {}),
            }),
          });

          if (res.ok) {
            await supabase
              .from("recipe_triggers")
              .update({ status: "completed", processed_at: new Date().toISOString(), last_error: null })
              .eq("id", trigger.id);
            processed++;
          } else {
            console.warn(
              `[recipe-triggers] n8n returned ${res.status} for trigger ${trigger.id}`,
            );
            failed++;
          }
        } catch (err) {
          console.error(
            `[recipe-triggers] Failed to fire trigger ${trigger.id}:`,
            err instanceof Error ? err.message : err,
          );
          failed++;
        }
      }

      return { processed, failed };
    });

    return stats;
  },
);
