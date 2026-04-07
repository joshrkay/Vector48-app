import { type NextRequest, NextResponse } from "next/server";
import { synthesizeSpeech, resolveVoiceId } from "@/lib/elevenlabs/tts";

export async function POST(request: NextRequest) {
  let body: { text?: string; voiceGender?: "male" | "female" };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const text = body.text?.trim();
  if (!text || text.length > 500) {
    return NextResponse.json(
      { error: "Text is required and must be under 500 characters" },
      { status: 400 },
    );
  }

  const voiceId = resolveVoiceId(body.voiceGender);

  try {
    const audio = await synthesizeSpeech({ text, voiceId });
    return new Response(audio, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    console.error("[voice-preview]", error);
    const message = error instanceof Error ? error.message : "TTS failed";

    if (message.includes("not configured")) {
      return NextResponse.json({ error: message }, { status: 503 });
    }

    return NextResponse.json({ error: "Failed to generate voice preview" }, { status: 502 });
  }
}

/** Keep the GET stub for backwards compatibility. */
export async function GET() {
  return NextResponse.json({
    status: "available",
    message: "POST with { text, voiceGender } to generate a preview",
  });
}
