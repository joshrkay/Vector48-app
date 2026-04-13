#!/usr/bin/env node
/**
 * Phase A smoke test — drives the ai-phone-answering recipe end-to-end
 * against a real local Postgres. Proves the runner + handler + tracked
 * client + seed helper all wire up correctly without relying on the
 * full Supabase HTTP stack (which is unavailable in this sandbox).
 *
 * Modes
 * -----
 *
 *   --mode=local-mocked     (default)
 *     Mocks the Anthropic client and the GHL send-SMS call. Proves
 *     wiring works and a real llm_usage_events row appears. No real
 *     external API calls — safe to run without credentials.
 *
 *   --mode=local-real
 *     Makes a real Anthropic call using ANTHROPIC_API_KEY. Still mocks
 *     the GHL send-SMS (we don't have real staging credentials in the
 *     sandbox). Produces a real Claude response and a real usage event
 *     with actual token counts + cost.
 *
 * Env
 * ---
 *   SUPABASE_DB_URL            default: postgres://postgres_app:postgres@localhost:5432/vector48_dev
 *   ANTHROPIC_API_KEY          required in --mode=local-real
 *   SMOKE_ACCOUNT_ID           default: 00000000-0000-0000-0000-000000000101
 *   SMOKE_NOTIFICATION_CONTACT default: ghl-contact-local
 *
 * Pre-flight requirements
 * -----------------------
 *   1. Local Postgres running with 001_initial_schema + 00011_agent_runner applied.
 *      (Run scripts/dev/local-pg-bootstrap.sql first, then the two migrations.)
 *   2. An auth.users row and an accounts row matching SMOKE_ACCOUNT_ID.
 *      (scripts/dev/local-pg-bootstrap-seed.sql creates one.)
 */

import pg from "pg";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// ── CLI parsing ────────────────────────────────────────────────────────────

const args = new Map();
for (const raw of process.argv.slice(2)) {
  if (raw.startsWith("--")) {
    const eq = raw.indexOf("=");
    if (eq > 0) {
      args.set(raw.slice(2, eq), raw.slice(eq + 1));
    } else {
      args.set(raw.slice(2), "true");
    }
  }
}

const mode = args.get("mode") ?? "local-mocked";
if (mode !== "local-mocked" && mode !== "local-real") {
  console.error(`Unknown --mode=${mode}. Use local-mocked or local-real.`);
  process.exit(1);
}

// ── Env loading (matches scripts/create-test-account.mjs pattern) ──────────

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

const dbUrl =
  process.env.SUPABASE_DB_URL ??
  "postgres://postgres_app:postgres@localhost:5432/vector48_dev";
const accountId =
  process.env.SMOKE_ACCOUNT_ID ?? "00000000-0000-0000-0000-000000000101";
const notificationContact =
  process.env.SMOKE_NOTIFICATION_CONTACT ?? "ghl-contact-local";

if (mode === "local-real" && !process.env.ANTHROPIC_API_KEY) {
  console.error(
    "ANTHROPIC_API_KEY is required in --mode=local-real. Put it in .env.local.",
  );
  process.exit(1);
}

// ── Postgres connection + Supabase shim ────────────────────────────────────

const client = new pg.Client({ connectionString: dbUrl });
await client.connect();

/**
 * Supabase-shaped shim that translates the subset of method chains the
 * runner + seed helper actually call into parameterised SQL against
 * the local pg client. Kept as narrow as possible — if the runner
 * starts using a new chain shape, this is where the fake expands.
 */
function makeSupabaseShim(pgClient) {
  function eqChain(table, cols, where) {
    return {
      eq(col, val) {
        return eqChain(table, cols, [...where, [col, val]]);
      },
      async maybeSingle() {
        const whereSql = where
          .map(([c], i) => `${c} = $${i + 1}`)
          .join(" AND ");
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

          // The builder is both:
          //   - Awaitable directly (resolves to { error }) for callers
          //     like trackedClient that do `.insert(row)` without chaining.
          //   - A chain target exposing `.select(cols).single()` for
          //     callers like seedAgent that want the inserted row back.
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
                const returningSql = `${baseSql} RETURNING ${cols}`;
                try {
                  const { rows } = await pgClient.query(returningSql, values);
                  return { data: rows[0] ?? null, error: null };
                } catch (err) {
                  return { data: null, error: { message: err.message } };
                }
              },
            };
          }
          const builder = {
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
          return builder;
        },
        upsert(row, options) {
          return {
            select(cols) {
              return {
                async single() {
                  const columns = Object.keys(row);
                  const values = columns.map((c) => serialise(row[c]));
                  const placeholders = columns
                    .map((_, i) => `$${i + 1}`)
                    .join(", ");
                  const conflictCols = options.onConflict
                    .split(",")
                    .map((s) => s.trim());
                  const updates = columns
                    .filter((c) => !conflictCols.includes(c))
                    .map((c) => `${c} = EXCLUDED.${c}`)
                    .join(", ");
                  const sql = `
                    INSERT INTO ${table} (${columns.join(", ")})
                    VALUES (${placeholders})
                    ON CONFLICT (${options.onConflict}) DO UPDATE SET ${updates}
                    RETURNING ${cols}
                  `;
                  try {
                    const { rows } = await pgClient.query(sql, values);
                    return { data: rows[0] ?? null, error: null };
                  } catch (err) {
                    return { data: null, error: { message: err.message } };
                  }
                },
              };
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
      return {
        data: null,
        error: { message: `unsupported rpc: ${fn}` },
      };
    },
  };
}

function serialise(v) {
  return typeof v === "object" && v !== null ? JSON.stringify(v) : v;
}

// ── Mock Anthropic (used in local-mocked mode) ─────────────────────────────

function makeMockAnthropic() {
  return {
    messages: {
      async create(params) {
        return {
          id: "msg_smoke_fake",
          type: "message",
          role: "assistant",
          model: params.model,
          stop_reason: "end_turn",
          stop_sequence: null,
          content: [
            {
              type: "text",
              text: "SMOKE-MOCK: Janet Smith called about a sink leak. She wants a callback tomorrow morning. Urgency: medium. No pricing given.",
            },
          ],
          usage: {
            input_tokens: 128,
            output_tokens: 48,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 0,
          },
        };
      },
    },
  };
}

// ── Mock GHL ghlPost (always mocked in Phase A) ────────────────────────────

const ghlCalls = [];
function mockGhlPost(path, body, opts) {
  ghlCalls.push({ path, body, opts });
  console.log(
    `[mock-ghl] ${path} contactId=${body.contactId} message.len=${body.message?.length ?? 0}`,
  );
  return Promise.resolve({ messageId: "ghl-msg-smoke-42" });
}

// ── Main ───────────────────────────────────────────────────────────────────

const supabase = makeSupabaseShim(client);

try {
  // Reset any prior smoke artefacts so we're running from a clean slate
  await client.query(
    "DELETE FROM llm_usage_events WHERE account_id = $1",
    [accountId],
  );
  await client.query(
    "DELETE FROM tenant_agent_sessions WHERE account_id = $1",
    [accountId],
  );
  await client.query(
    "DELETE FROM tenant_agents WHERE account_id = $1",
    [accountId],
  );

  // Phase A.5a — seed a tenant_agents row via the real helper
  const { seedAgentFromArchetype } = await import(
    "../../lib/recipes/runner/seedAgent.ts"
  );
  console.log("\n== Seeding tenant_agents row ==");
  const seeded = await seedAgentFromArchetype(
    {
      accountId,
      recipeSlug: "ai-phone-answering",
      overrides: {
        tool_config: { notification_contact_id: notificationContact },
      },
    },
    { client: supabase },
  );
  console.log(`  -> seeded agent ${seeded.id}`);

  // Phase A.5b — build deps and call runRecipe
  const { runRecipe } = await import("../../lib/recipes/runner/index.ts");

  let anthropicClient;
  if (mode === "local-mocked") {
    anthropicClient = makeMockAnthropic();
  } else {
    const AnthropicModule = await import("@anthropic-ai/sdk");
    anthropicClient = new AnthropicModule.default({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }

  // The handler factory needs its own ghlPost injection so the registry
  // default (which dynamic-imports the real GHL client) is bypassed. For
  // the smoke test we rebind the registry entry with a fresh handler.
  const {
    createAiPhoneAnsweringHandler,
  } = await import(
    "../../lib/recipes/runner/recipes/aiPhoneAnswering.ts"
  );
  const registry = (await import("../../lib/recipes/runner/index.ts"))
    .RECIPE_HANDLERS;
  registry["ai-phone-answering"] = createAiPhoneAnsweringHandler({
    deps: { ghlPost: mockGhlPost },
  });

  // Synthetic GHL CallCompleted payload — passed raw to runRecipe
  // after the webhook-decoupling refactor. Each handler parses its
  // own trigger shape internally.
  const trigger = {
    type: "CallCompleted",
    locationId: "loc-local",
    contactId: "ghl-caller-smoke",
    contact: {
      firstName: "Janet",
      lastName: "Smith",
      name: "Janet Smith",
    },
    callDuration: 137,
    direction: "inbound",
    transcription:
      "Hi this is Janet Smith, I live at 42 Oak Lane. I've got a leak under the kitchen sink and water is pooling on the floor. Can someone come tomorrow morning? Please call me back at 555-1234.",
  };

  console.log(`\n== Calling runRecipe in --mode=${mode} ==`);
  const result = await runRecipe({
    accountId,
    recipeSlug: "ai-phone-answering",
    trigger,
    deps: {
      supabase,
      getGhlCredentials: async () => ({
        locationId: "loc-local",
        accessToken: "fake-ghl-token",
      }),
      anthropic: anthropicClient,
    },
  });

  console.log("\n== runRecipe result ==");
  console.log(JSON.stringify(result, null, 2));

  // Phase A.5c — verify an llm_usage_events row appeared
  const { rows: usage } = await client.query(
    `SELECT recipe_slug, model, input_tokens, output_tokens, cost_micros, created_at
     FROM llm_usage_events
     WHERE account_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [accountId],
  );

  console.log("\n== llm_usage_events latest row ==");
  if (usage.length === 0) {
    console.error("BUG: no llm_usage_events row written");
    process.exitCode = 1;
  } else {
    console.log(JSON.stringify(usage[0], null, 2));
  }

  // Phase A.5d — verify the mock GHL send captured the summary
  console.log("\n== Mock GHL sends ==");
  console.log(`  ${ghlCalls.length} call(s)`);
  for (const c of ghlCalls) {
    console.log(`  body: ${JSON.stringify(c.body)}`);
  }

  console.log("\n== SMOKE TEST COMPLETE ==");
} catch (err) {
  console.error("\n== SMOKE TEST FAILED ==");
  console.error(err);
  process.exitCode = 1;
} finally {
  await client.end();
}
