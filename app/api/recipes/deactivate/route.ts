import { NextResponse } from "next/server";
import { z } from "zod";

import { createServerClient } from "@/lib/supabase/server";
import { deprovisionRecipe } from "@/lib/n8n/provision";

const bodySchema = z.object({
  recipeSlug: z.string().min(1),
});

export async function POST(req: Request) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: account } = await supabase
    .from("accounts")
    .select("id")
    .eq("owner_user_id", user.id)
    .single();

  if (!account) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "recipeSlug is required" }, { status: 400 });
  }

  const recipeSlug = parsed.data.recipeSlug;

  const { data: row } = await supabase
    .from("recipe_activations")
    .select("id, status")
    .eq("account_id", account.id)
    .eq("recipe_slug", recipeSlug)
    .order("activated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!row || row.status === "deactivated") {
    return NextResponse.json({ success: true, idempotent: true });
  }

  try {
    await deprovisionRecipe(account.id, recipeSlug);
  } catch (e) {
    console.error(
      "[deactivate] deprovision failed",
      e instanceof Error ? e.message : String(e),
    );
    return NextResponse.json(
      { error: "Could not deactivate recipe automation" },
      { status: 502 },
    );
  }

  return NextResponse.json({ success: true });
}
