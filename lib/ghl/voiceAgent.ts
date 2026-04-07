import "server-only";

import type {
  GHLCreateVoiceAgentPayload,
  GHLVoiceAgentGoal,
} from "./voiceTypes";

const DEFAULT_GOALS: GHLVoiceAgentGoal[] = [
  { field: "caller_name", label: "Caller Name", required: true },
  { field: "phone_number", label: "Phone Number", required: true },
  { field: "reason", label: "Reason for Calling", required: true },
];

interface BuildVoiceAgentPayloadOptions {
  locationId: string;
  businessName: string;
  vertical?: string | null;
  greeting?: string;
  voiceGender?: "male" | "female";
  forwardingNumber?: string;
  timezone?: string;
}

function defaultGreeting(businessName: string, vertical?: string | null): string {
  const verticalLabels: Record<string, string> = {
    hvac: "heating or cooling",
    plumbing: "plumbing",
    electrical: "electrical",
    roofing: "roofing",
    landscaping: "landscaping",
  };

  const service = vertical && verticalLabels[vertical]
    ? verticalLabels[vertical]
    : "service";

  return `Hi, thanks for calling ${businessName}! I'm the AI assistant. I can help you schedule a ${service} appointment. What can I help you with today?`;
}

function defaultPrompt(businessName: string, vertical?: string | null): string {
  return [
    `You are an AI phone assistant for ${businessName}.`,
    "Your job is to answer incoming calls, collect the caller's name, phone number, and reason for calling.",
    "Be friendly, professional, and concise.",
    vertical
      ? `This business specializes in ${vertical} services.`
      : "",
    "If the caller has an emergency, let them know someone will call back as soon as possible.",
    "If asked about pricing, let them know a team member will follow up with a quote.",
    "Always confirm the information you collected before ending the call.",
  ]
    .filter(Boolean)
    .join(" ");
}

export function buildVoiceAgentPayload(
  options: BuildVoiceAgentPayloadOptions,
): GHLCreateVoiceAgentPayload {
  const {
    locationId,
    businessName,
    vertical,
    greeting,
    voiceGender = "female",
    forwardingNumber,
    timezone,
  } = options;

  return {
    locationId,
    name: `${businessName} AI Assistant`,
    businessName,
    greeting: greeting ?? defaultGreeting(businessName, vertical),
    prompt: defaultPrompt(businessName, vertical),
    gender: voiceGender,
    language: "en-US",
    ...(timezone ? { timezone } : {}),
    ...(forwardingNumber ? { forwardingNumber } : {}),
    goals: DEFAULT_GOALS,
  };
}
