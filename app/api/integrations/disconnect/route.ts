import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { requireAccountForUser } from "@/lib/auth/account";
import { disconnectIntegrationSchema } from "@/lib/validations/settings";
import type { Database } from "@/lib/supabase/types";
import { getActiveRecipesRequiringProvider } from "@/lib/settings/recipesDependingOnProvider";

type Provider = Database["public"]["Enums"]["integration_provider"];

export async function POST(req: Request) {
  const supabase = await createServerClient();
  const session = await requireAccountForUser(supabase);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = disconnectIntegrationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const provider = parsed.data.provider as Provider;
  const dependent = await getActiveRecipesRequiringProvider(
    supabase,
    session.accountId,
    provider,
  );

  for (const r of dependent) {
    const { error } = await supabase
      .from("recipe_activations")
      .update({ status: "paused", deactivated_at: null })
      .eq("account_id", session.accountId)
      .eq("recipe_slug", r.slug)
      .eq("status", "active");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  const { data: existing } = await supabase
    .from("integrations")
    .select("id")
    .eq("account_id", session.accountId)
    .eq("provider", provider)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("integrations")
      .update({
        status: "disconnected",
        credentials_encrypted: null,
      })
      .eq("id", existing.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({
    success: true,
    pausedRecipes: dependent,
  });
}
