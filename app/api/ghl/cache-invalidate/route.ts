// ---------------------------------------------------------------------------
// POST /api/ghl/cache-invalidate
// DEPRECATED: Webhook-driven invalidation now runs directly from
// /api/webhooks/ghl after insert success.
// This endpoint is retained for backward compatibility only.
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

    // Shared helper performs tag revalidation and optional in-memory fallback.
    invalidateGHLCache(accountId, eventType, { invalidateInMemoryFallback: true });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }
}
