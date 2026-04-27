import { LAUNCH_ENABLED_AGENT_SDK_SLUGS } from "./launchEnabledAgentSdkSlugs";

export interface AgentSdkActivationBlockPolicy {
  status: 409;
  code: "RECIPE_NOT_LAUNCH_READY";
  message: string;
  action: string;
}

const BLOCKED_POLICIES: Partial<Record<string, AgentSdkActivationBlockPolicy>> = {
  "google-review-booster": {
    status: 409,
    code: "RECIPE_NOT_LAUNCH_READY",
    message:
      "Google Review Booster is not launch-ready in the Agent SDK runner yet.",
    action:
      "Activate Review Request instead for now, or contact support to join the beta.",
  },
  "new-lead-instant-response": {
    status: 409,
    code: "RECIPE_NOT_LAUNCH_READY",
    message:
      "New Lead Instant Response is not launch-ready in the Agent SDK runner yet.",
    action:
      "Use Missed Call Text-Back today, or contact support to request early access.",
  },
  "post-job-upsell": {
    status: 409,
    code: "RECIPE_NOT_LAUNCH_READY",
    message: "Post-Job Upsell is not launch-ready in the Agent SDK runner yet.",
    action:
      "Activate Estimate Follow-Up for now, or contact support to be notified when this launches.",
  },
  "tech-on-the-way": {
    status: 409,
    code: "RECIPE_NOT_LAUNCH_READY",
    message: "Tech On The Way is not launch-ready in the Agent SDK runner yet.",
    action:
      "Activate Appointment Reminder for now, or contact support for a launch timeline.",
  },
};

export const BLOCKED_AGENT_SDK_ACTIVATION_POLICIES = Object.fromEntries(
  Object.entries(BLOCKED_POLICIES).filter(([slug]) =>
    LAUNCH_ENABLED_AGENT_SDK_SLUGS.includes(slug),
  ),
) as Record<string, AgentSdkActivationBlockPolicy>;

export function getAgentSdkActivationBlockPolicy(
  slug: string,
): AgentSdkActivationBlockPolicy | null {
  return BLOCKED_AGENT_SDK_ACTIVATION_POLICIES[slug] ?? null;
}
