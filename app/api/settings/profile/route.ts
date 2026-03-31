import { NextResponse } from "next/server";

/** @deprecated Use PATCH /api/settings/business and /api/settings/voice */
export async function PATCH() {
  return NextResponse.json(
    {
      error:
        "This endpoint is deprecated. Use /api/settings/business or /api/settings/voice.",
    },
    { status: 410 },
  );
}
