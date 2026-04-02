"use server";

import { createServerClient } from "@/lib/supabase/server";

// Maps step index to the DB columns that step updates
const STEP_COLUMN_MAP: Record<number, string[]> = {
  0: ["business_name"],
  1: ["phone"],
  2: ["vertical"],
  3: ["business_hours"],
  4: ["voice_gender", "voice_greeting"],
  5: ["notification_contact", "notification_sms"],
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
  greetingText: "voice_greeting",
  notificationContact: "notification_contact",
  notificationContactPhone: "notification_contact",
  activateRecipe1: "activate_recipe_1",
};


function getErrorMessage(error: unknown): string | undefined {
  if (!error || typeof error !== "object" || !("message" in error)) {
    return undefined;
  }

  const maybeMessage = (error as { message?: unknown }).message;
  return typeof maybeMessage === "string" ? maybeMessage : undefined;
}

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
    return { error: getErrorMessage(error) ?? "Failed to save onboarding step" };
  }

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

  const { error: updateError } = await supabase
    .from("accounts")
    .update({
      onboarding_step: 8,
      activate_recipe_1: activateRecipe,
      onboarding_completed_at: null,
      onboarding_done_at: null,
      ghl_provisioning_status: "pending",
      ghl_provisioning_error: null,
      provisioning_status: "pending",
      provisioning_error: null,
    })
    .eq("id", accountId);

  if (updateError) {
    return { error: getErrorMessage(updateError) ?? "Failed to complete onboarding" };
  }

  // Optionally create Recipe 1 activation row (before background provisioning)
  if (activateRecipe) {
    const config = voiceConfig
      ? {
          voice_gender: voiceConfig.voiceGender,
          voice_greeting: voiceConfig.voiceGreeting,
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
      return { error: getErrorMessage(recipeError) ?? "Failed to create activation" };
    }
  }

  // Dispatch background provisioning via Inngest.
  // GHL sub-account creation + Voice AI setup + n8n recipe activation
  // all run asynchronously. The user is redirected to the dashboard
  // immediately while provisioning runs in the background.
  //
  // Dashboard contract: show "Setting up your AI..." when
  // provisioning_status = 'in_progress', full dashboard when 'complete'.
  try {
    await inngest.send({
      name: "app/customer.onboarding.completed",
      data: {
        accountId,
        activateRecipe,
        voiceConfig,
        activationId,
      },
    });
  } catch (err) {
    // Inngest dispatch failure is non-fatal — provisioning can be retried
    // via the reconciliation cron job.
    console.error(
      "[onboarding] Failed to dispatch provisioning event:",
      getErrorMessage(err) ?? err,
    );
  }

  return { success: true };
}
