// ---------------------------------------------------------------------------
// Archetype: Appointment Reminder
//
// Sent N hours before a scheduled appointment. Confirms the time, gives
// the customer an easy way to reschedule, and surfaces any prep notes.
//
// Ported from lib/n8n/templates/appointment-reminder.json.
// ---------------------------------------------------------------------------

import type { RecipeArchetype } from "../archetypes";

export const appointmentReminderArchetype: RecipeArchetype = {
  slug: "appointment-reminder",
  displayName: "Appointment Reminder",
  systemPrompt:
    "You write friendly appointment-reminder SMS messages for {{business_name}}, " +
    "a {{vertical}} company. Constraints: " +
    "(1) under 300 characters, " +
    "(2) state the appointment time and address slot supplied by the runner, " +
    "(3) include 'reply Y to confirm or call us to reschedule', " +
    "(4) no emojis, " +
    "(5) return ONLY the SMS body.",
  model: "claude-haiku-4-5",
  maxTokens: 200,
  temperature: 0.4,
  toolConfig: {
    enabledTools: [],
  },
  monthlySpendCapMicros: 3_000_000,
  rateLimitPerHour: 120,
};
