#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Lead-Qualification Webhook Synthetic Test
//
// Posts a synthetic GHL InboundMessage to the lead-qualification recipe
// route and reports the response. Bypasses GHL by using the unsigned-test
// auth mode (see lib/recipes/runner/webhookHandler.ts and
// app/api/webhooks/ghl/signatureVerification.ts).
//
// Auth requires THREE env vars set on the target environment:
//   GHL_WEBHOOK_ALLOW_UNSIGNED=true
//   GHL_WEBHOOK_TEST_SECRET=<some-random-string>
//   NODE_ENV !== "production"   (so Vercel preview WON'T work as-is —
//                                 use local `npm run dev` for now)
//
// Usage:
//   WEBHOOK_BASE_URL=http://localhost:3000 \
//   ACCOUNT_ID=<staging-account-uuid> \
//   LOCATION_ID=<ghl-location-id-on-the-account> \
//   TEST_SECRET=<matches GHL_WEBHOOK_TEST_SECRET> \
//   node scripts/test-lead-qualification-webhook.mjs
//
// Optional:
//   INBOUND_TEXT="Hi, my AC is broken"   (default: a sample lead message)
//   CONTACT_ID=ghl-contact-test          (default: ghl-contact-test)
//   CONVERSATION_ID=conv-test-1          (default: conv-test-1)
// ---------------------------------------------------------------------------

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing required env: ${name}`);
    process.exit(1);
  }
  return v;
}

const baseUrl = requireEnv("WEBHOOK_BASE_URL").replace(/\/$/, "");
const accountId = requireEnv("ACCOUNT_ID");
const locationId = requireEnv("LOCATION_ID");
const testSecret = requireEnv("TEST_SECRET");

const inboundText =
  process.env.INBOUND_TEXT ?? "Hi, my AC is broken and I need help today";
const contactId = process.env.CONTACT_ID ?? "ghl-contact-test";
const conversationId = process.env.CONVERSATION_ID ?? "conv-test-1";

const url = `${baseUrl}/api/recipes/webhook/lead-qualification/${accountId}`;
const body = {
  type: "InboundMessage",
  locationId,
  contactId,
  conversationId,
  body: inboundText,
};

console.log(`→ POST ${url}`);
console.log(`  account:      ${accountId}`);
console.log(`  location:     ${locationId}`);
console.log(`  contact:      ${contactId}`);
console.log(`  conversation: ${conversationId}`);
console.log(`  inbound:      "${inboundText}"`);
console.log("");

const res = await fetch(url, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-ghl-test-secret": testSecret,
  },
  body: JSON.stringify(body),
});

const text = await res.text();
let parsed;
try {
  parsed = JSON.parse(text);
} catch {
  parsed = text;
}

console.log(`← HTTP ${res.status}`);
console.log(JSON.stringify(parsed, null, 2));

// Interpret the response so the operator knows what just happened.
console.log("");
if (res.status === 200 && typeof parsed === "object" && parsed?.result) {
  const r = parsed.result;
  console.log(`✓ Webhook accepted. outcome=${r.outcome}`);
  switch (r.outcome) {
    case "qualification_message_sent":
    case "qualification_completed":
      console.log("  → Real run. Check llm_usage_events + the SMS on the lead's phone.");
      break;
    case "skipped_no_pit":
      console.log("  → Wiring works. Install a PIT (runbook Phase C) to exercise the live MCP path.");
      break;
    case "skipped_no_inbound_text":
    case "skipped_no_enabled_tools":
      console.log("  → Handler short-circuited. Check tenant_agents.tool_config and the request body.");
      break;
    case "halted_max_iterations":
      console.log("  → Agent looped beyond MAX_AGENT_ITERATIONS (5). Check the system prompt.");
      break;
    default:
      console.log(`  → Unexpected outcome. Inspect the trace above.`);
  }
} else if (res.status === 401) {
  console.log("✗ 401 webhook_unauthorized — common causes:");
  console.log("  • TEST_SECRET doesn't match GHL_WEBHOOK_TEST_SECRET on the server");
  console.log("  • GHL_WEBHOOK_ALLOW_UNSIGNED=true is not set on the server");
  console.log("  • NODE_ENV=production on the server (Vercel preview blocks unsigned)");
} else if (res.status === 403) {
  console.log("✗ 403 tenant_binding_mismatch — LOCATION_ID does not match the account row's ghl_location_id.");
} else if (res.status === 404) {
  console.log("✗ 404 — most likely 'agent_not_configured' (no active tenant_agents row).");
  console.log("  Activate the recipe via /api/recipes/activate or insert a recipe_activations row.");
} else if (res.status === 400) {
  console.log("✗ 400 — payload missing contactId or empty inboundText. See above.");
} else {
  console.log(`✗ Unexpected HTTP ${res.status}. Check server logs.`);
  process.exit(2);
}
