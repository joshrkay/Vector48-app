import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Voice transcription is not configured." },
      { status: 503 },
    );
  }

  const formData = await request.formData().catch(() => null);
  const audio = formData?.get("audio");

  if (!(audio instanceof Blob)) {
    return NextResponse.json({ error: "audio file is required" }, { status: 400 });
  }

  if (audio.size === 0) {
    return NextResponse.json({ error: "audio file is empty" }, { status: 400 });
  }

  const upstreamForm = new FormData();
  upstreamForm.set("model", "whisper-1");
  upstreamForm.set("response_format", "json");
  upstreamForm.set("file", audio, "voice.webm");

  const upstreamResponse = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: upstreamForm,
  }).catch(() => null);

  if (!upstreamResponse) {
    return NextResponse.json(
      { error: "Could not reach transcription service." },
      { status: 502 },
    );
  }

  const payload = (await upstreamResponse.json().catch(() => null)) as
    | { text?: string; error?: { message?: string } }
    | null;

  if (!upstreamResponse.ok) {
    return NextResponse.json(
      {
        error:
          payload?.error?.message ??
          "Transcription request failed.",
      },
      { status: 502 },
    );
  }

  const transcript = payload?.text?.trim() ?? "";
  if (!transcript) {
    return NextResponse.json(
      { error: "No speech detected." },
      { status: 422 },
    );
  }

  return NextResponse.json({ transcript });
}

