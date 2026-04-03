import { Inngest } from "inngest";

const inngestEventKey = process.env.INNGEST_EVENT_KEY;

if (process.env.NODE_ENV !== "test" && !inngestEventKey) {
  throw new Error(
    "Missing INNGEST_EVENT_KEY. Add INNGEST_EVENT_KEY to your environment configuration (see .env.local.example for local setup).",
  );
}

export const inngest = new Inngest({
  id: "vector48",
  eventKey: inngestEventKey,
});
