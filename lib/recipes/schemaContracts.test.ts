import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  RECIPE_ACTIVATIONS_CANONICAL_COLUMNS,
  RECIPE_TRIGGERS_CANONICAL_COLUMNS,
  RECIPE_TRIGGER_COMPAT_COLUMNS,
} from "./schemaContracts.ts";

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");

test("canonical contract columns remain stable", () => {
  assert.deepEqual(RECIPE_ACTIVATIONS_CANONICAL_COLUMNS, [
    "id",
    "account_id",
    "recipe_slug",
    "status",
    "config",
    "n8n_workflow_id",
    "activated_at",
    "last_triggered_at",
    "deactivated_at",
    "error_message",
  ]);

  assert.deepEqual(RECIPE_TRIGGERS_CANONICAL_COLUMNS, [
    "id",
    "account_id",
    "recipe_slug",
    "status",
    "fire_at",
    "payload",
    "attempt_count",
    "max_attempts",
    "last_error",
    "processed_at",
    "created_at",
  ]);

  assert.deepEqual(RECIPE_TRIGGER_COMPAT_COLUMNS, ["recipe_id", "fired", "trigger_data", "retry_count"]);
});

test("supabase types include canonical recipe columns", () => {
  const typesPath = path.join(REPO_ROOT, "lib/supabase/types.ts");
  const types = fs.readFileSync(typesPath, "utf8");

  assert.match(types, /recipe_activations:[\s\S]*recipe_slug: string;/);
  assert.match(types, /recipe_activations:[\s\S]*status: "active" \| "paused" \| "error" \| "deactivated"/);
  assert.match(types, /recipe_triggers:[\s\S]*recipe_slug: string;/);
  assert.match(types, /recipe_triggers:[\s\S]*status: "queued" \| "processing" \| "completed" \| "failed" \| "cancelled"/);
  assert.match(types, /recipe_triggers:[\s\S]*payload: Record<string, unknown> \| null;/);
  assert.match(types, /recipe_triggers:[\s\S]*max_attempts: number;/);
});

test("migration assertions enforce recipe contracts", () => {
  const migrationPath = path.join(REPO_ROOT, "supabase/migrations/011_recipe_schema_contracts.sql");
  const sql = fs.readFileSync(migrationPath, "utf8");

  assert.match(sql, /SELECT assert_column_type\('recipe_activations', 'recipe_slug', 'text', 'NO'\);/);
  assert.match(sql, /SELECT assert_column_type\('recipe_triggers', 'status', 'recipe_trigger_status', 'NO'\);/);
  assert.match(sql, /SELECT assert_column_type\('recipe_triggers', 'payload', 'jsonb', 'YES'\);/);
});

test("retry policy migration defines due-trigger selector function", () => {
  const migrationPath = path.join(REPO_ROOT, "supabase/migrations/017_recipe_trigger_retry_policy.sql");
  const sql = fs.readFileSync(migrationPath, "utf8");

  assert.match(sql, /ADD COLUMN IF NOT EXISTS max_attempts integer;/);
  assert.match(sql, /CHECK \(max_attempts >= 1\);/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.get_due_recipe_triggers/);
  assert.match(sql, /AND rt\.attempt_count < rt\.max_attempts/);
});
