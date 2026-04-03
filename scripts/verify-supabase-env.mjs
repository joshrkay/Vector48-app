#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const REQUIRED_KEYS = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"];
const SUPABASE_PROJECT_DOMAIN_PATTERN = /^[a-z0-9-]+\.supabase\.co$/;

const SUPABASE_URL_REASON_CODES = {
  INVALID_URL: "SUPABASE_URL_INVALID_FORMAT",
  INVALID_PROTOCOL: "SUPABASE_URL_INVALID_PROTOCOL",
  INVALID_HOSTNAME: "SUPABASE_URL_INVALID_HOSTNAME",
  QUOTED_VALUE: "SUPABASE_URL_SURROUNDING_QUOTES",
};

function parseArgs(argv) {
  const options = {
    accountId: undefined,
    baseUrl: process.env.PLAYWRIGHT_BASE_URL || process.env.NEXT_PUBLIC_APP_URL,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--account-id") {
      options.accountId = argv[i + 1];
      i += 1;
      continue;
    }

    if (arg === "--base-url") {
      options.baseUrl = argv[i + 1];
      i += 1;
      continue;
    }
  }

  return options;
}

function validateValue(name, value, sourceLabel) {
  if (!value) {
    throw new Error(`${sourceLabel}: ${name} is missing`);
  }

  const trimmed = value.trim();

  if (trimmed !== value) {
    throw new Error(`${sourceLabel}: ${name} has leading/trailing spaces or newlines`);
  }

  if (/\s/.test(trimmed)) {
    throw new Error(`${sourceLabel}: ${name} contains whitespace`);
  }

  return trimmed;
}

function validateSupabaseUrlFormat(urlValue) {
  if (
    (urlValue.startsWith('"') && urlValue.endsWith('"')) ||
    (urlValue.startsWith("'") && urlValue.endsWith("'")) ||
    (urlValue.startsWith("`") && urlValue.endsWith("`"))
  ) {
    return SUPABASE_URL_REASON_CODES.QUOTED_VALUE;
  }

  let parsedUrl;

  try {
    parsedUrl = new URL(urlValue);
  } catch {
    return SUPABASE_URL_REASON_CODES.INVALID_URL;
  }

  if (parsedUrl.protocol !== "https:") {
    return SUPABASE_URL_REASON_CODES.INVALID_PROTOCOL;
  }

  if (!SUPABASE_PROJECT_DOMAIN_PATTERN.test(parsedUrl.hostname)) {
    return SUPABASE_URL_REASON_CODES.INVALID_HOSTNAME;
  }

  return null;
}

function parseDotEnv(content) {
  const env = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const equalsIndex = line.indexOf("=");

    if (equalsIndex < 1) {
      continue;
    }

    const key = line.slice(0, equalsIndex).trim();
    const value = line.slice(equalsIndex + 1);
    env[key] = value;
  }

  return env;
}

function loadLocalEnv(localEnvPath) {
  if (!fs.existsSync(localEnvPath)) {
    throw new Error(`.env.local not found at ${localEnvPath}. Copy .env.local.example first.`);
  }

  const content = fs.readFileSync(localEnvPath, "utf8");
  return parseDotEnv(content);
}

async function checkProvisionStatus(baseUrl, accountId) {
  if (!accountId) {
    console.log("ℹ️  Skipping provision status check (missing --account-id).");
    return;
  }

  if (!baseUrl) {
    throw new Error("Missing --base-url (or PLAYWRIGHT_BASE_URL / NEXT_PUBLIC_APP_URL) for status check.");
  }

  const url = new URL("/api/onboarding/provision/status", baseUrl);
  url.searchParams.set("accountId", accountId);

  const response = await fetch(url, {
    headers: {
      accept: "application/json",
    },
  });

  const bodyText = await response.text();
  console.log(`ℹ️  GET ${url.toString()}`);
  console.log(`ℹ️  HTTP ${response.status}`);
  console.log(bodyText);

  if (!response.ok) {
    throw new Error(`Provision status check failed with HTTP ${response.status}`);
  }
}

async function main() {
  const { accountId, baseUrl } = parseArgs(process.argv.slice(2));
  const localEnvPath = path.resolve(process.cwd(), ".env.local");

  for (const key of REQUIRED_KEYS) {
    const runtimeValue = validateValue(key, process.env[key], "Process env");

    if (key === "NEXT_PUBLIC_SUPABASE_URL") {
      validateSupabaseUrl(runtimeValue, "Process env");
    }
  }

  const localEnv = loadLocalEnv(localEnvPath);

  for (const key of REQUIRED_KEYS) {
    const runtimeValue = validateValue(key, process.env[key], "Process env");
    const localValue = validateValue(key, localEnv[key], ".env.local");

    if (key === "NEXT_PUBLIC_SUPABASE_URL") {
      const runtimeReasonCode = validateSupabaseUrlFormat(runtimeValue);
      const localReasonCode = validateSupabaseUrlFormat(localValue);

      if (runtimeReasonCode) {
        throw new Error(`Process env: ${key} invalid (${runtimeReasonCode})`);
      }

      if (localReasonCode) {
        throw new Error(`.env.local: ${key} invalid (${localReasonCode})`);
      }
    }

    if (runtimeValue !== localValue) {
      throw new Error(`.env.local mismatch for ${key}. Keep local values in parity with deployment values.`);
    }
  }

  console.log("✅ Supabase public env vars are valid and .env.local is in parity.");

  await checkProvisionStatus(baseUrl, accountId);
}

main().catch((error) => {
  console.error(`❌ ${error.message}`);
  process.exit(1);
});
