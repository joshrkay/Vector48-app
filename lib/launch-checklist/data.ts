export interface LaunchTask {
  id: string;
  /** Optional bold lead (e.g. "Full signup flow:") before the rest of the line */
  boldLead?: string;
  text: string;
  /** Small badge (e.g. "Done") */
  dep?: string;
}

export interface LaunchPhase {
  num: number;
  title: string;
  timeLabel: string;
  tasks: LaunchTask[];
}

export interface EnvTableRow {
  variable: string;
  where: string;
  source: string;
}

export interface LaunchSummaryParagraph {
  lead: string;
  body: string;
}

export const LAUNCH_CHECKLIST_STORAGE_KEY = "v48-launch-checklist";

export const launchPhases: LaunchPhase[] = [
  {
    num: 1,
    title: "Accounts & Keys",
    timeLabel: "~1 hour",
    tasks: [
      {
        id: "p1-0",
        text: "GHL Agency Pro plan ($497/mo) active — required for sub-account creation API",
      },
      {
        id: "p1-1",
        text: "GHL Agency Private Integration Token generated (Settings → Private Integrations)",
      },
      { id: "p1-2", text: "At least one LC Phone number purchased in GHL" },
      {
        id: "p1-3",
        text: "Railway account created (Pro plan $5/mo recommended)",
      },
      { id: "p1-4", text: "Stripe account created + test mode active" },
      {
        id: "p1-5",
        text: "Stripe products created: Starter ($97), Growth ($197), Pro ($397) — copy the price IDs",
      },
      {
        id: "p1-6",
        text: "Stripe Customer Portal configured (Settings → Billing → Customer Portal)",
      },
      {
        id: "p1-7",
        text: "Vercel Pro plan ($20/mo) — required for cron jobs",
      },
      {
        id: "p1-8",
        text: "Domain: vector48.com (or your chosen domain) configured in Vercel",
      },
      {
        id: "p1-9",
        text: "Subdomain: n8n.vector48.com CNAME ready for Railway",
      },
    ],
  },
  {
    num: 2,
    title: "Execute Front-End Prompts",
    timeLabel: "~8-12 hours across sessions",
    tasks: [
      {
        id: "p2-0",
        text: "Prompt 1: Scaffold — project structure, routes, Tailwind config",
        dep: "✅ Done",
      },
      {
        id: "p2-1",
        text: "Prompt 2: Supabase Schema — migration applied, tables confirmed",
        dep: "✅ Done",
      },
      {
        id: "p2-2",
        text: "Prompt 3: Auth + App Shell — signup → login → dashboard flow working",
        dep: "✅ Done",
      },
      {
        id: "p2-3",
        text: "Prompt 4: Onboarding Wizard — 8-step wizard saves to Supabase, redirects to dashboard",
      },
      {
        id: "p2-4",
        text: "Prompt GHL: Sub-Account Provisioning — GHL client, provisioning orchestrator, webhook receiver",
      },
      {
        id: "p2-5",
        text: "Prompt 5: Recipe Marketplace — 14 recipe cards, activation/deactivation wired to GHL webhooks",
      },
      {
        id: "p2-6",
        text: "Prompt 6: Dashboard — KPI tiles, activity feed, provisioning banner",
      },
      {
        id: "p2-7",
        text: "Prompt 7: Settings — business profile, AI voice, notifications, integrations tab",
      },
      {
        id: "p2-8",
        text: "Prompt 10: Billing — Stripe checkout, trial gate, subscription management",
      },
      {
        id: "p2-9",
        text: "Prompt Cron: Vercel Cron — scheduled recipe trigger processor",
      },
    ],
  },
  {
    num: 3,
    title: "Deploy n8n on Railway",
    timeLabel: "~1-2 hours",
    tasks: [
      {
        id: "p3-0",
        text: "Deploy n8n template on Railway (Docker image + Postgres)",
      },
      {
        id: "p3-1",
        text: "Configure all env vars (see implementation plan doc Section 2.2)",
      },
      {
        id: "p3-2",
        text: "Custom domain: n8n.vector48.com → Railway CNAME + SSL confirmed",
      },
      { id: "p3-3", text: "Basic auth enabled for n8n editor UI" },
      {
        id: "p3-4",
        text: "Test webhook: create a simple Webhook → Respond to Webhook workflow, activate, curl it — get 200 back",
      },
      {
        id: "p3-5",
        text: "Error Workflow configured: Settings → Error Workflow → set up failure alerting (Slack/email/SMS)",
      },
      {
        id: "p3-6",
        text: "Uptime monitor set up (Uptime Robot or similar) pinging /healthz every 60s",
      },
      {
        id: "p3-7",
        text: "Migrate any existing workflows from n8n cloud (export JSON → import)",
      },
    ],
  },
  {
    num: 4,
    title: "Build n8n Recipe Workflows",
    timeLabel: "~8-12 hours in n8n editor",
    tasks: [
      {
        id: "p4-0",
        text: "Set up n8n credentials: Supabase (HTTP Request with service role key), Claude API, OpenAI API",
      },
      {
        id: "p4-1",
        text: "Recipe 1: AI Phone Answering — webhook receives post-call data from GHL Voice AI → Claude summarizes → SMS to owner → event_log",
      },
      {
        id: "p4-2",
        text: "Recipe 2: Missed Call Text-Back — webhook receives missed call event → GPT-4o generates text-back → GHL sends SMS to caller → SMS to owner → event_log",
      },
      {
        id: "p4-3",
        text: "Recipe 3: Review Request — webhook from Vercel Cron → fetch contact → GPT-4o generates review request → GHL sends SMS → event_log",
      },
      {
        id: "p4-4",
        text: "Recipe 4: Estimate Follow-Up — webhook from Cron → check opportunity status → GPT-4o generates follow-up → GHL sends SMS/email → event_log",
      },
      {
        id: "p4-5",
        text: "Recipe 5: Appointment Reminder — webhook from Cron → fetch appointment → GPT-4o generates reminder → GHL sends SMS → event_log",
      },
      {
        id: "p4-6",
        text: "All 5 workflows: final node writes to Supabase event_log via HTTP Request",
      },
      {
        id: "p4-7",
        text: "All 5 workflows: first node fetches customer config + GHL credentials from Supabase by account_id",
      },
      { id: "p4-8", text: "All 5 workflows activated in n8n" },
    ],
  },
  {
    num: 5,
    title: "Environment Variables",
    timeLabel: "~30 min",
    tasks: [],
  },
  {
    num: 6,
    title: "End-to-End Test",
    timeLabel: "~2-3 hours",
    tasks: [
      {
        id: "p6-0",
        boldLead: "Full signup flow:",
        text: " Create account → complete onboarding → confirm GHL sub-account appears in admin",
      },
      {
        id: "p6-1",
        boldLead: "Voice AI test:",
        text: " Call the assigned phone number → talk to the AI → confirm it greets with the correct business name",
      },
      {
        id: "p6-2",
        boldLead: "Recipe 1 test:",
        text: " After Voice AI call completes → confirm n8n receives post-call webhook → confirm SMS summary sent to owner → confirm event_log row written → confirm dashboard shows the event",
      },
      {
        id: "p6-3",
        boldLead: "Recipe 2 test:",
        text: " Trigger a missed call → confirm text-back SMS sent to caller → confirm owner notified → confirm event_log",
      },
      {
        id: "p6-4",
        boldLead: "Recipe 3 test:",
        text: " Mark an opportunity as 'won' in GHL → confirm recipe_triggers row created → wait for cron (or manually fire) → confirm review request SMS sent",
      },
      {
        id: "p6-5",
        boldLead: "Recipe 4 test:",
        text: " Create an opportunity in GHL → confirm two recipe_triggers rows (24h + 48h) → manually fire → confirm follow-up sent",
      },
      {
        id: "p6-6",
        boldLead: "Recipe 5 test:",
        text: " Create appointment in GHL → confirm recipe_triggers rows → manually fire → confirm reminder SMS sent",
      },
      {
        id: "p6-7",
        boldLead: "Dashboard test:",
        text: " After running recipes → confirm KPI tiles update → confirm activity feed shows events with correct descriptions",
      },
      {
        id: "p6-8",
        boldLead: "Settings test:",
        text: " Change business name → confirm GHL sub-account name updates → change AI greeting → confirm Voice AI agent updates",
      },
      {
        id: "p6-9",
        boldLead: "Billing test:",
        text: " Let trial expire → confirm trial gate activates → subscribe via Stripe test mode → confirm access restored → confirm recipes reactivate",
      },
      {
        id: "p6-10",
        boldLead: "Deactivation test:",
        text: " Deactivate a recipe → confirm GHL webhook removed → confirm events stop flowing",
      },
      {
        id: "p6-11",
        boldLead: "Mobile test:",
        text: " Run full flow on iPhone/Android — onboarding, marketplace, dashboard, settings",
      },
    ],
  },
  {
    num: 7,
    title: "Launch Prep",
    timeLabel: "~2-4 hours",
    tasks: [
      {
        id: "p7-0",
        text: "Switch Stripe to live mode — update all STRIPE_ env vars in Vercel",
      },
      {
        id: "p7-1",
        text: "Set up Stripe webhook endpoint for production URL",
      },
      {
        id: "p7-2",
        text: "Configure Supabase Auth email templates (confirmation, password reset)",
      },
      { id: "p7-3", text: "Set up error tracking: Sentry or similar on Vercel" },
      {
        id: "p7-4",
        text: "Set up Supabase database backups (automatic on Pro plan)",
      },
      {
        id: "p7-5",
        text: "Review all console.log statements — remove or convert to structured logging",
      },
      {
        id: "p7-6",
        text: "Landing page / marketing site ready (if separate from the app)",
      },
      {
        id: "p7-7",
        text: "Reach out to James (BUILTECH / bestconstructionapps.com) for trades distribution channel",
      },
    ],
  },
];

export const envTableRows: EnvTableRow[] = [
  {
    variable: "NEXT_PUBLIC_SUPABASE_URL",
    where: "Vercel",
    source: "Supabase project settings",
  },
  {
    variable: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    where: "Vercel",
    source: "Supabase project settings",
  },
  {
    variable: "SUPABASE_SERVICE_ROLE_KEY",
    where: "Vercel",
    source: "Supabase project settings",
  },
  {
    variable: "GHL_AGENCY_TOKEN",
    where: "Vercel",
    source: "GHL → Settings → Private Integrations",
  },
  {
    variable: "GHL_API_BASE_URL",
    where: "Vercel",
    source: "https://services.leadconnectorhq.com",
  },
  {
    variable: "GHL_API_VERSION",
    where: "Vercel",
    source: "2021-07-28",
  },
  {
    variable: "N8N_WEBHOOK_BASE_URL",
    where: "Vercel",
    source: "https://n8n.vector48.com/webhook",
  },
  {
    variable: "CRON_SECRET",
    where: "Vercel",
    source: "Generate: openssl rand -hex 32",
  },
  {
    variable: "STRIPE_SECRET_KEY",
    where: "Vercel",
    source: "Stripe dashboard → API keys",
  },
  {
    variable: "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
    where: "Vercel",
    source: "Stripe dashboard → API keys",
  },
  {
    variable: "STRIPE_WEBHOOK_SECRET",
    where: "Vercel",
    source: "Stripe → Webhooks → endpoint signing secret",
  },
  {
    variable: "STRIPE_STARTER_PRICE_ID",
    where: "Vercel",
    source: "Stripe → Products → Starter → Price ID",
  },
  {
    variable: "STRIPE_GROWTH_PRICE_ID",
    where: "Vercel",
    source: "Stripe → Products → Growth → Price ID",
  },
  {
    variable: "STRIPE_PRO_PRICE_ID",
    where: "Vercel",
    source: "Stripe → Products → Pro → Price ID",
  },
  {
    variable: "N8N_ENCRYPTION_KEY",
    where: "Railway",
    source: "Generate: openssl rand -hex 16",
  },
  {
    variable: "N8N_BASIC_AUTH_USER",
    where: "Railway",
    source: "Your choice",
  },
  {
    variable: "N8N_BASIC_AUTH_PASSWORD",
    where: "Railway",
    source: "Strong password",
  },
];

export const launchSummaryParagraphs: LaunchSummaryParagraph[] = [
  {
    lead: "Focused solo build:",
    body: " 25-40 hours across all phases. With Claude Code acceleration, the front-end prompts (Phase 2) take 8-12 hours. n8n workflows (Phase 4) take another 8-12 hours. Everything else is config and testing.",
  },
  {
    lead: "Calendar time:",
    body: " 2-3 weeks at part-time pace. 1 week if you go heads-down.",
  },
  {
    lead: "Monthly infrastructure cost at launch:",
    body: " GHL Agency Pro ($497) + Railway ($15-30) + Vercel Pro ($20) + Supabase Pro ($25) + Stripe (2.9% + $0.30 per transaction) = ~$560/mo fixed before first customer.",
  },
];
