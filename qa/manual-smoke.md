# Manual Smoke Checklist (15 min, pre-launch)

Run this end-to-end against production-mirror with a real test email before flipping the launch switch. Each box must be checked by a human.

## 1. Signup + onboarding (3 min)
- [ ] `/signup` with fresh email + business name
- [ ] Email confirmation link arrives and resolves to `/onboarding`
- [ ] 8-step wizard persists across refresh at each step
- [ ] Last step kicks off provisioning (spinner appears, then resolves)

## 2. Dashboard first-load (1 min)
- [ ] `/dashboard` renders stat cards (not 0/0/0 placeholders after provisioning completes)
- [ ] ActiveRecipesStrip shows the opt-in recipe
- [ ] No red alert banner

## 3. Callback flow (2 min) — **new for launch**
- [ ] Open a test contact in `/crm/contacts/[id]`
- [ ] Click "Mark needs callback" — row appears in activity feed with `callback_needed`
- [ ] Verify in GHL: contact has `needs-callback` tag + `v48_callback_needed=true` custom field
- [ ] Recipe trigger fires in n8n (check n8n executions) or automation_events shows recipe_triggered entry
- [ ] Send fixture NoteCreate webhook with body "please call me back" — same effect

## 4. Recipes (3 min)
- [ ] `/recipes` lists all 16 slugs, filter tabs work
- [ ] Activate one Agent-SDK recipe → no errors in console
- [ ] Fire a representative trigger (manual or fixture webhook) → activity event appears
- [ ] Deactivate the recipe → status flips to deactivated

## 5. GHL webhook (2 min)
- [ ] Send a signed CallCompleted fixture → 200 + activity event
- [ ] Replay the same payload → 200 + no duplicate row (dedup)
- [ ] Send unsigned → 401

## 6. Billing/trial (2 min)
- [ ] Trial account shows "X days left" on `/billing`
- [ ] Flip `trial_ends_at` to past via SQL → next page load redirects to `/billing?reason=trial_expired`
- [ ] Stripe checkout button opens (test mode)

## 7. Multi-tenant sanity (2 min)
- [ ] Log into Account A. Attempt to access `/crm/contacts?accountId=<B>` via URL tampering → rejected or empty
- [ ] Send a GHL webhook for B's locationId while authed as A → only writes to B
