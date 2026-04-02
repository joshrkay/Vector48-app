import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

function noStoreJson(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: { ...NO_STORE_HEADERS, ...init?.headers },
  });
}

const TABLES = [
  "accounts",
  "pricing_config",
  "recipe_activations",
  "automation_events",
] as const;

export async function GET() {
  const start = Date.now();

  try {
    const supabase = createAdminClient();

    const results = await Promise.all(
      TABLES.map((table) =>
        supabase.from(table).select("*", { count: "exact", head: true }).limit(1),
      ),
    );

    const tables = Object.fromEntries(
      TABLES.map((table, i) => [table, results[i].error === null]),
    );

    const allOk = Object.values(tables).every(Boolean);

    return noStoreJson(
      { status: allOk ? "ok" : "degraded", latencyMs: Date.now() - start, tables },
      { status: allOk ? 200 : 503 },
    );
  } catch (err) {
    return noStoreJson(
      {
        status: "error",
        latencyMs: Date.now() - start,
        error: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 503 },
    );
  }
}
