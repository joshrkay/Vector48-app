"use server";

import { createServerClient } from "@/lib/supabase/server";
import { track } from "@/lib/analytics/posthog";

// Maps step index to the DB columns that step updates
// Step 0: WelcomeStep      — no data
// Step 1: BusinessNameStep — business_name
// Step 2: PhoneStep        — phone
// Step 3: VerticalStep     — vertical
// Step 4: BusinessHoursStep— business_hours
// Step 5: VoiceAIStep      — voice_gender, greeting_text
// Step 6: NotificationsStep— notification_contact_name, notification_contact_phone
// Step 7: ActivateRecipeStep — handled in completeOnboarding
const STEP_COLUMN_MAP: Record<number, string[]> = {
  0: [],
  1: ["business_name"],
  2: ["phone"],
  3: ["vertical"],
  4: ["business_hours"],
  5: ["voice_gender", "greeting_text"],
  6: ["notification_contact_name", "notification_contact_phone"],
  7: [],
};

// Maps camelCase form field names to snake_case DB columns
const FIELD_TO_COLUMN: Record<string, string> = {
  businessName: "business_name",
  vertical: "vertical",
  phone: "phone",
  businessHours: "business_hours",
  preset: "business_hours",
  voiceGender: "voice_gender",
  greetingText: "greeting_text",
  notificationContact: "notification_contact_name",
  notificationContactPhone: "notification_contact_phone",
  activateRecipe1: "activate_recipe_1",
};

export async function saveOnboardingStep(
  accountId: string,
  step: number,
  data: Record<string, unknown>
) {
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  // Verify user owns account
  const { data: membership } = await supabase
    .from("account_users")
    .select("account_id")
    .eq("account_id", accountId)
    .eq("user_id", user.id)
    .single();

  if (!membership) {
    return { error: "Unauthorized" };
  }

  // Build the update payload by mapping form fields to DB columns
  const update: Record<string, unknown> = {
    onboarding_step: step + 1,
  };

  // Special handling for business hours step — merge preset into jsonb
  if (step === 4) {
    update.business_hours = {
      preset: data.preset,
      ...(data.customHours ? { customHours: data.customHours } : {}),
    };
  } else {
    for (const [key, value] of Object.entries(data)) {
      const column = FIELD_TO_COLUMN[key];
      if (column && STEP_COLUMN_MAP[step]?.includes(column)) {
        update[column] = value;
      }
    }
  }

  const { error } = await supabase
    .from("accounts")
    .update(update)
    .eq("id", accountId);

  if (error) {
    console.error("[onboarding] failed to persist step", error.message);
    return { error: error.message };
  }

  track(accountId, "onboarding_step_completed", {
    step,
    vertical: typeof data.vertical === "string" ? data.vertical : null,
  });

  return { success: true };
}

export async function completeOnboarding(
  accountId: string,
  activateRecipe: boolean,
  voiceConfig?: { voiceGender: string; voiceGreeting: string }
) {
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  const completedAt = new Date().toISOString();

  const { error: updateError } = await supabase
    .from("accounts")
    .update({
      onboarding_completed_at: new Date().toISOString(),
      onboarding_step: 8,
      activate_recipe_1: activateRecipe,
      onboarding_completed_at: completedAt,
      ghl_provisioning_status: "pending",
      ghl_provisioning_error: null,
    })
    .eq("id", accountId);

  if (updateError) {
    return { error: updateError.message };
  }

  // Optionally create Recipe 1 activation row (before background provisioning)
  if (activateRecipe) {
    const config = voiceConfig
      ? {
          voice_gender: voiceConfig.voiceGender,
          greeting_text: voiceConfig.voiceGreeting,
        }
      : null;

    const { data: activation, error: recipeError } = await supabase
      .from("recipe_activations")
      .insert({
        account_id: accountId,
        recipe_slug: "ai-phone-answering",
        status: "active",
        config,
      })
      .select("id")
      .single();

    if (recipeError || !activation) {
      return { error: recipeError?.message ?? "Failed to create activation" };
    }
  }

  console.log("GHL provisioning job queued for", accountId);

  track(accountId, "onboarding_completed", {
    activated_recipe: activateRecipe,
  });

  return { success: true };
}
