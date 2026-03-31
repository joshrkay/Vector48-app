import { z } from "zod";

const MAX_TRANSCRIPT_LEN = 8000;
const MAX_ROUTE_LEN = 500;

export const voiceQueryBodySchema = z.object({
  transcript: z
    .string()
    .trim()
    .min(1, "transcript is required")
    .max(MAX_TRANSCRIPT_LEN),
  currentRoute: z
    .string()
    .max(MAX_ROUTE_LEN)
    .default("/")
    .transform((s) => {
      const t = s.trim();
      return t.length === 0 ? "/" : t;
    }),
});

export type VoiceQueryBody = z.infer<typeof voiceQueryBodySchema>;
