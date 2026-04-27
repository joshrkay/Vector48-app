#!/usr/bin/env node
// ---------------------------------------------------------------------------
// GHL Private Integration Token installer
//
// Verifies a PIT works against the live GHL MCP server, then stores the
// encrypted token + scopes on the target accounts row. After this runs
// successfully, the lead-qualification recipe can call MCP tools on
// behalf of that account.
//
// This is the operator-side companion to lib/ghl/token.ts:setAccountPit.
// We don't import the TS module directly because it carries
// `import "server-only"` which Node refuses to load standalone; the
// AES-256-GCM encryption format is mirrored inline (same layout as
// encryptToken: base64(iv[12] || ciphertext || authTag[16])).
//
// Usage:
//   ACCOUNT_ID=<uuid> \
//   GHL_MCP_PIT=pit_xxx \
//   GHL_LOCATION_ID=<ghl-location-id-on-the-account> \
//   node scripts/install-ghl-pit.mjs
//
// Required env (besides the three above):
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//   GHL_TOKEN_ENCRYPTION_KEY  (or ENCRYPTION_KEY)
//
// Optional:
//   SCOPES="contacts.readonly contacts.write conversations.readonly conversations.write calendars.readonly"
//   GHL_MCP_URL=https://services.leadconnectorhq.com/mcp/
//   SKIP_VERIFY=true     skip the MCP probe step (faster, less safe)
// ---------------------------------------------------------------------------

import { createClient } from "@supabase/supabase-js";
import { createCipheriv, randomBytes } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const DEFAULT_MCP_URL = "https://services.leadconnectorhq.com/mcp/";
const DEFAULT_SCOPES =
  "contacts.readonly contacts.write conversations.readonly conversations.write calendars.readonly";
const REQUIRED_LOGICAL_TOOLS = {
  sendSms: ["send-a-new-message", "send-message", "send_message"],
  lookupContact: ["get-contact", "find-contact", "contact-get"],
  createTask: ["create-task", "task-create"],
  checkCalendar: [
    "get-calendar-events",
    "list-calendar-events",
    "calendar-events",
  ],
};

// ── env loading ────────────────────────────────────────────────────────────

function loadEnvLocal() {
  const p = resolve(process.cwd(), ".env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

loadEnvLocal();

function requireEnv(name) {
  const v = process.env[name];
  if (!v?.trim()) {
    console.error(`✗ Missing required env: ${name}`);
    process.exit(1);
  }
  return v.trim();
}

// ── encryption ─────────────────────────────────────────────────────────────

function getEncryptionKey() {
  const raw = (
    process.env.ENCRYPTION_KEY ??
    process.env.GHL_TOKEN_ENCRYPTION_KEY ??
    ""
  ).trim();
  if (!raw) {
    console.error(
      "✗ Missing GHL_TOKEN_ENCRYPTION_KEY (or ENCRYPTION_KEY). " +
        "32-byte key, hex or base64 encoded.",
    );
    process.exit(1);
  }
  const key = /^[0-9a-fA-F]{64}$/.test(raw)
    ? Buffer.from(raw, "hex")
    : Buffer.from(raw, "base64");
  if (key.length !== 32) {
    console.error(`✗ Encryption key must decode to 32 bytes (got ${key.length}).`);
    process.exit(1);
  }
  return key;
}

function encryptToken(plaintext, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  // Layout matches lib/ghl/token.ts:encryptToken — base64(iv || ct || tag).
  return Buffer.concat([iv, ciphertext, authTag]).toString("base64");
}

// ── MCP probe ──────────────────────────────────────────────────────────────

async function mcpRpc(url, pit, locationId, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${pit}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      locationId,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);

  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("text/event-stream")) {
    const dataLines = text
      .split(/\r?\n/)
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.slice(5).trim())
      .filter(Boolean);
    if (!dataLines.length) throw new Error("SSE response had no data frames");
    return JSON.parse(dataLines[dataLines.length - 1]);
  }
  return JSON.parse(text);
}

async function verifyPitAgainstMcp(url, pit, locationId) {
  const init = await mcpRpc(url, pit, locationId, {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "vector48-pit-installer", version: "1" },
    },
  });
  if (init.error) throw new Error(`initialize: ${init.error.message}`);

  const list = await mcpRpc(url, pit, locationId, {
    jsonrpc: "2.0",
    id: 2,
    method: "tools/list",
    params: {},
  });
  if (list.error) throw new Error(`tools/list: ${list.error.message}`);

  const tools = list.result?.tools ?? [];
  const missing = [];
  const found = {};
  for (const [logical, patterns] of Object.entries(REQUIRED_LOGICAL_TOOLS)) {
    const match = tools.find((t) =>
      patterns.some((p) => t.name.toLowerCase().includes(p)),
    );
    if (match) {
      found[logical] = match.name;
    } else {
      missing.push(logical);
    }
  }
  return { tools, found, missing };
}

// ── main ───────────────────────────────────────────────────────────────────

async function main() {
  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const accountId = requireEnv("ACCOUNT_ID");
  const pit = requireEnv("GHL_MCP_PIT");
  const locationId = requireEnv("GHL_LOCATION_ID");
  const scopes = process.env.SCOPES ?? DEFAULT_SCOPES;
  const mcpUrl = process.env.GHL_MCP_URL ?? DEFAULT_MCP_URL;
  const skipVerify = process.env.SKIP_VERIFY === "true";

  const key = getEncryptionKey();

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1. Sanity-check the account row.
  console.log(`→ Loading account ${accountId}`);
  const { data: account, error: accountErr } = await supabase
    .from("accounts")
    .select("id, business_name, ghl_location_id, ghl_pit_encrypted")
    .eq("id", accountId)
    .maybeSingle();

  if (accountErr) {
    console.error(`✗ Failed to load account: ${accountErr.message}`);
    process.exit(2);
  }
  if (!account) {
    console.error(`✗ No account with id ${accountId}`);
    process.exit(2);
  }
  if (!account.ghl_location_id) {
    console.error(
      `✗ Account ${accountId} has no ghl_location_id set — onboard the GHL ` +
        `sub-account first before installing a PIT.`,
    );
    process.exit(2);
  }
  if (account.ghl_location_id !== locationId) {
    console.error(
      `✗ GHL_LOCATION_ID (${locationId}) does not match accounts.ghl_location_id ` +
        `(${account.ghl_location_id}). Refusing to install a PIT for the wrong location.`,
    );
    process.exit(2);
  }
  console.log(`✓ Account: "${account.business_name}", location ${locationId}`);
  if (account.ghl_pit_encrypted) {
    console.log(`  (overwriting existing PIT)`);
  }

  // 2. Verify the PIT against GHL MCP — refuses to store a non-functional PIT.
  if (skipVerify) {
    console.log("→ Skipping MCP verification (SKIP_VERIFY=true)");
  } else {
    console.log(`→ Verifying PIT against ${mcpUrl}`);
    let probe;
    try {
      probe = await verifyPitAgainstMcp(mcpUrl, pit, locationId);
    } catch (err) {
      console.error(`✗ PIT verification failed: ${err.message}`);
      console.error(
        "  Common causes: wrong location, insufficient scopes, expired/revoked PIT.",
      );
      process.exit(3);
    }
    console.log(`✓ Connected to GHL MCP (${probe.tools.length} tools available)`);
    for (const [logical, name] of Object.entries(probe.found)) {
      console.log(`  ✓ ${logical} → ${name}`);
    }
    for (const logical of probe.missing) {
      console.log(`  ✗ ${logical} — NOT FOUND`);
    }
    if (probe.missing.length) {
      console.error(
        `\n✗ ${probe.missing.length} required tool(s) missing. Refusing to ` +
          `install a PIT that can't run lead-qualification.`,
      );
      console.error(
        "  Re-mint the PIT with the missing scopes, or update " +
          "LOGICAL_TOOL_PATTERNS in leadQualification.ts to match GHL's tool names.",
      );
      process.exit(4);
    }
  }

  // 3. Encrypt + store.
  console.log(`→ Encrypting PIT and updating accounts.ghl_pit_encrypted`);
  const encrypted = encryptToken(pit, key);
  const { error: updateErr } = await supabase
    .from("accounts")
    .update({
      ghl_pit_encrypted: encrypted,
      ghl_pit_scopes: scopes,
      ghl_pit_updated_at: new Date().toISOString(),
    })
    .eq("id", accountId);

  if (updateErr) {
    console.error(`✗ Update failed: ${updateErr.message}`);
    process.exit(5);
  }

  // 4. Read back to confirm.
  const { data: confirmed } = await supabase
    .from("accounts")
    .select("ghl_pit_encrypted, ghl_pit_scopes, ghl_pit_updated_at")
    .eq("id", accountId)
    .maybeSingle();

  if (!confirmed?.ghl_pit_encrypted) {
    console.error("✗ Read-back showed no PIT — install may have silently failed");
    process.exit(6);
  }

  console.log(`\n✓ PIT installed for account ${accountId}`);
  console.log(`  scopes:     ${confirmed.ghl_pit_scopes}`);
  console.log(`  updated_at: ${confirmed.ghl_pit_updated_at}`);
  console.log("\nNext steps:");
  console.log("  1. Make sure the recipe is activated:");
  console.log(
    `     SELECT * FROM recipe_activations WHERE account_id='${accountId}' AND recipe_slug='lead-qualification';`,
  );
  console.log("  2. Run the synthetic webhook test:");
  console.log(
    `     WEBHOOK_BASE_URL=http://localhost:3000 ACCOUNT_ID=${accountId} \\`,
  );
  console.log(
    `       LOCATION_ID=${locationId} TEST_SECRET=$GHL_WEBHOOK_TEST_SECRET \\`,
  );
  console.log(`       node scripts/test-lead-qualification-webhook.mjs`);
  console.log("  Expected outcome: qualification_message_sent (real SMS sent).");
}

main().catch((err) => {
  console.error(`\n✗ Unexpected error: ${err.message}`);
  process.exit(1);
});
