# A5 + A6 — GHL Integration Audit (OAuth + Client + Webhooks + Callbacks)

**Agents**: A5 (inbound) + A6 (outbound) + SEC-GHL
**Scope**: OAuth flow, GHLClient resource modules, inbound webhooks (12 event types), callback flow, caching, rate limiting, token management
**Status**: 🔴 **1 critical blocker, otherwise strong fundamentals**

## Summary

Strong architecture: Ed25519 signature verification over raw bytes, AES-256-GCM encryption with validated 32-byte keys, Upstash-backed distributed rate limiting with in-process fallback, OAuth token refresh under per-account mutex. **One critical gap**: test-mode webhook bypass lacks NODE_ENV guard, meaning an accidentally-set production env var would accept unsigned webhooks.

## 🔴 Blockers

### SEC-GHL-002 (CRITICAL): Test-mode bypass has no non-prod gate
`authenticateGhlWebhook()` at `/app/api/webhooks/ghl/signatureVerification.ts:117-129` checks `process.env.GHL_WEBHOOK_ALLOW_UNSIGNED === "true"` and `GHL_WEBHOOK_TEST_SECRET` — but does **NOT** check `NODE_ENV`. If the env var is accidentally set in production, unsigned webhooks are accepted.

**Fix**: Add `if (process.env.NODE_ENV === "production") return { ok: false, reason: "prod_requires_signature" };` before the bypass path.

## 🟠 Documentation / hardening

### CBN-007: Recursion boundary implicit
`processSideEffects → detectCallbackFromNote → markCallbackNeeded → processSideEffects(CallbackNeeded)` is bounded by design (inner call only fires `triggerRecipesFromGhlEvent`, which does not generate new webhook events), but the safety is not commented anywhere. Add an explicit comment in `webhookSideEffects.ts` or `callback.ts`.

### GHL-OUT-029: 401 not auto-retried after refresh
`GHLClient` classifies 401 as non-retryable; callers must implement refresh-and-retry. Document the pattern or provide a wrapper that does it.

### OAUTH-007: Reconnect banner UI incomplete
`refreshLocationToken()` correctly surfaces GHL 401 as `GHLAuthError` to the caller, but no settings-page "Reconnect GoHighLevel" banner component is in place yet. Verify before launch.

### ERR-003: Side-effect failures silent
`runSideEffect()` catches everything and logs to `console.error`, but silent failures in `detectCallbackFromNote` → recipes never fire while the note event still records. Needs observability/alerting post-launch.

### RATELIM-002: Redis failure is "fail open"
If Upstash goes down, requests bypass the distributed limiter and fall to local counters only. Add an alert path.

## Passing matrix (abridged)

### OAuth (8 scenarios all pass)
Fresh install, invalid state, cross-tenant state, 401 code exchange, mutex refresh, auto-refresh on near-expiry, revocation surfaced (caller-handled), encryption key rotation backwards-compat.

### Outbound client (31 scenarios all pass)
Every resource (contacts, opportunities, conversations, appointments, calendars, campaigns, webhooks, customFields, voiceAgent, locations) — list/get/create/update/delete as applicable. Retry on 5xx (4 attempts, exp backoff 1s/2s/4s), timeout classification, rate-limit 429 as non-retryable, auth 401 as non-retryable.

### Inbound webhooks (12 event types including new NoteCreate + TagUpdate — all pass)
CallCompleted, InboundMessage, ContactCreate, ContactUpdate, OpportunityCreate, OpportunityStageUpdate, AppointmentCreate, AppointmentStatusUpdate, ConversationUnread, ConversationUnreadUpdate, NoteCreate, TagUpdate. Unknown event types → 200 no-op. Replay → 200 idempotent via unique index `idx_automation_events_ghl_dedup`.

### Callback flow (7 scenarios pass)
CBN-001 NoteCreate keyword → CallbackNeeded event + GHL writes + recipe fan-out.
CBN-002 No-keyword note → no-op.
CBN-003 UI button → same effect.
CBN-004 Missing GHL creds → warnings returned, event still recorded.
CBN-005 GHL tag write failure → warning, continues to custom field + event.
CBN-006 Redelivery → unique-index dedup.
CBN-007 Bounded recursion — **needs comment**.

### Caching, rate limits, token management (all pass)
Per-account cache key isolation, tier-aware TTLs (trial 300s / growth 60s / custom 30s), Upstash distributed rate limiter with local fallback, AES-256-GCM encryption for both access and refresh tokens, RLS locked-down on `ghl_agency_oauth`.

## Edge cases for manual QA day-of

- Accidentally set `GHL_WEBHOOK_ALLOW_UNSIGNED=true` in staging → should reject once fix lands
- Fire callback via UI button twice rapidly — two separate events (expected? document)
- Concurrent webhook redelivery — unique-index dedup catches at DB, but `processSideEffects` may already have been queued twice → n8n receives duplicate trigger. Downstream recipes must be idempotent.
- Fire 200 GHL calls in 61s with per-window 120 limit → fixed-window counter allows burst. Document or migrate to sliding window.
- Rotate encryption key → existing tokens fail to decrypt (key must be stable or implement rolling decrypt).
- Unknown GHL event type in EVENT_TAG_MAP but not SUPPORTED_EVENT_TYPES → cache invalidates but no event row (by design; confirm acceptable).
- Stale timestamp (30+ days old) → no TTL check; dedup via ghl_event_id still works.

## Recommendation

Land SEC-GHL-002 fix **before ship**. All other items are acceptable with documentation or post-launch monitoring.
