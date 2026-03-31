// ---------------------------------------------------------------------------
// GoHighLevel Voice AI — Type Definitions
// These types cover the Voice AI agent creation and management endpoints.
//
// TODO: Verify all request/response shapes against the GHL Voice AI API docs.
// The Voice AI API is relatively new and may have undocumented fields.
// Types are kept extensible with optional fields for forward compatibility.
// ---------------------------------------------------------------------------

// ── Voice AI Agent ─────────────────────────────────────────────────────────

export interface GHLCreateVoiceAgentPayload {
  /** GHL location (sub-account) this agent belongs to */
  locationId: string;
  /** Display name for the agent, e.g. "Acme HVAC AI Assistant" */
  name: string;
  /** Business name for context */
  businessName: string;
  /** Initial greeting message when the agent answers */
  greeting: string;
  /** System prompt / instructions for the AI agent */
  prompt: string;
  /** Voice selection — maps to GHL's voice options */
  voiceId?: string;
  /** Voice gender preference (used if voiceId not specified) */
  gender?: "male" | "female";
  /** Language code, defaults to "en-US" */
  language?: string;
  /** IANA timezone, e.g. "America/Phoenix" */
  timezone?: string;
  /** Phone number to forward live transfers to */
  forwardingNumber?: string;
  /** Data collection goals for the agent */
  goals?: GHLVoiceAgentGoal[];
  /** Additional configuration */
  [key: string]: unknown;
}

export interface GHLVoiceAgentGoal {
  /** Field name to collect, e.g. "caller_name", "phone_number", "reason" */
  field: string;
  /** Human-readable label */
  label: string;
  /** Whether this field is required before ending the call */
  required: boolean;
}

export interface GHLVoiceAgent {
  id: string;
  locationId: string;
  name: string;
  status: string;
  greeting: string;
  voiceId?: string;
  gender?: "male" | "female";
  timezone?: string;
  goals?: GHLVoiceAgentGoal[];
  createdAt?: string;
  updatedAt?: string;
  /** Extensible for undocumented fields */
  [key: string]: unknown;
}

export interface GHLVoiceAgentResponse {
  agent: GHLVoiceAgent;
}

// ── Voice AI Agent Actions ─────────────────────────────────────────────────

export interface GHLCreateAgentActionPayload {
  /** Action type — "webhook" fires a POST to the configured URL after each call */
  type: "webhook";
  /** The webhook URL to fire to (e.g. n8n endpoint) */
  url: string;
  /** HTTP method, defaults to POST */
  method?: "POST" | "GET";
  /** Optional headers to include */
  headers?: Record<string, string>;
  /** Description of what this action does */
  description?: string;
  /** Extensible */
  [key: string]: unknown;
}

export interface GHLAgentAction {
  id: string;
  agentId: string;
  type: string;
  url: string;
  method?: string;
  createdAt?: string;
  [key: string]: unknown;
}

export interface GHLAgentActionResponse {
  action: GHLAgentAction;
}

// ── Voice ID Mapping ───────────────────────────────────────────────────────

/**
 * Default GHL voice options by gender.
 * TODO: Verify these voice IDs against GHL's Voice AI voice catalog.
 * These are best-guess defaults — update once confirmed.
 */
export const GHL_DEFAULT_VOICES: Record<"male" | "female", string> = {
  male: "en-US-male-1",
  female: "en-US-female-1",
};
