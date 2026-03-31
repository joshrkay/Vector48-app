import { NextResponse } from "next/server";
import { z } from "zod";

import { provisionRecipe } from "@/lib/n8n/provision";
import { createServerClient } from "@/lib/supabase/server";

const bodySchema = z.object({
  accountId: z.string().uuid(),
  recipeSlug: z.string().min(1),
  config: z.record(z.unknown()).optional().nullable(),
});

export async function POST(request: Request) {
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { accountId, recipeSlug, config } = parsed.data;

  const { data: membership } = await supabase
    .from("account_users")
    .select("account_id")
    .eq("account_id", accountId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: inserted, error: insertError } = await supabase
    .from("recipe_activations")
    .insert({
      account_id: accountId,
      recipe_slug: recipeSlug,
      status: "active",
      config: config ?? null,
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    return NextResponse.json(
      { error: insertError?.message ?? "Insert failed" },
      { status: 400 },
    );
  }

  try {
    const result = await provisionRecipe(
      accountId,
      recipeSlug,
      (config as Record<string, unknown> | null) ?? null,
      inserted.id,
    );
    return NextResponse.json({
      workflowId: result.workflowId,
      webhookUrl: result.webhookUrl,
    });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Provisioning failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
