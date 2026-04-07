import "server-only";

const ELEVENLABS_API_URL = "https://api.elevenlabs.io/v1";

export interface TTSOptions {
  text: string;
  voiceId: string;
  modelId?: string;
}

/**
 * Synthesize speech using ElevenLabs TTS API.
 * Returns the raw audio buffer (mpeg) for streaming to the client.
 */
export async function synthesizeSpeech(options: TTSOptions): Promise<ArrayBuffer> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error("ELEVENLABS_API_KEY is not configured");
  }

  const { text, voiceId, modelId = "eleven_monolingual_v1" } = options;

  const response = await fetch(
    `${ELEVENLABS_API_URL}/text-to-speech/${encodeURIComponent(voiceId)}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: modelId,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    throw new Error(`ElevenLabs TTS failed (${response.status}): ${errorText}`);
  }

  return response.arrayBuffer();
}

/** Resolve a voice ID from gender preference, falling back to env default. */
export function resolveVoiceId(gender?: "male" | "female"): string {
  const defaultId = process.env.ELEVENLABS_DEFAULT_VOICE_ID;

  // ElevenLabs pre-made voice IDs
  const PREMADE_VOICES: Record<string, string> = {
    male: "TxGEqnHWrfWFTfGW9XjX",   // Josh
    female: "EXAVITQu4vr4xnSDxMaL",  // Bella
  };

  if (gender && PREMADE_VOICES[gender]) {
    return PREMADE_VOICES[gender];
  }

  return defaultId || PREMADE_VOICES.female;
}
