#!/usr/bin/env node
/**
 * Creates a confirmed Supabase Auth user and a matching `accounts` row (local / staging).
 * `account_users` is created automatically by trigger `trg_accounts_create_owner`.
 *
 * Requirements:
 *   - NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in `.env.local` (or env)
 *
 * Usage:
 *   node scripts/create-test-account.mjs
 *   TEST_USER_EMAIL=x@test.com TEST_USER_PASSWORD='Secret!1' node scripts/create-test-account.mjs
 *
 * Safe to re-run: skips if an account already exists for the user (by email lookup).
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

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

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const email =
  process.env.TEST_USER_EMAIL ?? "test@vector48.local";
const password =
  process.env.TEST_USER_PASSWORD ?? "TestAccount!vector48";

if (!url || !serviceKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (add to .env.local).",
  );
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function findUserByEmail(target) {
  const normalized = target.toLowerCase();
  let page = 1;
  const perPage = 200;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage,
    });
    if (error) throw error;
    const user = data.users.find(
      (u) => u.email?.toLowerCase() === normalized,
    );
    if (user) return user;
    if (data.users.length < perPage) return null;
    page += 1;
    if (page > 50) return null;
  }
}

async function main() {
  let user = await findUserByEmail(email);

  if (!user) {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) {
      console.error("createUser failed:", error.message);
      process.exit(1);
    }
    user = data.user;
    console.log("Created auth user:", user.id);
  } else {
    console.log("Auth user already exists:", user.id);
  }

  const { data: existingAccount, error: accLookupErr } = await supabase
    .from("accounts")
    .select("id, business_name")
    .eq("owner_user_id", user.id)
    .maybeSingle();

  if (accLookupErr) {
    console.error("accounts lookup failed:", accLookupErr.message);
    process.exit(1);
  }

  if (existingAccount) {
    console.log(
      "Account already linked:",
      existingAccount.id,
      `(${existingAccount.business_name || "no name"})`,
    );
    console.log("\nSign in with:");
    console.log("  Email:   ", email);
    console.log("  Password:", password);
    return;
  }

  const now = new Date().toISOString();
  const { data: account, error: insertErr } = await supabase
    .from("accounts")
    .insert({
      owner_user_id: user.id,
      business_name: "Test Office (local)",
      plan_slug: "trial",
      vertical: "hvac",
      onboarding_done_at: now,
      onboarding_step: 8,
      provisioning_status: "pending",
    })
    .select("id")
    .single();

  if (insertErr) {
    console.error("accounts insert failed:", insertErr.message);
    console.error(
      "If a column error appears, your DB schema may differ from app types — adjust the insert in scripts/create-test-account.mjs.",
    );
    process.exit(1);
  }

  console.log("Created account:", account.id);
  console.log("\nSign in with:");
  console.log("  Email:   ", email);
  console.log("  Password:", password);
  console.log(
    "\nChange the password after first login in production-like environments.",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
