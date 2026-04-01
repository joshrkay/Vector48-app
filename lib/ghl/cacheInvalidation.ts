import { revalidateTag } from "next/cache";

const EVENT_TAG_MAP: Record<string, string[]> = {
  ContactCreate: ["contacts"],
  ContactUpdate: ["contacts"],
  OpportunityCreate: ["opportunities"],
  OpportunityStageUpdate: ["opportunities"],
  AppointmentCreate: ["appointments"],
  AppointmentStatusUpdate: ["appointments"],
  ConversationUnreadUpdate: ["conversations"],
  InboundMessage: ["conversations"],
};

export function invalidateGHLCache(accountId: string, ghlEventType: string): void {
  const resources = EVENT_TAG_MAP[ghlEventType] ?? [];

  for (const resource of resources) {
    revalidateTag(`ghl:${accountId}:${resource}`);
  }
}
