import { z } from "zod";
import { businessHoursSchema } from "@/lib/validations/onboarding";

export const profilePatchSchema = z.object({
  business_name: z.string().min(1).max(200).optional(),
  phone: z.string().max(40).nullable().optional(),
  email: z.string().email().max(200).nullable().optional(),
  address_city: z.string().max(100).nullable().optional(),
  address_state: z.string().max(100).nullable().optional(),
  address_zip: z.string().max(20).nullable().optional(),
  business_hours: businessHoursSchema.nullable().optional(),
  voice_gender: z.enum(["male", "female"]).nullable().optional(),
  greeting_text: z.string().max(500).nullable().optional(),
});

export const notificationPreferencesSchema = z.object({
  sms: z.boolean().optional(),
  email: z.boolean().optional(),
  alerts: z
    .object({
      new_lead: z.boolean().optional(),
      missed_call: z.boolean().optional(),
      negative_sentiment: z.boolean().optional(),
      appointment_cancel: z.boolean().optional(),
      recipe_error: z.boolean().optional(),
    })
    .optional(),
});

export const notificationsPatchSchema = z.object({
  notification_contact_name: z.string().max(200).nullable().optional(),
  notification_contact_phone: z.string().max(200).nullable().optional(),
  notification_preferences: notificationPreferencesSchema.optional(),
});

export const deleteAccountSchema = z.object({
  confirmation: z.literal("DELETE"),
});

export const servicetitanSaveSchema = z.object({
  api_key: z.string().min(1),
  tenant_id: z.string().min(1),
});

export const disconnectIntegrationSchema = z.object({
  provider: z.enum(["jobber", "servicetitan", "google_business"]),
});

export const voiceRegenerateSchema = z.object({
  greeting_text: z.string().min(1).max(500).optional(),
});
