"use server";

import { provisionRecipe } from "@/lib/n8n/provision";
import { createServerClient } from "@/lib/supabase/server";

// Maps step index to the DB columns that step updates
const STEP_COLUMN_MAP: Record<number, string[]> = {
  0: ["business_name"],
  1: ["vertical"],
  2: ["phone"],
  3: ["business_hours"],
  4: ["voice_gender", "greeting_text"],
  5: ["notification_contact_name", "notification_contact_phone"],
  6: [], // activate recipe — handled separately
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
  notificationContactName: "notification_contact_name",
  notificationContactPhone: "notification_contact_phone",
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
  if (step === 3) {
    update.business_hours = {
      preset: data.preset,
      ...(data.customHours ? { customHours: data.customHours } : {}),
    };
  } else {
    for (const [key, value] of Object.entries(data)) {
      const column = FIELD_TO_COLUMN[key];
      if (column) {
        update[column] = value;
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
  activateRecipe: boolean,
  voiceConfig?: { voiceGender: string; greetingText: string }
) {
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  // Set onboarding as complete
  const { error: updateError } = await supabase
    .from("accounts")
    .update({
      onboarding_completed_at: new Date().toISOString(),
      onboarding_step: 7,
    })
    .eq("id", accountId);

  if (updateError) {
    return { error: updateError.message };
  }

  // Activate Recipe 1 if requested
  if (activateRecipe) {
    const config = voiceConfig
      ? {
          voice_gender: voiceConfig.voiceGender,
          greeting_text: voiceConfig.greetingText,
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

    try {
      await provisionRecipe(
        accountId,
        "ai-phone-answering",
        config,
        activation.id,
      );
    } catch {
      return {
        error:
          "Recipe activation was saved but N8N provisioning failed. Check error_message on the activation or retry later.",
      };
    }
  }

  return { success: true };
}
