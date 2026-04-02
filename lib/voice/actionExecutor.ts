"use client";

import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { VoiceAction, VoiceMutationAction } from "@/lib/voice/types";

export interface VoiceToastPayload {
  message: string;
  openRoute?: string;
}

interface MutationRequest {
  endpoint: string;
  method: "POST" | "PATCH" | "PUT";
  body: Record<string, unknown>;
}

export interface VoiceExecutionDeps {
  router: Pick<AppRouterInstance, "push">;
  showToast: (payload: VoiceToastPayload) => void;
  requestConfirmation: (
    action: VoiceMutationAction,
  ) => Promise<boolean>;
}

function buildRoute(
  route: string,
  params: Record<string, string | number | boolean> | undefined,
) {
  if (!params || Object.keys(params).length === 0) {
    return route;
  }
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    query.set(key, String(value));
  }
  const suffix = query.toString();
  return suffix ? `${route}?${suffix}` : route;
}

function toMutationRequest(action: VoiceMutationAction): MutationRequest {
  switch (action.action) {
    case "recipe.activate":
      return {
        endpoint: "/api/recipes/activate",
        method: "POST",
        body: { recipeSlug: action.params.recipeSlug },
      };
    case "recipe.deactivate":
      return {
        endpoint: "/api/recipes/deactivate",
        method: "POST",
        body: { recipeSlug: action.params.recipeSlug },
      };
    case "crm.contact.create":
      return {
        endpoint: "/api/ghl/contacts",
        method: "POST",
        body: action.params,
      };
    case "crm.contact.update":
      return {
        endpoint: `/api/ghl/contacts/${encodeURIComponent(action.params.contactId)}`,
        method: "PUT",
        body: action.params.patch,
      };
    case "crm.contact.add_note":
      return {
        endpoint: `/api/ghl/contacts/${encodeURIComponent(action.params.contactId)}/notes`,
        method: "POST",
        body: { body: action.params.body },
      };
    case "crm.conversation.send_message":
      return {
        endpoint: `/api/ghl/conversations/${encodeURIComponent(action.params.conversationId)}/send`,
        method: "POST",
        body: {
          type: action.params.type ?? "TYPE_SMS",
          message: action.params.message,
          contactId: action.params.contactId,
        },
      };
    case "crm.opportunity.create":
      return {
        endpoint: "/api/ghl/opportunities",
        method: "POST",
        body: action.params,
      };
    case "crm.opportunity.update":
      return {
        endpoint: `/api/ghl/opportunities/${encodeURIComponent(action.params.opportunityId)}`,
        method: "PATCH",
        body: action.params.patch,
      };
    case "crm.opportunity.update_stage":
      return {
        endpoint: `/api/ghl/opportunities/${encodeURIComponent(action.params.opportunityId)}/stage`,
        method: "PATCH",
        body: { pipelineStageId: action.params.pipelineStageId },
      };
    case "crm.opportunity.update_status":
      return {
        endpoint: `/api/ghl/opportunities/${encodeURIComponent(action.params.opportunityId)}/status`,
        method: "PATCH",
        body: { status: action.params.status },
      };
    case "crm.appointment.create":
      return {
        endpoint: "/api/ghl/appointments",
        method: "POST",
        body: action.params,
      };
    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

async function executeMutation(action: VoiceMutationAction) {
  const request = toMutationRequest(action);
  const response = await fetch(request.endpoint, {
    method: request.method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request.body),
  });

  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
  };

  if (!response.ok) {
    throw new Error(payload.error ?? "Voice action failed");
  }
}

export async function executeVoiceAction(
  action: VoiceAction,
  deps: VoiceExecutionDeps,
) {
  if (action.type === "navigate") {
    deps.router.push(buildRoute(action.route, action.params));
    if (action.message) {
      deps.showToast({ message: action.message });
    }
    return;
  }

  if (action.type === "answer" || action.type === "clarify") {
    deps.showToast({
      message: action.message,
      openRoute: action.openRoute,
    });
    return;
  }

  const confirmed = await deps.requestConfirmation(action);
  if (!confirmed) {
    deps.showToast({ message: "Cancelled." });
    return;
  }

  try {
    await executeMutation(action);
    deps.showToast({ message: "Done." });
  } catch (error) {
    deps.showToast({
      message:
        error instanceof Error
          ? error.message
          : "Voice action failed.",
    });
  }
}

