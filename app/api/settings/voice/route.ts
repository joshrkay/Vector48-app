import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { requireAccountForUser } from "@/lib/auth/account";
import { voicePatchSchema } from "@/lib/validations/settings";
import {
  buildVoiceGreetingLine,
  updateVoiceAgent,
} from "@/lib/ghl/voiceAgent";

export async function PATCH(req: Request) {
  const supabase = await createServerClient();
  const session = await requireAccountForUser(supabase);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = voicePatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const patch = parsed.data;

  const { data: before } = await supabase
    .from("accounts")
    .select("business_name, ghl_location_id, ghl_token_encrypted")
    .eq("id", session.accountId)
    .single();

  const { error } = await supabase
    .from("accounts")
    .update({
      voice_gender: patch.voice_gender,
      greeting_text: patch.greeting_text,
      timezone: patch.timezone,
    })
    .eq("id", session.accountId);

  if (error) {
    console.error("[settings/voice]", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const warnings: string[] = [];

  if (before?.ghl_location_id && before?.ghl_token_encrypted) {
    const businessName = before.business_name?.trim() || "your business";
    const greetingMessage = buildVoiceGreetingLine(
      businessName,
      patch.greeting_text,
    );

    const ghl = await updateVoiceAgent(session.accountId, {
      greetingMessage,
      voiceGender: patch.voice_gender,
    });

    if (!ghl.ok) {
      console.warn("[settings/voice] ghl_voice_sync", ghl.error);
      warnings.push("ghl_voice_agent");
    }
  }

  return NextResponse.json({
    success: true,
    warnings: warnings.length ? warnings : undefined,
  });
}
