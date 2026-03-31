import "server-only";

/** n8n credential names — namespaced by account id for soft multi-tenancy on one instance */
export function n8nCredentialNameGhl(accountId: string): string {
  return `ghl_${accountId}`;
}

export function n8nCredentialNameElevenlabs(accountId: string): string {
  return `elevenlabs_${accountId}`;
}

export function n8nCredentialNameTwilio(accountId: string): string {
  return `twilio_${accountId}`;
}

/** n8n `type` for HTTP header auth (Private Integration Token style) */
export function buildGhlHttpHeaderCredentialData(token: string): {
  type: string;
  data: Record<string, unknown>;
} {
  return {
    type: "httpHeaderAuth",
    data: {
      name: "Authorization",
      value: `Bearer ${token}`,
    },
  };
}

export function buildElevenLabsCredentialData(apiKey: string): {
  type: string;
  data: Record<string, unknown>;
} {
  return {
    type: "elevenLabsApi",
    data: {
      apiKey,
    },
  };
}

export function buildTwilioCredentialData(
  accountSid: string,
  authToken: string,
): {
  type: string;
  data: Record<string, unknown>;
} {
  return {
    type: "twilioApi",
    data: {
      accountSid,
      authToken,
    },
  };
}
