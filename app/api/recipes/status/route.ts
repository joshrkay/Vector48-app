import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { parseAccountIdFromRecipeStatusUrl } from "@/lib/recipes/recipeStatusParams";

export async function GET(req: Request) {
  const accountId = parseAccountIdFromRecipeStatusUrl(req.url);

  if (!accountId) {
    return NextResponse.json({ error: "account_id is required" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  const { data: account, error: accountError } = await supabase
    .from("accounts")
    .select("id")
    .eq("id", accountId)
    .maybeSingle();

  if (accountError) {
    return NextResponse.json({ error: accountError.message }, { status: 500 });
  }

  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  const { data: rows, error: listError } = await supabase
    .from("recipe_activations")
    .select("recipe_id, status, activated_at")
    .eq("account_id", accountId)
    .order("recipe_id", { ascending: true });

  if (listError) {
    return NextResponse.json({ error: listError.message }, { status: 500 });
  }

  return NextResponse.json({
    account_id: accountId,
    activations: rows ?? [],
  });
}
