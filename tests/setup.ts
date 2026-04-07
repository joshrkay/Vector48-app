// ---------------------------------------------------------------------------
// Global test setup — env vars, MSW lifecycle, Supabase mock
// ---------------------------------------------------------------------------

import { beforeAll, afterAll, afterEach, vi } from "vitest";
import { server } from "./mocks/server";
import { resetCallLog } from "./mocks/handlers";
import { resetUpdateLog, mockSupabaseClient } from "./mocks/supabase";

// ── Env vars (must be set before any module reads them) ───────────────────

process.env.GHL_AGENCY_API_KEY = "test-agency-key-abc123";
process.env.GHL_AGENCY_ID = "test-agency-id";
process.env.GHL_CLIENT_ID = "test-client-id";
process.env.GHL_CLIENT_SECRET = "test-client-secret";
process.env.GHL_OAUTH_REDIRECT_URI =
  "https://test.vector48.com/api/integrations/ghl/callback";
// 32 random bytes as hex (64 chars)
process.env.ENCRYPTION_KEY =
  "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2";
process.env.GHL_TOKEN_ENCRYPTION_KEY =
  "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2";
process.env.GHL_WEBHOOK_SECRET = "test-webhook-secret";
process.env.VECTOR48_BASE_URL = "https://test.vector48.com";
process.env.VECTOR40_BASE_URL = "https://test.vector48.com";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://fake.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "fake-anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";

// ── Mock Supabase admin client ────────────────────────────────────────────

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => mockSupabaseClient,
  getSupabaseAdmin: () => mockSupabaseClient,
}));

// ── Mock GHL OAuth module — returns static values matching test env vars ──

vi.mock("@/lib/ghl/oauth", () => ({
  getAgencyAccessToken: vi.fn().mockResolvedValue("test-agency-key-abc123"),
  getAgencyCompanyId: vi.fn().mockResolvedValue("test-agency-id"),
  refreshLocationToken: vi.fn(),
  exchangeCodeForTokens: vi.fn(),
  upsertAgencyOAuth: vi.fn(),
}));

// ── Suppress console noise from provisioning logs ─────────────────────────

vi.spyOn(console, "log").mockImplementation(() => {});
vi.spyOn(console, "warn").mockImplementation(() => {});
vi.spyOn(console, "error").mockImplementation(() => {});

// ── MSW lifecycle ─────────────────────────────────────────────────────────

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});

afterEach(() => {
  server.resetHandlers();
  resetCallLog();
  resetUpdateLog();
});

afterAll(() => {
  server.close();
});
