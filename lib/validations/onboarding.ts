import { z } from "zod";

export const businessNameSchema = z.object({
  businessName: z.string().min(1, "Business name is required").max(100),
});

export const verticalSchema = z.object({
  vertical: z.enum(["hvac", "plumbing", "electrical", "roofing", "landscaping"], {
    required_error: "Select your industry",
  }),
});

export const phoneSchema = z.object({
  phone: z.string().min(10, "Enter a valid phone number"),
});

export const businessHoursSchema = z.object({
  preset: z.enum(["weekday_8_5", "weekday_7_6", "all_week", "custom"]),
  customHours: z
    .record(
      z.object({
        open: z.string(),
        close: z.string(),
        closed: z.boolean(),
      })
    )
    .optional(),
});

export const voiceAISchema = z.object({
  voiceGender: z.enum(["male", "female"]),
  greetingText: z.string().min(1, "Enter a greeting for callers").max(500),
});

export const notificationsSchema = z.object({
  notificationContactName: z.string().optional(),
  notificationContactPhone: z.string().min(1, "Enter a phone number for notifications"),
});

export const activateRecipeSchema = z.object({
  activateRecipe1: z.boolean(),
});

export type BusinessNameData = z.infer<typeof businessNameSchema>;
export type VerticalData = z.infer<typeof verticalSchema>;
export type PhoneData = z.infer<typeof phoneSchema>;
export type BusinessHoursData = z.infer<typeof businessHoursSchema>;
export type VoiceAIData = z.infer<typeof voiceAISchema>;
export type NotificationsData = z.infer<typeof notificationsSchema>;
export type ActivateRecipeData = z.infer<typeof activateRecipeSchema>;
