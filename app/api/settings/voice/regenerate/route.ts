import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { requireAccountForUser } from "@/lib/auth/account";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/** Minimal valid WAV (0.2s silence, 8kHz mono) — stub until ElevenLabs wiring. */
function stubWavBuffer(): Buffer {
  const sampleRate = 8000;
  const seconds = 0.2;
  const numSamples = Math.floor(sampleRate * seconds);
  const dataSize = numSamples * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);
  return buf;
}

export async function POST() {
  const supabase = await createServerClient();
  const session = await requireAccountForUser(supabase);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  const path = `${session.accountId}/greeting.wav`;
  const bytes = stubWavBuffer();

  const { error: uploadErr } = await admin.storage
    .from("voice-greetings")
    .upload(path, bytes, {
      contentType: "audio/wav",
      upsert: true,
    });

  if (uploadErr) {
    console.error("[voice/regenerate] upload", uploadErr.message);
    return NextResponse.json({ error: "Could not store greeting audio" }, { status: 500 });
  }

  const { data: pub } = admin.storage.from("voice-greetings").getPublicUrl(path);
  const publicUrl = pub.publicUrl;

  const { error: updateErr } = await admin
    .from("accounts")
    .update({ greeting_audio_url: publicUrl })
    .eq("id", session.accountId);

  if (updateErr) {
    console.error("[voice/regenerate] account update", updateErr.message);
    return NextResponse.json({ error: "Could not save audio URL" }, { status: 500 });
  }

  return NextResponse.json({ success: true, url: publicUrl, stub: true });
}
