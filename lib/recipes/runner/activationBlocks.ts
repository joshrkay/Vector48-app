import { LAUNCH_ENABLED_AGENT_SDK_SLUGS } from "./launchEnabledAgentSdkSlugs";

export interface AgentSdkActivationBlockPolicy {
  status: 409;
  code: "RECIPE_NOT_LAUNCH_READY";
  message: string;
  action: string;
}

// Keep this map explicit. Add entries only when a launch-enabled Agent SDK
// slug intentionally ships without an archetype and should be blocked.
const BLOCKED_POLICIES: Partial<Record<string, AgentSdkActivationBlockPolicy>> = {};

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
