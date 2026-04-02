import type { GHLMessage } from "@/lib/ghl/types";

function haystackFromMessage(msg: GHLMessage): string {
  const parts = [msg.source, JSON.stringify(msg.meta ?? {})].filter(Boolean);
  return parts.join(" ").toLowerCase();
}

/** Best-effort: GHL payload shapes vary; extend when API fields are confirmed. */
export function isMessageLikelyFromAiOrSystem(msg: GHLMessage): boolean {
  const h = haystackFromMessage(msg);
  if (
    h.includes("workflow") ||
    h.includes("automation") ||
    h.includes("bot") ||
    h.includes("system")
  ) {
    return true;
  }
  const userType =
    typeof msg.meta?.userType === "string" ? msg.meta.userType.toLowerCase() : "";
  if (userType === "system" || userType === "machine") return true;
  return false;
}
