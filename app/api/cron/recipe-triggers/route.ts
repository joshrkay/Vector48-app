import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  buildRecipeScheduledWebhookUrl,
  buildRecipeTriggerPostBody,
  verifyCronBearer,
} from "@/lib/cron/recipeTriggerDelivery";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BATCH_LIMIT = 50;

async function runRecipeTriggerSweep(): Promise<NextResponse> {
  const n8nBase = process.env.N8N_BASE_URL?.trim();
  if (!n8nBase) {
    return NextResponse.json({ error: "N8N_BASE_URL is not configured" }, { status: 500 });
  }

  const supabase = getSupabaseAdmin();
  const nowIso = new Date().toISOString();

  const { data: due, error: listError } = await supabase
    .from("recipe_triggers")
    .select("id, account_id, recipe_id, payload, attempt_count")
    .eq("status", "queued")
    .lte("fire_at", nowIso)
    .order("fire_at", { ascending: true })
    .limit(BATCH_LIMIT);

  if (listError) {
    return NextResponse.json({ error: listError.message }, { status: 500 });
  }

  let processed = 0;
  let failed = 0;
  let skipped = 0;

  for (const row of due ?? []) {
    const { data: claimed, error: claimError } = await supabase
      .from("recipe_triggers")
      .update({ status: "processing" })
      .eq("id", row.id)
      .eq("status", "queued")
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

    const { data: activation } = await supabase
      .from("recipe_activations")
      .select("id")
      .eq("account_id", row.account_id)
      .eq("recipe_id", row.recipe_id)
      .eq("status", "active")
      .maybeSingle();

    if (!activation) {
      await markFailed("No active recipe activation for this account and recipe");
      failed += 1;
      continue;
    }

    const url = buildRecipeScheduledWebhookUrl(n8nBase, row.recipe_id, row.account_id);
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
