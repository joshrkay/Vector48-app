import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "stub",
    message: "Voice preview coming soon",
  });
}
