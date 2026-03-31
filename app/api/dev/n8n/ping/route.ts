import { NextResponse } from "next/server";

import { createN8nClientFromEnv } from "@/lib/n8n/client";
import { isN8nDevToolsEnabled } from "@/lib/n8n/devGate";
import { createServerClient } from "@/lib/supabase/server";

/**
 * GET — authenticated smoke test: env vars + list credentials from n8n (no writes).
 * Only when NODE_ENV=development or ENABLE_N8N_DEV_TOOLS=true.
 */
export async function GET() {
  if (!isN8nDevToolsEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const client = createN8nClientFromEnv();
    const credentials = await client.getCredentials();
    const baseHost = (() => {
      try {
        const u = new URL(process.env.N8N_BASE_URL ?? "");
        return u.host || "(invalid URL)";
      } catch {
        return "(unset)";
      }
    })();

    return NextResponse.json({
      ok: true,
      credentialCount: credentials.length,
      n8nHost: baseHost,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "n8n ping failed";
    return NextResponse.json({ ok: false, error: message }, { status: 200 });
  }
}
