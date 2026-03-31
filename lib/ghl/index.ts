// ---------------------------------------------------------------------------
// GoHighLevel API v2 — Barrel Export
// ---------------------------------------------------------------------------

// Client
export { GHLClient } from "./client";

// Token & factory
export { getGHLClient } from "./token";

export { updateVoiceAgent, buildVoiceGreetingLine } from "./voiceAgent";

// Errors
export {
  GHLApiError,
  GHLRateLimitError,
  GHLAuthError,
  GHLNotFoundError,
  GHLValidationError,
  GHLServerError,
} from "./errors";

// Types
export * from "./types";
