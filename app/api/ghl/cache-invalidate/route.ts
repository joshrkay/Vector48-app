// ---------------------------------------------------------------------------
// POST /api/ghl/cache-invalidate
// Called by the Supabase Edge Function (ghl-webhook) to bust the in-memory
// GHL cache when a webhook event arrives.
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { invalidateGHLCache } from "@/lib/ghl/cacheInvalidation";

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export async function POST(request: Request) {
  try {
    // Validate shared secret from header
    const expectedSecret = process.env.GHL_CACHE_INVALIDATE_SECRET;
    const providedSecret = request.headers.get("x-cache-invalidate-secret");

    if (!expectedSecret || !providedSecret || !safeEqual(providedSecret, expectedSecret)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { accountId, eventType } = body as {
      accountId?: string;
      eventType?: string;
    };

    if (!accountId || !eventType) {
      return NextResponse.json(
        { error: "Missing accountId or eventType" },
        { status: 400 },
      );
    }

    invalidateGHLCache(accountId, eventType);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }
}
