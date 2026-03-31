import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { requireAccountForUser } from "@/lib/auth/account";
import { getActiveRecipesRequiringProvider } from "@/lib/settings/recipesDependingOnProvider";
import type { Database } from "@/lib/supabase/types";

const providerSchema = z.enum(["jobber", "servicetitan", "google_business"]);

export async function GET(req: Request) {
  const supabase = await createServerClient();
  const session = await requireAccountForUser(supabase);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const parsed = providerSchema.safeParse(url.searchParams.get("provider"));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
  }

  const provider = parsed.data as Database["public"]["Enums"]["integration_provider"];
  const recipes = await getActiveRecipesRequiringProvider(
    supabase,
    session.accountId,
    provider,
  );

  return NextResponse.json({ recipes });
}
