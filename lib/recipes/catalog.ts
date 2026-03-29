import type { RecipeCatalogEntry } from "./types";

export const RECIPE_CATALOG: RecipeCatalogEntry[] = [
  // ── Awareness (2) ─────────────────────────────────────────
  {
    slug: "google-review-booster",
    name: "Google Review Booster",
    description:
      "Automatically request Google reviews after completed jobs to build your online reputation and attract new customers.",
    icon: "star",
    funnelStage: "awareness",
    vertical: null,
    releasePhase: "ga",
  },
  {
    slug: "seasonal-campaign",
    name: "Seasonal Campaign",
    description:
      "Send targeted seasonal promotions to past customers — AC tune-ups in spring, furnace checks in fall, and more.",
    icon: "megaphone",
    funnelStage: "awareness",
    vertical: "hvac",
    releasePhase: "coming_soon",
  },

  // ── Capture (4) ────────────────────────────────────────────
  {
    slug: "ai-phone-answering",
    name: "AI Phone Answering",
    description:
      "Never miss a call. An AI receptionist answers 24/7, qualifies leads, and books appointments on your calendar.",
    icon: "phone",
    funnelStage: "capture",
    vertical: null,
    releasePhase: "ga",
  },
  {
    slug: "missed-call-text-back",
    name: "Missed Call Text-Back",
    description:
      "Instantly text leads who called but didn't get through, keeping them engaged before they call a competitor.",
    icon: "message-square",
    funnelStage: "capture",
    vertical: null,
    releasePhase: "ga",
  },
  {
    slug: "web-form-auto-response",
    name: "Web Form Auto-Response",
    description:
      "Respond to website form submissions in under 60 seconds with a personalized text and email.",
    icon: "file-text",
    funnelStage: "capture",
    vertical: null,
    releasePhase: "ga",
  },
  {
    slug: "after-hours-capture",
    name: "After-Hours Capture",
    description:
      "Capture and qualify leads that come in outside business hours so no opportunity slips through overnight.",
    icon: "moon",
    funnelStage: "capture",
    vertical: null,
    releasePhase: "coming_soon",
  },

  // ── Nurture (3) ────────────────────────────────────────────
  {
    slug: "lead-nurture-sequence",
    name: "Lead Nurture Sequence",
    description:
      "Drip-feed texts and emails to leads who didn't book right away, keeping your business top-of-mind.",
    icon: "mail",
    funnelStage: "nurture",
    vertical: null,
    releasePhase: "ga",
  },
  {
    slug: "estimate-follow-up",
    name: "Estimate Follow-Up",
    description:
      "Automatically follow up on open estimates with a friendly reminder to move the deal forward.",
    icon: "clipboard-check",
    funnelStage: "nurture",
    vertical: null,
    releasePhase: "ga",
  },
  {
    slug: "re-engage-dormant-leads",
    name: "Re-Engage Dormant Leads",
    description:
      "Win back cold leads with periodic check-ins and special offers after 30, 60, and 90 days of inactivity.",
    icon: "refresh-cw",
    funnelStage: "nurture",
    vertical: null,
    releasePhase: "coming_soon",
  },

  // ── Close (3) ──────────────────────────────────────────────
  {
    slug: "appointment-reminder",
    name: "Appointment Reminder",
    description:
      "Reduce no-shows with automated SMS and email reminders 24 hours and 1 hour before appointments.",
    icon: "calendar-check",
    funnelStage: "close",
    vertical: null,
    releasePhase: "ga",
  },
  {
    slug: "rebook-reschedule",
    name: "Rebook & Reschedule",
    description:
      "When a customer cancels, instantly offer alternative times to rebook instead of losing the job.",
    icon: "calendar-clock",
    funnelStage: "close",
    vertical: null,
    releasePhase: "ga",
  },
  {
    slug: "instant-invoice",
    name: "Instant Invoice",
    description:
      "Send a branded invoice via text right after job completion so you get paid faster.",
    icon: "receipt",
    funnelStage: "close",
    vertical: null,
    releasePhase: "coming_soon",
  },

  // ── Delight (2) ────────────────────────────────────────────
  {
    slug: "post-job-check-in",
    name: "Post-Job Check-In",
    description:
      "Follow up 3 days after service to ensure satisfaction and catch issues before they become bad reviews.",
    icon: "heart-handshake",
    funnelStage: "delight",
    vertical: null,
    releasePhase: "ga",
  },
  {
    slug: "maintenance-reminder",
    name: "Maintenance Reminder",
    description:
      "Remind past customers when it's time for annual maintenance, generating repeat revenue on autopilot.",
    icon: "wrench",
    funnelStage: "delight",
    vertical: null,
    releasePhase: "ga",
  },
];
