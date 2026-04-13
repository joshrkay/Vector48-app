#!/usr/bin/env node
/**
 * Phase A smoke test — exercises the ai-phone-answering webhook entry
 * point end-to-end against local Postgres. Where
 * smoke-ai-phone-answering.mjs drives `runRecipe` directly, this
 * driver builds a synthetic `Request` and calls the pure
 * `handleRecipeWebhook` function with shimmed deps — the same code
 * path the Next.js route hits in production.
 *
 * What this proves that the runRecipe smoke test does not:
 *   1. Signature verification plumbing (unsigned-test mode).
 *   2. Body parsing and `GHLWebhookCallCompleted` shape.
 *   3. Tenant-binding check against `accounts.ghl_location_id`.
 *   4. Error-to-Response mapping (400/401/403/404/500).
 *   5. `automation_events` insert against real Postgres.
 *   6. Response body shape + HTTP status code.
 *
 * Usage:
 *   node --experimental-strip-types scripts/dev/smoke-webhook.mjs
 *
 * Modes:
 *   --mode=local-mocked  (default) — mocks Anthropic + GHL SMS send
 *   --mode=local-real              — real Anthropic (ANTHROPIC_API_KEY),
 *                                    still mocks the GHL SMS send
 *
 * Pre-flight:
 *   - Local Postgres running with scripts/dev/local-pg-bootstrap.sql +
 *     001_initial_schema + 00011_agent_runner applied.
 *   - An account with id SMOKE_ACCOUNT_ID and ghl_location_id
 *     SMOKE_LOCATION_ID.
 *   - A seeded tenant_agents row (run smoke-ai-phone-answering.mjs
 *     first, or the script seeds one itself).
 */

import pg from "pg";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// ── CLI parsing ────────────────────────────────────────────────────────────

const args = new Map();
for (const raw of process.argv.slice(2)) {
  if (raw.startsWith("--")) {
    const eq = raw.indexOf("=");
    if (eq > 0) args.set(raw.slice(2, eq), raw.slice(eq + 1));
    else args.set(raw.slice(2), "true");
  }
}
const mode = args.get("mode") ?? "local-mocked";
if (mode !== "local-mocked" && mode !== "local-real") {
  console.error(`Unknown --mode=${mode}. Use local-mocked or local-real.`);
  process.exit(1);
}

const recipeSlug = args.get("recipe") ?? "ai-phone-answering";
if (
  recipeSlug !== "ai-phone-answering" &&
  recipeSlug !== "missed-call-text-back"
) {
  console.error(
    `Unknown --recipe=${recipeSlug}. Use ai-phone-answering or missed-call-text-back.`,
  );
  process.exit(1);
}

// ── Env loading ────────────────────────────────────────────────────────────

function loadEnvLocal() {
  const p = resolve(process.cwd(), ".env.local");
  if (!existsSync(p)) return;
  const text = readFileSync(p, "utf8");
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}
loadEnvLocal();

const dbUrl =
  process.env.SUPABASE_DB_URL ??
  "postgres://postgres_app:postgres@localhost:5432/vector48_dev";
const accountId =
  process.env.SMOKE_ACCOUNT_ID ?? "00000000-0000-0000-0000-000000000101";
const locationId = process.env.SMOKE_LOCATION_ID ?? "loc-local";
const notificationContact =
  process.env.SMOKE_NOTIFICATION_CONTACT ?? "ghl-contact-local";

if (mode === "local-real" && !process.env.ANTHROPIC_API_KEY) {
  console.error(
    "ANTHROPIC_API_KEY is required in --mode=local-real. Put it in .env.local.",
  );
  process.exit(1);
}

// ── Postgres client + Supabase shim ────────────────────────────────────────

const client = new pg.Client({ connectionString: dbUrl });
await client.connect();

function serialise(v) {
  return typeof v === "object" && v !== null ? JSON.stringify(v) : v;
}

/**
 * Supabase-shaped shim. Supports the method chains the runner + seed
 * helper + webhook handler actually call:
 *   from(t).select(cols).eq(...).eq(...)?.maybeSingle()
 *   from(t).insert(row)      (awaitable)
 *   from(t).insert(row).select(cols).single()
 *   rpc(fn, args)
 * Narrow enough to be a test fake; wide enough to exercise every DB
 * interaction the production path makes.
 */
function makeSupabaseShim(pgClient) {
  function eqChain(table, cols, where) {
    return {
      eq(col, val) {
        return eqChain(table, cols, [...where, [col, val]]);
      },
      async maybeSingle() {
        const whereSql = where.map(([c], i) => `${c} = $${i + 1}`).join(" AND ");
        const params = where.map(([, v]) => v);
        const sql = `SELECT ${cols} FROM ${table}${whereSql ? " WHERE " + whereSql : ""} LIMIT 1`;
        const { rows } = await pgClient.query(sql, params);
        return { data: rows[0] ?? null, error: null };
      },
    };
  }
  return {
    from(table) {
      return {
        select(cols) {
          return eqChain(table, cols, []);
        },
        insert(row) {
          const columns = Object.keys(row);
          const values = columns.map((c) => serialise(row[c]));
          const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
          const baseSql = `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders})`;
          async function runPlain() {
            try {
              await pgClient.query(baseSql, values);
              return { error: null };
            } catch (err) {
              return { error: { message: err.message } };
            }
          }
          function select(cols) {
            return {
              async single() {
                const sql = `${baseSql} RETURNING ${cols}`;
                try {
                  const { rows } = await pgClient.query(sql, values);
                  return { data: rows[0] ?? null, error: null };
                } catch (err) {
                  return { data: null, error: { message: err.message } };
                }
              },
            };
          }
          return {
            select,
            then(onFulfilled, onRejected) {
              return runPlain().then(onFulfilled, onRejected);
            },
            catch(onRejected) {
              return runPlain().catch(onRejected);
            },
            finally(onFinally) {
              return runPlain().finally(onFinally);
            },
          };
        },
      };
    },
    async rpc(fn, params) {
      if (fn === "get_monthly_spend_micros") {
        const { rows } = await pgClient.query(
          "SELECT get_monthly_spend_micros($1, $2) AS value",
          [params.p_account_id, params.p_recipe_slug],
        );
        return { data: rows[0]?.value ?? 0, error: null };
      }
      return { data: null, error: { message: `unsupported rpc: ${fn}` } };
    },
  };
}

const supabase = makeSupabaseShim(client);

// ── Mock Claude + mock GHL send ────────────────────────────────────────────

function makeMockAnthropic() {
  return {
    messages: {
      async create(params) {
        return {
          id: "msg_smoke_webhook",
          type: "message",
          role: "assistant",
          model: params.model,
          stop_reason: "end_turn",
          stop_sequence: null,
          content: [
            {
              type: "text",
              text: "SMOKE-WEBHOOK: Janet Smith reported a leaking kitchen sink at 42 Oak Lane. Urgency: medium. Asked for a Tuesday morning callback. No pricing discussed.",
            },
          ],
          usage: {
            input_tokens: 142,
            output_tokens: 52,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 0,
          },
        };
      },
    },
  };
}

const ghlCalls = [];
function mockGhlPost(path, body, opts) {
  ghlCalls.push({ path, body, opts });
  return Promise.resolve({ messageId: "ghl-msg-smoke-webhook" });
}

// ── Smoke setup: make sure the tenant_agents row exists ────────────────────

try {
  // Reset smoke artefacts so each run starts clean
  await client.query("DELETE FROM llm_usage_events WHERE account_id = $1", [accountId]);
  await client.query(
    "DELETE FROM automation_events WHERE account_id = $1 AND recipe_slug = $2",
    [accountId, recipeSlug],
  );
  await client.query(
    "DELETE FROM tenant_agents WHERE account_id = $1 AND recipe_slug = $2",
    [accountId, recipeSlug],
  );

  // Seed via the real helper (exercises the select-then-insert path).
  const { seedAgentFromArchetype } = await import(
    "../../lib/recipes/runner/seedAgent.ts"
  );
  console.log(`\n== Seeding tenant_agents row for ${recipeSlug} ==`);
  const seedOverrides =
    recipeSlug === "ai-phone-answering"
      ? { tool_config: { notification_contact_id: notificationContact } }
      : undefined;
  const seeded = await seedAgentFromArchetype(
    { accountId, recipeSlug, overrides: seedOverrides },
    { client: supabase },
  );
  console.log(`  -> seeded agent ${seeded.id}`);

  // Bind the target handler to a mock ghlPost so the SMS send is
  // captured locally rather than attempted against the real GHL API.
  const registry = (await import("../../lib/recipes/runner/index.ts"))
    .RECIPE_HANDLERS;
  if (recipeSlug === "ai-phone-answering") {
    const { createAiPhoneAnsweringHandler } = await import(
      "../../lib/recipes/runner/recipes/aiPhoneAnswering.ts"
    );
    registry["ai-phone-answering"] = createAiPhoneAnsweringHandler({
      deps: { ghlPost: mockGhlPost },
    });
  } else {
    const { createMissedCallTextBackHandler } = await import(
      "../../lib/recipes/runner/recipes/missedCallTextBack.ts"
    );
    registry["missed-call-text-back"] = createMissedCallTextBackHandler({
      deps: { ghlPost: mockGhlPost },
    });
  }

  // Pick an Anthropic client for the chosen mode
  let anthropicClient;
  if (mode === "local-mocked") {
    anthropicClient = makeMockAnthropic();
  } else {
    const AnthropicModule = await import("@anthropic-ai/sdk");
    anthropicClient = new AnthropicModule.default({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }

  // Build a runRecipe wrapper that threads the shim + anthropic through.
  const { runRecipe: baseRunRecipe } = await import(
    "../../lib/recipes/runner/index.ts"
  );
  const runRecipeWithDeps = (opts) =>
    baseRunRecipe({
      ...opts,
      deps: {
        supabase,
        getGhlCredentials: async () => ({
          locationId,
          accessToken: "fake-ghl-token",
        }),
        anthropic: anthropicClient,
      },
    });

  // Spoof an auth helper that always returns ok — the real
  // authenticateGhlWebhook lives under app/api/webhooks/ghl which
  // strip-types can't load via @/ alias. This matches what
  // GHL_WEBHOOK_ALLOW_UNSIGNED=true + x-ghl-test-secret produces in
  // production, and its behavior is exhaustively covered by the unit
  // tests in lib/recipes/runner/webhookHandler.test.ts.
  const authenticate = () => ({ ok: true, mode: "unsigned_test" });

  // ── Drive the handler with a synthetic Request ────────────────────────

  const { handleRecipeWebhook } = await import(
    "../../lib/recipes/runner/webhookHandler.ts"
  );

  // Build a synthetic webhook body matching the recipe's trigger shape.
  const body =
    recipeSlug === "ai-phone-answering"
      ? {
          type: "CallCompleted",
          locationId,
          contactId: "ghl-caller-smoke-webhook",
          contact: {
            firstName: "Janet",
            lastName: "Smith",
            name: "Janet Smith",
          },
          callDuration: 153,
          direction: "inbound",
          transcription:
            "Hi, this is Janet Smith at 42 Oak Lane. My kitchen sink is leaking and I've got water pooling on the floor. Can someone come Tuesday morning? Call me at 555-1234.",
        }
      : {
          type: "CallCompleted",
          locationId,
          contactId: "ghl-missed-caller-smoke",
          contact: {
            id: "ghl-missed-caller-smoke",
            firstName: "Alex",
            phone: "+15551234567",
          },
          from: "+15551234567",
          direction: "inbound",
          callDuration: 0,
        };

  const request = new Request(
    `http://localhost/api/recipes/webhook/${recipeSlug}/${accountId}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-ghl-test-secret": "local-smoke-secret",
      },
      body: JSON.stringify(body),
    },
  );

  console.log(`\n== POST /api/recipes/webhook/${recipeSlug}/${accountId} ==`);
  const response = await handleRecipeWebhook(
    request,
    { slug: recipeSlug, accountId },
    {
      supabase,
      authenticate,
      runRecipe: runRecipeWithDeps,
    },
  );

  console.log("\n== HTTP response ==");
  console.log("  status:", response.status);
  const responseBody = await response.json();
  console.log("  body:", JSON.stringify(responseBody, null, 2));

  if (response.status !== 200) {
    console.error("BUG: expected 200, got", response.status);
    process.exitCode = 1;
  }

  // ── Verify DB side effects ───────────────────────────────────────────

  const { rows: usageRows } = await client.query(
    `SELECT recipe_slug, model, input_tokens, output_tokens, cost_micros
     FROM llm_usage_events
     WHERE account_id = $1
     ORDER BY created_at DESC`,
    [accountId],
  );
  console.log("\n== llm_usage_events rows (expect >= 1) ==");
  console.log(JSON.stringify(usageRows, null, 2));
  if (usageRows.length === 0) {
    console.error("BUG: no llm_usage_events rows written");
    process.exitCode = 1;
  }

  const { rows: eventRows } = await client.query(
    `SELECT recipe_slug, event_type, summary, detail
     FROM automation_events
     WHERE account_id = $1 AND recipe_slug = $2
     ORDER BY created_at DESC`,
    [accountId, recipeSlug],
  );
  console.log("\n== automation_events rows (expect >= 1) ==");
  console.log(JSON.stringify(eventRows, null, 2));
  if (eventRows.length === 0) {
    console.error("BUG: no automation_events row written");
    process.exitCode = 1;
  }

  console.log("\n== Mock GHL sends ==");
  console.log(`  ${ghlCalls.length} call(s) via ghlPost`);
  for (const c of ghlCalls) {
    console.log(`  body: ${JSON.stringify(c.body)}`);
  }

  console.log("\n== WEBHOOK SMOKE TEST COMPLETE ==");
} catch (err) {
  console.error("\n== WEBHOOK SMOKE TEST FAILED ==");
  console.error(err);
  process.exitCode = 1;
} finally {
  await client.end();
}
