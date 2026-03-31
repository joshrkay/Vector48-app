// ---------------------------------------------------------------------------
// Recipe Catalog — Static definitions for all 14 automation recipes.
// This is the single source of truth for recipe metadata.
// Read-only at runtime — no database table backs this.
//
// NOTE: verticalMessages are realistic samples. Review against the PRD
// (sections 7 & 25) when available and replace as needed.
// ---------------------------------------------------------------------------

import type { RecipeDefinition } from "@/types/recipes";

export const RECIPE_CATALOG: RecipeDefinition[] = [
  // ── Capture (2) ────────────────────────────────────────────
  {
    slug: "google-review-booster",
    name: "Google Review Booster",
    description:
      "Automatically request Google reviews after completed jobs to build your online reputation and attract new customers.",
    detailedDescription:
      "After a job is marked complete, automatically send a friendly SMS with a link to leave a Google review.",
    icon: "star",
    funnelStage: "capture",
    vertical: null,
    releasePhase: "v1",
    marketplaceListing: "available",
    trigger: "Job marked complete in your CRM.",
    output: "Review request SMS sent to the customer.",
    requiredIntegrations: [],
    optionalIntegrations: [],
    configFields: [],
    verticalMessages: {
      hvac: "",
      plumbing: "",
      electrical: "",
      roofing: "",
      landscaping: "",
    },
    estimatedROI: "—",
  },
  {
    slug: "seasonal-campaign",
    name: "Seasonal Campaign",
    description:
      "Send targeted seasonal promotions to past customers — AC tune-ups in spring, furnace checks in fall, and more.",
    detailedDescription:
      "Seasonal SMS campaigns tailored to your trade and service area.",
    icon: "megaphone",
    funnelStage: "capture",
    vertical: "hvac",
    releasePhase: "v1",
    marketplaceListing: "coming_soon",
    trigger: "Seasonal schedule or manual campaign start.",
    output: "Promotional messages to your customer list.",
    requiredIntegrations: [],
    optionalIntegrations: [],
    configFields: [],
    verticalMessages: {
      hvac: "",
      plumbing: "",
      electrical: "",
      roofing: "",
      landscaping: "",
    },
    estimatedROI: "—",
  },

  // ── Capture (4) ────────────────────────────────────────────
  {
    slug: "ai-phone-answering",
    name: "AI Phone Answering",
    description:
      "AI answers missed and after-hours calls, captures lead info, and texts you a summary.",
    detailedDescription:
      "When an inbound call goes unanswered or arrives after hours, an AI voice agent answers within 2 rings. It introduces itself using your business name and greeting, collects the caller's name, job description, and preferred callback time, then sends you an SMS summary within 60 seconds.",
    funnelStage: "capture",
    releasePhase: "v1",
    marketplaceListing: "available",
    icon: "Phone",
    trigger: "Inbound call goes unanswered or arrives after business hours.",
    output:
      "SMS to owner within 60 seconds: caller name, callback number, job description, urgency level.",
    requiredIntegrations: ["twilio", "elevenlabs"],
    optionalIntegrations: [],
    configFields: [
      {
        name: "voiceGender",
        label: "Voice",
        type: "select",
        required: true,
        defaultFromProfile: "voice_gender",
        options: [
          { value: "male", label: "Male" },
          { value: "female", label: "Female" },
        ],
      },
      {
        name: "voiceGreeting",
        label: "AI greeting script",
        type: "textarea",
        required: true,
        defaultFromProfile: "greeting_text",
        helpText: "Greeting your AI uses when answering calls.",
      },
      {
        name: "forwardingNumber",
        label: "Live Transfer Number",
        type: "text",
        required: false,
      },
      {
        name: "businessHoursSummary",
        label: "Business Hours (for AI context)",
        type: "text",
        required: false,
        defaultFromProfile: "business_hours",
      },
    ],
    verticalMessages: {
      hvac: "Hi, you've reached [Business]. I'm out on a job right now but I want to make sure we take care of you...",
      plumbing:
        "Thanks for calling [Business]. We handle everything from leaks to full remodels...",
      electrical:
        "Hi, you've reached [Business]. Whether it's a panel upgrade or an emergency, we've got you covered...",
      roofing:
        "Hi, this is [Business]. If you're dealing with storm damage or a leak, you've called the right place...",
      landscaping:
        "Thanks for calling [Business]. We'd love to help with your lawn or landscape project...",
    },
    estimatedROI: "Recovers 30-40% of missed calls as captured leads.",
  },

  {
    slug: "missed-call-text-back",
    name: "Missed Call Text-Back",
    description:
      "Sends an instant SMS when you miss a call, inviting the caller to text back.",
    detailedDescription:
      "Within 90 seconds of a missed call, a conversational SMS is sent from your business number. It acknowledges the missed call, invites a text reply, and offers to book a time. Any reply routes to your inbox.",
    funnelStage: "capture",
    releasePhase: "v1",
    marketplaceListing: "available",
    icon: "MessageSquare",
    trigger: "Inbound call missed and not answered by AI Phone Answering.",
    output: "Caller receives instant text. Replies route to your inbox.",
    requiredIntegrations: [],
    optionalIntegrations: [],
    configFields: [
      {
        name: "textBackMessage",
        label: "Custom text-back message (optional)",
        type: "textarea",
        required: false,
        helpText: "Leave blank for our default message tuned to your trade.",
      },
      {
        name: "textBackDelaySec",
        label: "Delay Before Sending (seconds)",
        type: "number",
        required: false,
      },
    ],
    verticalMessages: {
      hvac: "Hey, we just missed your call at [Business]. What's going on with your system? Reply here and we'll get back to you fast.",
      plumbing:
        "Sorry we missed you! This is [Business]. What can we help with? Reply anytime.",
      electrical:
        "Hey, we missed your call at [Business]. Need something electrical looked at? Shoot us a text here.",
      roofing:
        "Sorry we missed you! This is [Business]. Dealing with a roof issue? Tell us what's going on.",
      landscaping:
        "Sorry we missed you! This is [Business]. What can we help you with? Reply anytime.",
    },
    estimatedROI: "Captures leads that would otherwise call a competitor.",
  },

  // ── ENGAGE ─────────────────────────────────────────────────────────────────

  {
    slug: "new-lead-instant-response",
    name: "New Lead Instant Response",
    description:
      "Contacts new leads via SMS and email within 90 seconds of arriving.",
    detailedDescription:
      "When a new lead enters via web form, ad click, or missed call log, an immediate SMS and email are sent within 90 seconds. A follow-up goes out at 24h and 72h if no response. Sequence stops when the lead replies or books.",
    funnelStage: "engage",
    releasePhase: "v1",
    marketplaceListing: "available",
    icon: "Zap",
    trigger: "New lead enters system via web form, ad click, or missed call log.",
    output: "Full sequence activity logged per lead. Replies route to inbox.",
    requiredIntegrations: [],
    optionalIntegrations: [],
    configFields: [
      {
        name: "responseMessage",
        label: "First response SMS (optional)",
        type: "textarea",
        required: false,
        helpText: "Leave blank for our default tuned to your trade.",
      },
      {
        name: "responseDelaySec",
        label: "Send follow-ups at 24h and 72h",
        type: "toggle",
        required: false,
        defaultValue: true,
      },
    ],
    verticalMessages: {
      hvac: "Hi [Name], this is [Business]. Got your message — we're on it. When works for a quick call today?",
      plumbing:
        "Hi [Name], this is [Business]. We got your message about a plumbing issue. When's a good time to talk?",
      electrical:
        "Hi [Name], this is [Business]. Got your message about an electrical issue — we're on it. When works for a quick call today?",
      roofing:
        "Hey [Name], saw your inquiry about a roof inspection. We're booking this week — want to grab a spot?",
      landscaping:
        "Hi [Name], this is [Business]. Thanks for reaching out about your lawn care needs. When can we chat?",
    },
    estimatedROI: "78% of jobs go to the first responder. Sub-2-minute response rate.",
  },

  {
    slug: "lead-qualification",
    name: "Lead Qualification via SMS",
    description:
      "AI asks 2-3 qualifying questions via text to score and route new leads.",
    detailedDescription:
      "When a new lead arrives with no job details, AI sends a short conversational SMS asking qualifying questions: work type, property type, timeline, and location. Responses are parsed into a lead score. High-urgency leads are flagged for immediate callback.",
    funnelStage: "engage",
    releasePhase: "v2",
    marketplaceListing: "available",
    icon: "ClipboardCheck",
    trigger: "New inbound lead with no job details.",
    output:
      "Lead record enriched with job type, property, urgency score, and AI summary.",
    requiredIntegrations: [],
    optionalIntegrations: [],
    configFields: [
      {
        name: "qualificationQuestions",
        label: "Urgency threshold",
        type: "select",
        required: true,
        options: [
          { value: "emergency", label: "Emergency only (active leak, no heat/AC)" },
          { value: "same_week", label: "Needs service this week" },
          { value: "any", label: "Any interested lead" },
        ],
      },
      {
        name: "qualifiedTag",
        label: "Tag for Qualified Leads",
        type: "text",
        required: true,
      },
      {
        name: "unqualifiedTag",
        label: "Tag for Unqualified Leads",
        type: "text",
        required: false,
      },
    ],
    verticalMessages: {
      hvac: "Hey [Name] — is your AC completely out or just not cooling well? Helps us know how fast to get someone out.",
      plumbing:
        "Hi [Name]! Quick question — is this more of an emergency (active leak, no hot water) or can it wait a few days?",
      electrical:
        "Hi [Name] — is this something that needs attention right away, or more of a planned project?",
      roofing:
        "Hey [Name] — are you dealing with an active leak, or looking for an inspection/estimate?",
      landscaping:
        "Hi [Name] — are you looking for a one-time job or ongoing lawn care? Helps us give you the right quote.",
    },
    estimatedROI: "Office staff only call back leads worth their time.",
  },

  // ── CLOSE ──────────────────────────────────────────────────────────────────

  {
    slug: "estimate-follow-up",
    name: "Estimate & Quote Follow-Up",
    description:
      "Automated follow-up sequence after sending an estimate: 24h, 48h, and 5 days.",
    detailedDescription:
      "After an estimate is sent, follow-up messages go out at 24h, 48h, and 5-day intervals. Tone shifts from informational to light urgency. AI personalizes based on job type. Stops on booking or explicit decline.",
    funnelStage: "close",
    releasePhase: "v1",
    marketplaceListing: "available",
    icon: "FileText",
    trigger: "Estimate sent to prospect (CRM status change or manual tag).",
    output: "Follow-up activity and delivery status logged per lead.",
    requiredIntegrations: [],
    optionalIntegrations: ["jobber", "servicetitan"],
    configFields: [
      {
        name: "followUpMessage",
        label: "Estimate follow-up message",
        type: "textarea",
        required: true,
      },
      {
        name: "followUpStep1DelayHours",
        label: "First follow-up (hours after estimate)",
        type: "number",
        required: true,
        defaultValue: 24,
        helpText:
          "Typically 24. Tone: informational check-in.",
      },
      {
        name: "followUpStep2DelayHours",
        label: "Second follow-up (hours after estimate)",
        type: "number",
        required: true,
        defaultValue: 48,
        helpText:
          "Typically 48. Tone: answer questions / light nudge.",
      },
      {
        name: "followUpStep3DelayHours",
        label: "Third follow-up (hours after estimate)",
        type: "number",
        required: true,
        defaultValue: 120,
        helpText:
          "Typically 120 (5 days). Tone: light urgency before closing the loop.",
      },
    ],
    verticalMessages: {
      hvac: "Hi [Name], wanted to follow up on the estimate we sent for your AC. We have openings this week if you're ready to move forward.",
      plumbing:
        "Hey [Name] — just checking in on that plumbing estimate. Any questions we can answer?",
      electrical:
        "Hi [Name], following up on the estimate for your panel upgrade. Happy to walk through anything.",
      roofing:
        "Hi [Name], wanted to follow up on the estimate we sent for your roof. We have a crew available next week if you're ready.",
      landscaping:
        "Hey [Name] — spring slots are filling up fast. Want to lock in your lawn care plan?",
    },
    estimatedROI: "Recovers 15-25% of quotes that would otherwise go cold.",
  },

  {
    slug: "seasonal-demand-outreach",
    name: "Seasonal Demand Outreach",
    description:
      "AI-generated seasonal campaigns to your contact list at peak-demand times.",
    detailedDescription:
      "At the start of high-demand seasons, AI generates and sends targeted outreach to your contact list. Messages are specific to your vertical and season. Engaged contacts route to booking. Non-responders suppressed for 30 days.",
    funnelStage: "close",
    releasePhase: "v2",
    marketplaceListing: "available",
    icon: "Sun",
    trigger: "Scheduled campaign trigger (date-based or weather-event-based).",
    output: "Campaign send log, open/reply rates, and bookings in dashboard.",
    requiredIntegrations: [],
    optionalIntegrations: [],
    configFields: [
      {
        name: "seasonalMessage",
        label: "Seasonal Campaign Message",
        type: "textarea",
        required: true,
      },
      {
        name: "seasonName",
        label: "Season / Campaign Name",
        type: "text",
        required: true,
      },
      {
        name: "campaignStartDate",
        label: "Campaign Start Date",
        type: "text",
        required: true,
      },
    ],
    verticalMessages: {
      hvac: "AC tune-up season is here. Last year we found issues in 1 in 3 units we inspected. Book before the heat hits.",
      plumbing:
        "Freeze warnings coming. Get your pipes winterized before the cold hits — takes about an hour.",
      electrical:
        "Storm season is coming. Now's the time to check your generator and surge protection. We have openings this week.",
      roofing:
        "Major storm came through last night. We're doing free roof inspections this week for [City] homeowners — spots are limited.",
      landscaping:
        "Time to get your lawn ready. We have early-season openings available — book before they fill up.",
    },
    estimatedROI: "Fills schedule during peak demand without manual blasts.",
  },

  // ── DELIVER ────────────────────────────────────────────────────────────────

  {
    slug: "appointment-reminder",
    name: "Appointment Reminder & Confirmation",
    description:
      "Sends reminders 24h and 2h before appointments with one-tap confirm/reschedule.",
    detailedDescription:
      "Reminder SMS sent 24 hours and 2 hours before each appointment. Customer confirms or reschedules with a single tap. Cancellations trigger an automatic re-booking flow offering the next two available slots.",
    funnelStage: "deliver",
    releasePhase: "v1",
    marketplaceListing: "available",
    icon: "Bell",
    trigger: "Appointment created or confirmed in system.",
    output: "Confirmation status per appointment. Cancellations surface as alerts.",
    requiredIntegrations: [],
    optionalIntegrations: ["jobber", "servicetitan"],
    configFields: [
      {
        name: "reminderMessage",
        label: "Reminder Message",
        type: "textarea",
        required: true,
      },
      {
        name: "reminderHoursBefore",
        label: "Hours Before Appointment (24 or 2)",
        type: "number",
        required: true,
        helpText: "Use 24 and 2 with separate activations if needed.",
      },
    ],
    verticalMessages: {
      hvac: "Your AC tune-up is tomorrow at 2pm. Our tech will call when they're 30 min away. Reply C to confirm.",
      plumbing:
        "Reminder: [Tech] from [Business] is scheduled tomorrow at 10am for your plumbing service. Reply C to confirm or R to reschedule.",
      electrical:
        "Reminder: [Tech] from [Business] is scheduled tomorrow at 10am for your panel inspection. Reply C to confirm or R to reschedule.",
      roofing:
        "Your roof inspection is scheduled for tomorrow at 9am. We'll call 30 min before arrival. Reply C to confirm.",
      landscaping:
        "Reminder: [Business] is coming tomorrow at 8am for your lawn service. Reply C to confirm.",
    },
    estimatedROI: "Eliminates most no-shows and auto-recovers cancellations.",
  },

  {
    slug: "tech-on-the-way",
    name: "Tech On-The-Way Notification",
    description:
      "Texts the customer when your tech is dispatched with name and ETA.",
    detailedDescription:
      "When a technician is dispatched, AI texts the customer with the tech's first name and estimated arrival window. If no confirmation that someone is home, a follow-up is sent 30 minutes before arrival.",
    funnelStage: "deliver",
    releasePhase: "v2",
    marketplaceListing: "available",
    icon: "Truck",
    trigger: "Technician dispatched to a job (CRM status change or manual trigger).",
    output: "Dispatch notification logged. Unconfirmed jobs surface as alerts.",
    requiredIntegrations: [],
    optionalIntegrations: ["jobber", "servicetitan"],
    configFields: [
      {
        name: "onTheWayMessage",
        label: "On-The-Way Message",
        type: "textarea",
        required: true,
      },
      {
        name: "includeTechName",
        label: "Include Technician Name",
        type: "boolean",
        required: false,
      },
    ],
    verticalMessages: {
      hvac: "Your tech [Name] is heading to you now — ETA about 45 minutes. They'll call when they're close.",
      plumbing:
        "Hi [Name], [Tech] from [Business] is on his way and should arrive between 1:00-1:30pm. Reply YES if someone will be home.",
      electrical:
        "[Tech] from [Business] is on the way — should be there in about 30 minutes.",
      roofing:
        "Hi [Name], our crew is heading to your property now. ETA 45 minutes. They'll call on arrival.",
      landscaping:
        "[Business] crew is on the way for your lawn service. Should arrive within the hour.",
    },
    estimatedROI: "Reduces wasted truck rolls from no-one-home scenarios.",
  },

  // ── RETAIN ─────────────────────────────────────────────────────────────────

  {
    slug: "review-request",
    name: "Review Request Automation",
    description:
      "Sends a personalized review request 2-4 hours after job completion.",
    detailedDescription:
      "After a job is marked complete, AI sends a personalized SMS referencing the work done and including a direct Google review link. One follow-up at 48 hours if no action. Negative sentiment in replies is flagged to the owner before it becomes a public review.",
    funnelStage: "retain",
    releasePhase: "v1",
    marketplaceListing: "available",
    icon: "Star",
    trigger: "Job marked complete in CRM or manual trigger.",
    output: "Review request send and response logged. Negative sentiment flagged.",
    requiredIntegrations: [],
    optionalIntegrations: ["google_business"],
    configFields: [
      {
        name: "reviewPlatform",
        label: "Review Platform",
        type: "select",
        required: true,
        options: [
          { value: "google", label: "Google" },
          { value: "yelp", label: "Yelp" },
          { value: "facebook", label: "Facebook" },
        ],
      },
      {
        name: "reviewRequestMessage",
        label: "Review Request Message",
        type: "textarea",
        required: true,
      },
      {
        name: "reviewRequestDelayHours",
        label: "Hours after job completion to send",
        type: "number",
        required: false,
        helpText: "Recommended: 2-4 hours after completion.",
      },
    ],
    verticalMessages: {
      hvac: "Hi [Name], hope the AC repair went smoothly today. If you have a minute, we'd love a quick Google review — it means a lot. [Link]",
      plumbing:
        "Thanks for choosing [Business] for your plumbing work, [Name]. Mind leaving us a quick review? [Link]",
      electrical:
        "Hi [Name], hope everything's working great after today's electrical work. A Google review would really help us out! [Link]",
      roofing:
        "Hi [Name], hope the roof repair went smoothly today. If you have a minute, we'd love a quick Google review. [Link]",
      landscaping:
        "Thanks for having us out today, [Name]. Your lawn is looking great! Mind leaving us a quick review? [Link]",
    },
    estimatedROI: "Increases Google reviews by 3-5x with no effort.",
  },

  {
    slug: "post-job-upsell",
    name: "Post-Job Follow-Up & Upsell",
    description:
      "Checks in 5-7 days after a job and introduces a related service.",
    detailedDescription:
      "AI sends a follow-up 5-7 days after job completion. Checks in on the work, offers to answer questions, and introduces a relevant related service. No hard sell — purely informational with a soft CTA.",
    funnelStage: "retain",
    releasePhase: "v2",
    marketplaceListing: "available",
    icon: "TrendingUp",
    trigger: "Job completed + review request sent (or 7 days post-job).",
    output: "Message sent. Replies route to inbox. Bookings attributed.",
    requiredIntegrations: [],
    optionalIntegrations: [],
    configFields: [
      {
        name: "upsellMessage",
        label: "Upsell Message Template",
        type: "textarea",
        required: true,
      },
      {
        name: "upsellDelayDays",
        label: "Days after job to send follow-up",
        type: "number",
        required: true,
        defaultValue: 7,
      },
    ],
    verticalMessages: {
      hvac: "Hope your AC is running great! Most systems over 8 years old benefit from an annual tune-up. We can usually get that done in under an hour. Want us to book one?",
      plumbing:
        "Just checking in — is everything draining well? If it was a recurring issue, a camera inspection can tell us exactly what's going on. About $150 and takes 20 minutes.",
      electrical:
        "Hope everything's working well after the repair! If your home is over 20 years old, a full panel inspection is worth doing. Takes about an hour.",
      roofing:
        "Hope the repair is holding up! If you haven't had a full inspection in a few years, we offer a free one for past customers. Worth doing before winter.",
      landscaping:
        "Hope the yard is looking good! We also offer seasonal fertilization and weed control — keeps things looking great year-round. Want details?",
    },
    estimatedROI: "Generates 10-15% additional revenue from existing customers.",
  },

  {
    slug: "maintenance-plan-enrollment",
    name: "Maintenance Plan Enrollment",
    description:
      "Offers your maintenance plan to new customers 7 days after their first job.",
    detailedDescription:
      "7 days after a new customer's first job, AI sends a message introducing your maintenance or service plan. Describes what's included, cost, and benefit. Soft opt-in CTA. Interested customers route to booking or payment.",
    funnelStage: "retain",
    releasePhase: "v2",
    marketplaceListing: "available",
    icon: "Repeat",
    trigger: "First job completed with a new customer.",
    output: "Enrollment interest logged. Opt-ins tagged for recurring service.",
    requiredIntegrations: [],
    optionalIntegrations: [],
    configFields: [
      {
        name: "maintenancePlanMessage",
        label: "Maintenance Plan Message",
        type: "textarea",
        required: true,
      },
      {
        name: "maintenancePlanLink",
        label: "Sign-Up Link",
        type: "text",
        required: false,
      },
      {
        name: "enrollmentDelayDays",
        label: "Days After Job to Send",
        type: "number",
        required: true,
      },
    ],
    verticalMessages: {
      hvac: "A lot of our customers sign up for our annual maintenance plan after their first service. Two visits a year, priority scheduling, and we catch issues before they get expensive. Want details?",
      plumbing:
        "We offer an annual plumbing check-up plan — includes a full inspection, drain cleaning, and priority service. Saves you money long-term. Interested?",
      electrical:
        "We offer an annual electrical safety plan — panel inspection, outlet testing, and priority scheduling. Peace of mind for about the cost of a dinner out.",
      roofing:
        "We offer an annual roof maintenance plan — inspections twice a year plus priority scheduling for repairs. Catches small issues before they become big ones.",
      landscaping:
        "Did you know we offer a full-season lawn care program? Weekly cuts, fertilization, and fall cleanup — all handled. Want me to send you pricing?",
    },
    estimatedROI: "Recurring maintenance contracts are the highest-margin trades revenue.",
  },

  // ── REACTIVATE ─────────────────────────────────────────────────────────────

  {
    slug: "customer-reactivation",
    name: "Customer Reactivation",
    description:
      "Re-engages customers who haven't had a job in 90+ days.",
    detailedDescription:
      "AI identifies dormant customers (90+ days since last interaction) and sends a warm re-engagement message referencing their last job. One follow-up at 7 days. Then suppressed for 90 days.",
    funnelStage: "reactivate",
    releasePhase: "v2",
    marketplaceListing: "available",
    icon: "UserPlus",
    trigger: "Customer has not had a job or interaction in 90+ days.",
    output: "Reactivation sends and responses logged. Bookings attributed.",
    requiredIntegrations: [],
    optionalIntegrations: [],
    configFields: [
      {
        name: "reactivationMessage",
        label: "Reactivation Message",
        type: "textarea",
        required: true,
      },
      {
        name: "inactiveDaysThreshold",
        label: "Consider dormant after (days)",
        type: "number",
        required: true,
        defaultValue: 90,
      },
    ],
    verticalMessages: {
      hvac: "Hi [Name], it's been a while since we last serviced your system. With summer coming, now's a great time for a tune-up. Want to get on the schedule?",
      plumbing:
        "Hey [Name] — just reaching out to see if everything is still running smoothly. If you've got anything on your list, we're booking this week.",
      electrical:
        "Hi [Name], it's been a while! If you've got any electrical projects on the to-do list, we have openings this month.",
      roofing:
        "Hey [Name] — it's been a while since your last service. We're offering free inspections for past customers this month. Interested?",
      landscaping:
        "Hi [Name], spring is here! Ready to get your lawn looking great again? We're booking early-season slots now.",
    },
    estimatedROI: "Turns dormant contact lists into an ongoing revenue source.",
  },

  {
    slug: "unsold-estimate-reactivation",
    name: "Unsold Estimate Reactivation",
    description:
      "Re-engages prospects with estimates older than 14 days that never converted.",
    detailedDescription:
      "AI identifies stalled estimates (14+ days, no booking, no explicit decline) and sends a re-engagement message referencing the original quote. Offers to update if needed. One follow-up at 7 days, then archived.",
    funnelStage: "reactivate",
    releasePhase: "v3",
    marketplaceListing: "available",
    icon: "RefreshCw",
    trigger: "Estimate sent 14+ days ago with no booking and no explicit decline.",
    output: "Reopened jobs tracked. Revenue recovered from cold quotes attributed.",
    requiredIntegrations: [],
    optionalIntegrations: ["jobber", "servicetitan"],
    configFields: [
      {
        name: "reactivationMessage",
        label: "Unsold Estimate Follow-Up Message",
        type: "textarea",
        required: true,
      },
      {
        name: "staleDaysThreshold",
        label: "Reactivate estimates older than (days)",
        type: "number",
        required: true,
        defaultValue: 14,
      },
    ],
    verticalMessages: {
      hvac: "Hi [Name], I know it's been a few weeks since we sent that estimate. If your timeline has changed or you have questions, happy to revisit. Still interested?",
      plumbing:
        "Hey [Name] — following up on that plumbing estimate from a couple weeks back. Pricing is still valid. Want to move forward?",
      electrical:
        "Hi [Name], following up on that estimate for the panel upgrade. If your timeline has changed, happy to revisit. Still interested?",
      roofing:
        "Hey [Name] — following up on that roof estimate from a couple weeks back. Pricing is still valid and we have some openings. Want to move forward?",
      landscaping:
        "Hi [Name] — just circling back on that landscaping estimate. Spring slots are filling up. Want to lock it in?",
    },
    estimatedROI: "Recovers 10-20% of stale estimates with zero effort.",
  },

  {
    slug: "weather-event-outreach",
    name: "Weather Event Outreach",
    description:
      "Auto-sends targeted campaigns within hours of severe weather in your area.",
    detailedDescription:
      "Within hours of a qualifying weather event (heat wave, freeze, major storm), AI generates and sends a targeted campaign to the relevant customer segment. Contacts who engage route to a booking sequence.",
    funnelStage: "reactivate",
    releasePhase: "v3",
    marketplaceListing: "available",
    icon: "CloudLightning",
    trigger: "Severe weather event detected in customer service area.",
    output: "Campaign volume and engagement logged. Bookings attributed.",
    requiredIntegrations: [],
    optionalIntegrations: [],
    configFields: [
      {
        name: "weatherMessage",
        label: "Weather Outreach Message",
        type: "textarea",
        required: true,
      },
      {
        name: "weatherEventType",
        label: "Weather Event Type",
        type: "select",
        required: true,
        options: [
          { value: "storm", label: "Storm" },
          { value: "freeze", label: "Freeze" },
          { value: "heat_wave", label: "Heat Wave" },
          { value: "flooding", label: "Flooding" },
          { value: "hail", label: "Hail" },
        ],
      },
    ],
    verticalMessages: {
      hvac: "Temps hitting [X]° this week in [City]. If your AC hasn't been serviced this year, now's the time. We're booking same-week appointments.",
      plumbing:
        "Freeze warning for [City] tonight. If your irrigation isn't winterized yet, call us today — we have same-day availability.",
      electrical:
        "Power outages reported in [City]. If you need generator service or have storm damage to your electrical, we're available today.",
      roofing:
        "Big storm last night. We're doing complimentary post-storm inspections this week for [City] homeowners. Grab a slot before they fill up.",
      landscaping:
        "Freeze warning for [City] tonight. If your irrigation isn't winterized yet, call us today — we have same-day availability.",
    },
    estimatedROI: "Captures urgent demand before competitors react.",
  },
];

// ── Dev-time slug uniqueness check ─────────────────────────────────────────
// Uses a type-level assertion: if two recipes share a slug, this Set will be
// smaller than the array and the error fires.
const _slugs = RECIPE_CATALOG.map((r) => r.slug);
const _uniqueSlugs = new Set(_slugs);
if (_uniqueSlugs.size !== _slugs.length) {
  console.error(
    "[recipes/catalog] Duplicate slugs detected:",
    _slugs.filter((s, i) => _slugs.indexOf(s) !== i),
  );
}
