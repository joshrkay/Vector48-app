import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  buildRecipeScheduledWebhookUrl,
  buildRecipeTriggerPostBody,
  verifyCronBearer,
} from "@/lib/cron/recipeTriggerDelivery";
import { isGhlNative } from "@/lib/recipes/engineRegistry";
import { executeGhlNativeRecipe } from "@/lib/recipes/ghlExecutor";
import { RECIPE_TRIGGER_CANONICAL_PENDING_STATUS } from "@/lib/recipes/schemaContracts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BATCH_LIMIT = 50;

type DueTriggerRow = {
  id: string;
  account_id: string;
  recipe_slug: string;
  payload: Record<string, unknown> | null;
  attempt_count: number;
};

async function listDueTriggers(nowIso: string): Promise<{ rows: DueTriggerRow[]; error: string | null }> {
  const supabase = getSupabaseAdmin();

  const canonical = await supabase
    .from("recipe_triggers")
    .select("id, account_id, recipe_slug, payload, attempt_count")
    .eq("status", RECIPE_TRIGGER_CANONICAL_PENDING_STATUS)
    .lte("fire_at", nowIso)
    .order("fire_at", { ascending: true })
    .limit(BATCH_LIMIT);

  if (!canonical.error) {
    return { rows: (canonical.data ?? []) as DueTriggerRow[], error: null };
  }

  // Compatibility path for rollback windows where recipe_triggers still uses
  // legacy columns (recipe_id + fired boolean) instead of status.
  const legacy = await supabase
    .from("recipe_triggers")
    .select("id, account_id, recipe_id, payload, attempt_count")
    .eq("fired", false)
    .lte("fire_at", nowIso)
    .order("fire_at", { ascending: true })
    .limit(BATCH_LIMIT);

  if (legacy.error) {
    return { rows: [], error: canonical.error.message };
  }

  return {
    rows: (legacy.data ?? []).map((row) => ({
      id: row.id,
      account_id: row.account_id,
      recipe_slug: row.recipe_id ?? "",
      payload: row.payload,
      attempt_count: row.attempt_count ?? 0,
    })),
    error: null,
  };
}

async function runRecipeTriggerSweep(): Promise<NextResponse> {
  const n8nBase = process.env.N8N_BASE_URL?.trim() ?? "";

  const supabase = getSupabaseAdmin();
  const nowIso = new Date().toISOString();

  const { rows: due, error: listError } = await listDueTriggers(nowIso);
  if (listError) {
    return NextResponse.json({ error: listError }, { status: 500 });
  }

  let processed = 0;
  let failed = 0;
  let skipped = 0;

  for (const row of due) {
    const { data: claimed, error: claimError } = await supabase
      .from("recipe_triggers")
      .update({ status: "processing" })
      .eq("id", row.id)
      .eq("status", RECIPE_TRIGGER_CANONICAL_PENDING_STATUS)
      .select("id")
      .maybeSingle();

    if (claimError) {
      return NextResponse.json({ error: claimError.message }, { status: 500 });
    }

    if (!claimed) {
      skipped += 1;
      continue;
    }

    const markFailed = async (message: string) => {
      await supabase
        .from("recipe_triggers")
        .update({
          status: "failed",
          last_error: message,
          processed_at: nowIso,
          attempt_count: row.attempt_count + 1,
        })
        .eq("id", row.id);
    };

    if (!row.recipe_slug) {
      await markFailed("Trigger is missing recipe_slug");
      failed += 1;
      continue;
    }

    const { data: activation } = await supabase
      .from("recipe_activations")
      .select("id")
      .eq("account_id", row.account_id)
      .eq("recipe_slug", row.recipe_slug)
      .eq("status", "active")
      .maybeSingle();

    if (!activation) {
      await markFailed("No active recipe activation for this account and recipe");
      failed += 1;
      continue;
    }

    // ── Route: GHL-native or n8n ──────────────────────────────────────
    if (isGhlNative(row.recipe_slug)) {
      const triggerData = row.payload ?? {};
      const contactId =
        (triggerData.contact_id as string) ??
        (triggerData.contactId as string) ??
        "";

      if (!contactId) {
        await markFailed("Trigger payload missing contact_id for GHL-native recipe");
        failed += 1;
        continue;
      }

      try {
        const result = await executeGhlNativeRecipe({
          accountId: row.account_id,
          recipeSlug: row.recipe_slug,
          contactId,
          triggerData,
        });

        if (!result.ok) {
          await markFailed(result.error ?? "GHL-native execution failed");
          failed += 1;
          continue;
        }
      } catch (e) {
        await markFailed(e instanceof Error ? e.message : "GHL-native execution error");
        failed += 1;
        continue;
      }
    } else {
      // n8n path
      if (!n8nBase) {
        await markFailed("N8N_BASE_URL is not configured");
        failed += 1;
        continue;
      }

      const url = buildRecipeScheduledWebhookUrl(n8nBase, row.recipe_slug, row.account_id);
      const body = buildRecipeTriggerPostBody(row.account_id, row.payload);

      let res: Response;
      try {
        res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } catch (e) {
        await markFailed(e instanceof Error ? e.message : "Webhook request failed");
        failed += 1;
        continue;
      }

      if (!res.ok) {
        await markFailed(`Webhook returned HTTP ${res.status}`);
        failed += 1;
        continue;
      }
    }

    const { error: completeError } = await supabase
      .from("recipe_triggers")
      .update({
        status: "completed",
        processed_at: nowIso,
        last_error: null,
      })
      .eq("id", row.id);

    if (completeError) {
      return NextResponse.json({ error: completeError.message }, { status: 500 });
    }

    processed += 1;
  }

  return NextResponse.json({
    ok: true,
    processed,
    failed,
    skipped,
    batch_limit: BATCH_LIMIT,
  });
}

function unauthorized(): NextResponse {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "Cron disabled: CRON_SECRET is not set" },
      { status: 503 },
    );
  }
  if (!verifyCronBearer(req, secret)) {
    return unauthorized();
  }
  return runRecipeTriggerSweep();
}

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "Cron disabled: CRON_SECRET is not set" },
      { status: 503 },
    );
  }
  if (!verifyCronBearer(req, secret)) {
    return unauthorized();
  }
  return runRecipeTriggerSweep();
}
