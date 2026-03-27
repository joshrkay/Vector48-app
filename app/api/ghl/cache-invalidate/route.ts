// ---------------------------------------------------------------------------
// POST /api/ghl/cache-invalidate
// Called by the Supabase Edge Function (ghl-webhook) to bust the in-memory
// GHL cache when a webhook event arrives.
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { invalidateGHLCache } from "@/lib/ghl/cacheInvalidation";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { accountId, eventType, secret } = body as {
      accountId?: string;
      eventType?: string;
      secret?: string;
    };

    // Validate shared secret
    const expectedSecret = process.env.GHL_CACHE_INVALIDATE_SECRET;
    if (!expectedSecret || secret !== expectedSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!accountId || !eventType) {
      return NextResponse.json(
        { error: "Missing accountId or eventType" },
        { status: 400 },
      );
    }

    const deleted = invalidateGHLCache(accountId, eventType);

    return NextResponse.json({ ok: true, deleted });
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }
}
