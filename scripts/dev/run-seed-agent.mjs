#!/usr/bin/env node
/**
 * Phase A.3 — Drives `seedAgentFromArchetype` against a real local
 * Postgres via @supabase/supabase-js. Proves the helper's upsert path
 * works end-to-end, not just against hand-rolled mocks. Dies loudly on
 * any failure so real bugs surface instead of being caught by a unit
 * test's forgiving fake.
 *
 * Usage (from the repo root, requires local Postgres with 00011 applied):
 *
 *   SUPABASE_URL=http://localhost:54321 \
 *   SUPABASE_SERVICE_ROLE_KEY=ignored \
 *   SUPABASE_DB_URL=postgres://postgres_app:postgres@localhost:5432/vector48_dev \
 *   node scripts/dev/run-seed-agent.mjs <accountId> <recipeSlug>
 *
 * For the sandbox we bypass the Supabase HTTP layer entirely and talk
 * to Postgres via `pg` — the seed helper only needs the minimal
 * {from, rpc} shape, which we synthesise here.
 */

import pg from "pg";

const [, , accountIdArg, recipeSlugArg] = process.argv;
const accountId = accountIdArg ?? "00000000-0000-0000-0000-000000000101";
const recipeSlug = recipeSlugArg ?? "ai-phone-answering";

const dbUrl =
  process.env.SUPABASE_DB_URL ??
  "postgres://postgres_app:postgres@localhost:5432/vector48_dev";

const client = new pg.Client({ connectionString: dbUrl });
await client.connect();

// Minimal shape of the Supabase client that `seedAgentFromArchetype`
// expects. The helper only calls `.from(...).select(...).eq(...).maybeSingle()`
// for the account row and `.from(...).upsert(row, { onConflict }).select(...).single()`
// for the tenant_agents row, so those are the only two chains we need.
const fakeSupabase = {
  from(table) {
    return {
      select(cols) {
        let eqCol, eqVal;
        return {
          eq(col, val) {
            eqCol = col;
            eqVal = val;
            return {
              async maybeSingle() {
                const { rows } = await client.query(
                  `SELECT ${cols} FROM ${table} WHERE ${eqCol} = $1 LIMIT 1`,
                  [eqVal],
                );
                return { data: rows[0] ?? null, error: null };
              },
            };
          },
        };
      },
      upsert(row, options) {
        return {
          select(cols) {
            return {
              async single() {
                const columns = Object.keys(row);
                const placeholders = columns
                  .map((_, i) => `$${i + 1}`)
                  .join(", ");
                const values = columns.map((c) => {
                  const v = row[c];
                  // Serialise jsonb columns so node-pg sends them as JSON text
                  return typeof v === "object" && v !== null
                    ? JSON.stringify(v)
                    : v;
                });
                const updates = columns
                  .filter(
                    (c) =>
                      !options.onConflict
                        .split(",")
                        .map((s) => s.trim())
                        .includes(c),
                  )
                  .map((c) => `${c} = EXCLUDED.${c}`)
                  .join(", ");
                const sql = `
                  INSERT INTO ${table} (${columns.join(", ")})
                  VALUES (${placeholders})
                  ON CONFLICT (${options.onConflict})
                    DO UPDATE SET ${updates}
                  RETURNING ${cols}
                `;
                try {
                  const { rows } = await client.query(sql, values);
                  return { data: rows[0] ?? null, error: null };
                } catch (err) {
                  return {
                    data: null,
                    error: { message: err.message },
                  };
                }
              },
            };
          },
        };
      },
    };
  },
};

// Import after client is connected so any runtime errors in the helper's
// module-load path also surface here.
const { seedAgentFromArchetype } = await import(
  "../../lib/recipes/runner/seedAgent.ts"
);

try {
  const row = await seedAgentFromArchetype(
    {
      accountId,
      recipeSlug,
      overrides: {
        tool_config: { notification_contact_id: "ghl-contact-local" },
      },
    },
    { client: fakeSupabase },
  );
  console.log(JSON.stringify({ ok: true, row }, null, 2));
} catch (err) {
  console.error(JSON.stringify({ ok: false, error: err.message }));
  process.exitCode = 1;
} finally {
  await client.end();
}
