// ---------------------------------------------------------------------------
// GoHighLevel Voice AI — sync greeting + voice selection to the location agent.
// Server-only.
// ---------------------------------------------------------------------------
import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getAccountGhlCredentials, getGHLClient } from "./token";

export interface SyncVoiceAgentInput {
  /** Full line spoken when the AI answers (include business name + greeting). */
  greetingMessage: string;
  voiceGender: "male" | "female";
}

/**
 * PATCHes the first Voice AI agent for the location (or agent id stored on account).
 * Optional env: GHL_VOICE_AI_MALE_VOICE_ID, GHL_VOICE_AI_FEMALE_VOICE_ID for voiceId.
 */
export async function updateVoiceAgent(
  accountId: string,
  input: SyncVoiceAgentInput,
): Promise<{ ok: true; agentId: string } | { ok: false; error: string }> {
  try {
    const { locationId } = await getAccountGhlCredentials(accountId);
    const client = await getGHLClient(accountId);

    const supabase = getSupabaseAdmin();
    const { data: account } = await supabase
      .from("accounts")
      .select("ghl_voice_agent_id")
      .eq("id", accountId)
      .single();

    let agentId = account?.ghl_voice_agent_id ?? null;

    if (!agentId) {
      const listRes = await client.voiceAi.listAgents({ locationId });
      const items = listRes.agents ?? listRes.data ?? [];
      agentId = items[0]?.id ?? null;
    }

    if (!agentId) {
      return { ok: false, error: "No Voice AI agent found for this location" };
    }

    const maleVoiceId = process.env.GHL_VOICE_AI_MALE_VOICE_ID;
    const femaleVoiceId = process.env.GHL_VOICE_AI_FEMALE_VOICE_ID;

    const patchBody: Record<string, unknown> = {
      greetingMessage: input.greetingMessage,
    };

    if (input.voiceGender === "male" && maleVoiceId) {
      patchBody.voiceId = maleVoiceId;
    }
    if (input.voiceGender === "female" && femaleVoiceId) {
      patchBody.voiceId = femaleVoiceId;
    }

    await client.voiceAi.patchAgent(agentId, patchBody);

    await supabase
      .from("accounts")
      .update({ ghl_voice_agent_id: agentId, ghl_last_synced_at: new Date().toISOString() })
      .eq("id", accountId);

    return { ok: true, agentId };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Voice AI sync failed";
    return { ok: false, error: message };
  }
}
