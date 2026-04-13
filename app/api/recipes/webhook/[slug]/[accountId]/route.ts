// ---------------------------------------------------------------------------
// Recipe Runner Webhook (Phase 2) — Next.js route wrapper
//
// POST /api/recipes/webhook/[slug]/[accountId]
//
// This file is intentionally a thin shell. All of the signature check,
// tenant-binding, runRecipe dispatch, and automation_events logging
// lives in lib/recipes/runner/webhookHandler so it can be exercised
// end-to-end by integration tests and the smoke driver without booting
// `next dev`. The wrapper below just resolves production dependencies
// and hands them off.
//
// Only ai-phone-answering is wired in Phase 2 — other slugs return 404.
// ---------------------------------------------------------------------------

import { authenticateGhlWebhook } from "@/app/api/webhooks/ghl/signatureVerification";
import { runRecipe } from "@/lib/recipes/runner";
import {
  handleRecipeWebhook,
  type WebhookSupabaseClient,
} from "@/lib/recipes/runner/webhookHandler";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string; accountId: string }> },
) {
  const params = await context.params;
  return handleRecipeWebhook(request, params, {
    supabase: getSupabaseAdmin() as unknown as WebhookSupabaseClient,
    authenticate: authenticateGhlWebhook,
    runRecipe,
  });
}
