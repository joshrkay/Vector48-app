import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

const PAGE_SIZE = 20;

export async function GET(request: Request) {
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const rawOffset = searchParams.get("offset");
  const offset = Math.max(
    0,
    Math.floor(Number.parseInt(rawOffset ?? "0", 10) || 0),
  );

  const { data: account } = await supabase
    .from("accounts")
    .select("id")
    .eq("owner_user_id", user.id)
    .maybeSingle();

  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  const { data: rows, error } = await supabase
    .from("automation_events")
    .select("id, recipe_slug, event_type, summary, detail, created_at")
    .eq("account_id", account.id)
    .order("created_at", { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);

  if (error) {
    console.error("[dashboard/activity]", error.message);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }

  return NextResponse.json({
    events: rows ?? [],
    nextOffset: offset + (rows?.length ?? 0),
    hasMore: (rows?.length ?? 0) === PAGE_SIZE,
  });
}
