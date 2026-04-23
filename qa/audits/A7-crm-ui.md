# A7 — CRM UI Audit

**Agent**: A7 CRM UI
**Scope**: /dashboard, /recipes, /crm/* (contacts, pipeline, inbox, calendar, campaigns, reports), /settings
**Status**: 🟡 **Fixable before launch — 6 blockers, 10 majors, good overall state**

## Summary

CRM surfaces are largely feature-complete with solid error boundaries for GHL credential failures. Critical gaps: missing try/catch on several read-only API routes, no error handling in `/api/ghl/contacts` GET, no realtime on contact detail page, reports page crashes if DB query fails, and the contact-edit form doesn't revert on API error. Dashboard, Activity Feed, Pipeline, and Campaigns are shipworthy.

## 🔴 Blockers (must fix pre-launch)

- **`/api/ghl/contacts` GET has no try/catch** (C-004) — unhandled rejection crashes the route on GHL error. Fix: wrap `cachedGHLClient(...).getContacts()` at `app/api/ghl/contacts/route.ts:27-32` in try/catch, return `NextResponse` 502.
- **ContactsClientShell hardcodes `ghlUnavailableReason=null`** (C-004) — error banner never shows even when GHL fails. Pass real error from server.
- **Reports page has no try/catch on `getReportData`** (R-003) — DB query failure crashes entire page. Fix at `app/(app)/crm/reports/page.tsx:49`.
- **Contact list doesn't validate `filter` param against `TAG_MAP`** (C-004) — unknown filter yields `undefined` lookup, unpredictable GHL behavior.
- **Contact detail timeline assumes non-null `contact_phone`** (C-026) — automationEvents with null phone crash display.
- **Inbox orphan conversation failure silent** (I-014) — if fetch fails, user sees nothing, no error message.

## 🟠 Majors (acceptable with release-note workaround)

- **Realtime not wired on contact detail** (C-030) — manual refresh required.
- **Activity Feed realtime fails silently on malformed accountId** (D-006) — no log, no surface.
- **Client expects `{contacts, nextCursor}` shape, gets raw error body on 5xx** (C-004) — shape mismatch crashes client.
- **Inbox search UI completely missing** (I-008).
- **Unread conversation state not displayed** (I-005).
- **Calendar mobile day-selection UI missing** (CA-009).
- **ContactHeader edit form doesn't revert on API failure** (C-023) — form stays dirty.
- **Dashboard stat cards no error handling** (D-003) — show 0 if query fails.
- **No loading skeleton on Dashboard** (D-003).
- **Pipeline cursor loop-detection exits silently** (P-006) — truncates list without warning.

## Per-surface matrix (abridged — full rows in `/qa/launch-matrix.md`)

### Contacts list
Most scenarios pass. Error-path and search edge cases fail. See C-001..C-031 rows.

### Contacts detail
Solid GHL credential handling. Fails on null-phone timeline entries and no realtime. See C-019..C-031.

### Pipeline
Fully functional with drag-drop revert, cursor-loop guard, and mobile view. Only concern: silent cursor-loop exit.

### Inbox
Good error boundary, orphan conversation flow mostly works. Missing: search UI, unread state display.

### Calendar
Week/day toggle, timezone handling, reminder-recipe status all wired. Mobile day selection needs UI.

### Campaigns
Credential and 5xx error handling robust. Filter/click-to-open are unverified.

### Reports
**Critical blocker**: no error handling on `getReportData`. Charts otherwise responsive.

### Dashboard
Stat cards, Activity Feed w/ realtime, AlertBanner, ProvisioningBanner all working. Missing stat-error handling and loading skeleton.

### Recipes marketplace + ActivationSheet
Grid layout responsive, filter tabs work. Activation form validation visible but not deeply audited.

### Settings
Account info, integrations, warnings all rendered. Reconnect button and plan-switching UI unverified.

## Edge cases for manual QA day-of

- Contact list with exactly 20 items (cursor boundary)
- Search with `"&filter=new_lead"` (injection attempt)
- Contact detail with `contact.phone = null`
- Pipeline with `pipeline.stages = []`
- Pipeline pagination at exactly 250 items
- Inbox orphan conversation with null contactId
- Calendar week spanning DST boundary
- Active Recipes Strip with 0 active
- AlertBanner with 3+ alerts (show-all link)
- Settings with no integrations
- Reports spanning year boundary (Jan 1)
- Mobile inbox with short conversation list (infinite scroll doesn't trigger)
- Contact tags length > 3 (+N more pill tooltip)
- Recipe activation phone format "555-1234" vs "5551234"
- Dashboard greeting at 11:59am/12:00pm/16:59pm/17:00pm boundaries

Full row list preserved in this file for reference; compiled into master matrix on all-agent completion.
