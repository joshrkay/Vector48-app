"use server";

import { createServerClient } from "@/lib/supabase/server";

// Maps step index to the DB columns that step updates
const STEP_COLUMN_MAP: Record<number, string[]> = {
  0: [], // welcome
  1: ["business_name"],
  2: ["phone"],
  3: ["vertical"],
  4: ["business_hours"],
  5: ["voice_gender", "voice_greeting"],
  6: ["notification_contact", "notification_sms"],
  7: ["activate_recipe_1"],
};

// Maps camelCase form field names to snake_case DB columns
const FIELD_TO_COLUMN: Record<string, string> = {
  businessName: "business_name",
  vertical: "vertical",
  phone: "phone",
  businessHours: "business_hours",
  preset: "business_hours",
  voiceGender: "voice_gender",
  greetingText: "voice_greeting",
  notificationContact: "notification_contact",
  notificationContactPhone: "notification_contact",
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

    // Notifications step: enforce SMS opt-in on onboarding
    if (step === 6) {
      update.notification_sms = true;
      if (!update.notification_contact && data.notificationContactName) {
        update.notification_contact = data.notificationContactName;
      }
    }
  }

  const { error } = await supabase
    .from("accounts")
    .update(update)
    .eq("id", accountId);

  if (error) {
    return { error: error.message };
  }

  return { success: true };
}

export async function completeOnboarding(
  accountId: string,
  activateRecipe1: boolean,
) {
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  const { error: updateError } = await supabase
    .from("accounts")
    .update({
      onboarding_done_at: new Date().toISOString(),
      onboarding_step: 8,
      activate_recipe_1: activateRecipe1,
    })
    .eq("id", accountId);

  if (updateError) {
    return { error: updateError.message };
  }

  if (activateRecipe1) {
    const { error: recipeError } = await supabase.from("recipe_activations").insert({
      account_id: accountId,
      recipe_slug: "ai-phone-answering",
      status: "active",
    });

    if (recipeError) {
      return { error: recipeError.message };
    }
  }

  console.log("GHL provisioning job queued for", accountId);

  return { success: true };
}
