export type GhlUiStatus = "connected" | "failed" | "pending";

export interface IntegrationStatusPayload {
  ghl: {
    status: GhlUiStatus;
    maskedLocationId: string | null;
    lastSyncedAt: string | null;
  };
  voiceAgent: {
    show: boolean;
    status: "active" | "not_configured";
    maskedAgentId: string | null;
    voiceGender: "male" | "female" | null;
    testCallTel: string | null;
  };
  n8n: {
    connected: boolean;
    webhookBaseUrl: string | null;
    recipeExecutionCount: number;
  };
}
