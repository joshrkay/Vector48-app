/**
 * Derive UI status for automation_events rows (no status column in DB).
 */
export function getActivityStatus(
  eventType: string,
  detail: Record<string, unknown>,
): "success" | "failed" {
  const outcome = detail.outcome;
  const status = detail.status;
  if (typeof outcome === "string" && outcome.toLowerCase() === "failed") {
    return "failed";
  }
  if (typeof status === "string" && status.toLowerCase() === "failed") {
    return "failed";
  }
  if (detail.error != null) {
    return "failed";
  }
  if (/failed|error|alert/i.test(eventType)) {
    return "failed";
  }
  return "success";
}
