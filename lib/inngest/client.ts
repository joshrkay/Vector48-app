import { Inngest } from "inngest";

const inngestEventKey = process.env.INNGEST_EVENT_KEY;
const isServerRuntime =
  process.env.NEXT_RUNTIME === "nodejs" || process.env.NEXT_RUNTIME === "edge";
const isNextBuildPhase = process.env.NEXT_PHASE === "phase-production-build";
const isNextBuildCommand = process.argv.join(" ").includes("next build");

if (
  isServerRuntime &&
  !isNextBuildPhase &&
  !isNextBuildCommand &&
  process.env.NODE_ENV !== "test" &&
  !inngestEventKey
) {
  throw new Error(
    "Missing INNGEST_EVENT_KEY. Add INNGEST_EVENT_KEY to your environment configuration (see .env.local.example for local setup).",
  );
}

export const inngest = new Inngest({
  id: "vector48",
  eventKey: inngestEventKey,
});
