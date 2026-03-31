// ---------------------------------------------------------------------------
// Gate for the in-app launch checklist (enable in production only when intentional).
// ---------------------------------------------------------------------------
import "server-only";

export function isLaunchChecklistEnabled(): boolean {
  if (process.env.NODE_ENV === "development") {
    return true;
  }
  return process.env.ENABLE_LAUNCH_CHECKLIST_DEV === "true";
}
