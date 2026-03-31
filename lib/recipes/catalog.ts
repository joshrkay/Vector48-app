// ---------------------------------------------------------------------------
// Recipe Catalog — Static definitions for all 14 automation recipes.
// This is the single source of truth for recipe metadata.
// Read-only at runtime — no database table backs this.
//
// NOTE: verticalMessages are realistic samples. Review against the PRD
// (sections 7 & 25) when available and replace as needed.
// ---------------------------------------------------------------------------

<<<<<<< HEAD
import type { RecipeCatalogEntry } from "./types";

export const RECIPE_CATALOG: RecipeCatalogEntry[] = [
=======
import type { RecipeDefinition } from "@/types/recipes";

export const RECIPE_CATALOG: RecipeDefinition[] = [
>>>>>>> origin/main
  // ── Awareness (2) ─────────────────────────────────────────
  {
    slug: "google-review-booster",
    name: "Google Review Booster",
    description:
      "Automatically request Google reviews after completed jobs to build your online reputation and attract new customers.",
    detailedDescription:
      "After a job is marked complete, automatically send a friendly SMS with a link to leave a Google review.",
    icon: "star",
    funnelStage: "awareness",
    vertical: null,
    releasePhase: "ga",
    stageColor: "blue-100",
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
    funnelStage: "awareness",
    vertical: "hvac",
    releasePhase: "coming_soon",
    stageColor: "blue-100",
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
      "Never miss a call again. AI answers when you can't, captures the caller's info, and texts you a summary instantly.",
    detailedDescription:
      "When a call comes in and you're unable to answer, our AI voice agent picks up, greets the caller by name if possible, captures their issue, and sends you an SMS summary with the caller's details. No more lost leads from missed calls.",
    funnelStage: "capture",
    releasePhase: "v1",
    icon: "Phone",
    stageColor: "blue-100",
    trigger: "Incoming call goes unanswered after the configured ring timeout.",
    output:
      "AI answers the call, captures caller info, and texts the business owner a summary.",
    requiredIntegrations: ["twilio", "elevenlabs"],
    optionalIntegrations: [],
    configFields: [
      {
        name: "voiceGender",
        label: "Voice Gender",
        type: "select",
        required: true,
        defaultFromProfile: "voice_gender",
        options: ["male", "female"],
      },
      {
        name: "voiceGreeting",
        label: "Greeting Script",
        type: "textarea",
        required: true,
        defaultFromProfile: "greeting_text",
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
      hvac: "Hi, thanks for calling! I'm the AI assistant for {{business_name}}. I can help you schedule a heating or cooling service. What's going on with your system today?",
      plumbing:
        "Hi, thanks for calling {{business_name}}! I'm the AI assistant. Are you dealing with a plumbing emergency, or would you like to schedule a service appointment?",
      electrical:
        "Hi, thanks for calling {{business_name}}! I'm the AI assistant. Do you need help with an electrical issue or would you like to schedule an inspection?",
      roofing:
        "Hi, thanks for calling {{business_name}}! I'm the AI assistant. Are you looking for a roof inspection, repair estimate, or something else?",
      landscaping:
        "Hi, thanks for calling {{business_name}}! I'm the AI assistant. Are you interested in a landscaping quote or scheduling a regular service?",
    },
    estimatedROI: "Recovers 30-40% of missed calls",
  },

  {
    slug: "missed-call-text-back",
    name: "Missed Call Text-Back",
    description:
      "Instantly texts callers you missed so they know you'll follow up.",
    detailedDescription:
      "When a call goes unanswered, the system automatically sends an SMS to the caller within seconds acknowledging their call and letting them know you'll get back to them. Keeps leads warm until you can respond.",
    funnelStage: "capture",
    releasePhase: "v1",
    icon: "MessageSquare",
    stageColor: "blue-100",
    trigger: "A call is missed or goes to voicemail.",
    output:
      "An SMS is sent to the caller within seconds with a customizable message.",
    requiredIntegrations: [],
    optionalIntegrations: [],
    configFields: [
      {
        name: "textBackMessage",
        label: "Text-Back Message",
        type: "textarea",
        required: true,
      },
      {
        name: "textBackDelaySec",
        label: "Delay Before Sending (seconds)",
        type: "number",
        required: false,
      },
    ],
    verticalMessages: {
      hvac: "Hey {{contact_name}}, sorry we missed your call! We'll get back to you shortly. If it's an HVAC emergency, reply URGENT and we'll prioritize your request. — {{business_name}}",
      plumbing:
        "Hey {{contact_name}}, sorry we missed your call! We'll get back to you shortly. If you have a plumbing emergency, reply URGENT. — {{business_name}}",
      electrical:
        "Hey {{contact_name}}, sorry we missed your call! We'll call you back shortly. If this is an electrical emergency, reply URGENT. — {{business_name}}",
      roofing:
        "Hey {{contact_name}}, sorry we missed your call! We'll get back to you ASAP. If you have a roof leak, reply URGENT. — {{business_name}}",
      landscaping:
        "Hey {{contact_name}}, sorry we missed your call! We'll get back to you shortly. — {{business_name}}",
    },
    estimatedROI: "Recovers 20-30% of missed call leads",
  },

  // ── ENGAGE ─────────────────────────────────────────────────────────────────

  {
    slug: "new-lead-instant-response",
    name: "New Lead Instant Response",
    description:
      "Responds to new leads within seconds to maximize conversion.",
    detailedDescription:
      "When a new lead comes in through any channel — web form, ad, referral — the system instantly sends a personalized SMS introducing your business and asking how you can help. Speed-to-lead is the #1 factor in conversion.",
    funnelStage: "engage",
    releasePhase: "v1",
    icon: "Zap",
    stageColor: "violet-100",
    trigger: "A new contact is created in the CRM from any source.",
    output:
      "A personalized SMS is sent to the lead within seconds of entry.",
    requiredIntegrations: [],
    optionalIntegrations: [],
    configFields: [
      {
        name: "responseMessage",
        label: "Instant Response Message",
        type: "textarea",
        required: true,
      },
      {
        name: "responseDelaySec",
        label: "Delay Before Sending (seconds)",
        type: "number",
        required: false,
      },
    ],
    verticalMessages: {
      hvac: "Hey {{contact_name}}! Thanks for reaching out to {{business_name}}. We'd love to help with your heating or cooling needs. What can we do for you?",
      plumbing:
        "Hey {{contact_name}}! Thanks for reaching out to {{business_name}}. We'd love to help with your plumbing needs. What's going on?",
      electrical:
        "Hey {{contact_name}}! Thanks for reaching out to {{business_name}}. We'd love to help with your electrical needs. What can we do for you?",
      roofing:
        "Hey {{contact_name}}! Thanks for reaching out to {{business_name}}. We'd love to help with your roofing needs. What can we do for you?",
      landscaping:
        "Hey {{contact_name}}! Thanks for reaching out to {{business_name}}. We'd love to help with your landscaping needs. What are you looking for?",
    },
    estimatedROI: "Increases lead conversion by 30-50%",
  },

  {
    slug: "lead-qualification",
    name: "Lead Qualification",
    description:
      "AI qualifies leads via text conversation before they reach your team.",
    detailedDescription:
      "After the initial response, the AI continues the SMS conversation to qualify the lead — asking about the type of work needed, timeline, budget range, and property details. Qualified leads are tagged and prioritized in the pipeline.",
    funnelStage: "engage",
    releasePhase: "v2",
    icon: "ClipboardCheck",
    stageColor: "violet-100",
    trigger:
      "A new lead responds to the initial outreach message.",
    output:
      "The lead is qualified via AI conversation and tagged with qualification score in the CRM.",
    requiredIntegrations: [],
    optionalIntegrations: [],
    configFields: [
      {
        name: "qualificationQuestions",
        label: "Qualification Questions (one per line)",
        type: "textarea",
        required: true,
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
      hvac: "Great, a few quick questions so we can get you the right help: What type of system do you have (central AC, heat pump, furnace)? Is this for a repair, replacement, or new install?",
      plumbing:
        "Got it! A few quick questions: Is this a repair, new install, or remodel project? Is the issue urgent (active leak, no water)?",
      electrical:
        "Thanks! A few quick questions: Is this a repair, new install, or inspection? Is the issue urgent (power out, sparking)?",
      roofing:
        "Thanks! A few quick questions: Are you looking for a repair, replacement, or new installation? How old is your current roof?",
      landscaping:
        "Thanks! A few quick questions: Are you looking for a one-time project or ongoing maintenance? What's the approximate size of the area?",
    },
    estimatedROI: "Saves 5-10 hours/week on manual lead screening",
  },

  // ── CLOSE ──────────────────────────────────────────────────────────────────

  {
    slug: "estimate-follow-up",
    name: "Estimate Follow-Up",
    description:
      "Automatically follows up after sending an estimate to close the deal.",
    detailedDescription:
      "After you send an estimate, the system waits a configurable period then sends a friendly follow-up SMS checking if the customer has questions. Keeps you top-of-mind and dramatically improves close rates.",
    funnelStage: "close",
    releasePhase: "v1",
    icon: "FileText",
    stageColor: "amber-100",
    trigger:
      "An estimate or proposal is sent to the customer (opportunity stage change).",
    output:
      "A follow-up SMS is sent after the configured delay asking if they have questions.",
    requiredIntegrations: [],
    optionalIntegrations: ["jobber", "servicetitan"],
    configFields: [
      {
        name: "followUpMessage",
        label: "Follow-Up Message",
        type: "textarea",
        required: true,
      },
      {
        name: "followUpDelayHours",
        label: "Hours After Estimate to Follow Up",
        type: "number",
        required: true,
      },
    ],
    verticalMessages: {
      hvac: "Hey {{contact_name}}, just checking in on the estimate we sent for your HVAC work. Do you have any questions or would you like to schedule the job? — {{business_name}}",
      plumbing:
        "Hey {{contact_name}}, just following up on the plumbing estimate we sent. Any questions? We'd love to get you on the schedule. — {{business_name}}",
      electrical:
        "Hey {{contact_name}}, following up on the electrical estimate we sent. Any questions or ready to move forward? — {{business_name}}",
      roofing:
        "Hey {{contact_name}}, following up on your roofing estimate. Any questions? We're happy to walk through the details. — {{business_name}}",
      landscaping:
        "Hey {{contact_name}}, following up on the landscaping estimate we sent. Any questions or ready to get started? — {{business_name}}",
    },
    estimatedROI: "Improves estimate close rate by 15-25%",
  },

  {
    slug: "seasonal-demand-outreach",
    name: "Seasonal Demand Outreach",
    description:
      "Proactively reaches out to customers before peak seasons.",
    detailedDescription:
      "Automatically sends seasonal campaign messages to your customer list before peak demand periods — AC tune-ups before summer, furnace checks before winter, gutter cleaning before fall. Fills your schedule during transition periods.",
    funnelStage: "close",
    releasePhase: "v2",
    icon: "Sun",
    stageColor: "amber-100",
    trigger:
      "Scheduled campaign trigger based on configured seasonal dates.",
    output:
      "Personalized seasonal outreach SMS sent to matching customer segments.",
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
      hvac: "Hey {{contact_name}}! Summer is around the corner. Now's the perfect time to get your AC tuned up before the heat hits. Want us to schedule a visit? — {{business_name}}",
      plumbing:
        "Hey {{contact_name}}! Winter's coming — time to check your pipes and water heater before the freeze. Want to schedule a quick inspection? — {{business_name}}",
      electrical:
        "Hey {{contact_name}}! Storm season is approaching. Is your home's electrical system ready? We're offering generator and surge protector checks. — {{business_name}}",
      roofing:
        "Hey {{contact_name}}! Fall is here — time for a roof inspection before the heavy rain and snow. Want to schedule a free check-up? — {{business_name}}",
      landscaping:
        "Hey {{contact_name}}! Spring is here and it's the perfect time to refresh your yard. Want to schedule a spring cleanup? — {{business_name}}",
    },
    estimatedROI: "Fills 20-30% of off-peak schedule gaps",
  },

  // ── DELIVER ────────────────────────────────────────────────────────────────

  {
    slug: "appointment-reminder",
    name: "Appointment Reminder",
    description:
      "Sends automated reminders before scheduled appointments to reduce no-shows.",
    detailedDescription:
      "Automatically texts customers before their scheduled appointment with a reminder of the date, time, and any prep instructions. Reduces no-shows and last-minute cancellations, keeping your schedule full.",
    funnelStage: "deliver",
    releasePhase: "v1",
    icon: "Bell",
    stageColor: "green-100",
    trigger:
      "A scheduled appointment is approaching (configurable hours before).",
    output:
      "An SMS reminder is sent to the customer with appointment details.",
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
        label: "Hours Before Appointment",
        type: "number",
        required: true,
      },
    ],
    verticalMessages: {
      hvac: "Reminder: Your HVAC appointment with {{business_name}} is tomorrow at {{appointment_time}}. Please make sure someone 18+ is home and the area around your unit is clear. Reply C to confirm or R to reschedule.",
      plumbing:
        "Reminder: Your plumbing appointment with {{business_name}} is tomorrow at {{appointment_time}}. Please clear the area under sinks if applicable. Reply C to confirm or R to reschedule.",
      electrical:
        "Reminder: Your electrical appointment with {{business_name}} is tomorrow at {{appointment_time}}. Please ensure access to the electrical panel. Reply C to confirm or R to reschedule.",
      roofing:
        "Reminder: Your roofing appointment with {{business_name}} is tomorrow at {{appointment_time}}. No need to be home — we'll take exterior photos and follow up. Reply C to confirm or R to reschedule.",
      landscaping:
        "Reminder: Your landscaping appointment with {{business_name}} is tomorrow at {{appointment_time}}. Please make sure gates are unlocked. Reply C to confirm or R to reschedule.",
    },
    estimatedROI: "Reduces no-shows by 30-50%",
  },

  {
    slug: "tech-on-the-way",
    name: "Tech On-The-Way",
    description:
      "Notifies customers when a technician is en route to their location.",
    detailedDescription:
      "When a technician is dispatched, the system sends a real-time SMS to the customer with the tech's name, ETA, and a photo if available. Reduces 'where's my tech' calls and improves the customer experience.",
    funnelStage: "deliver",
    releasePhase: "v2",
    icon: "Truck",
    stageColor: "green-100",
    trigger:
      "A technician is dispatched or an appointment status changes to 'en route'.",
    output:
      "An SMS is sent to the customer with technician details and estimated arrival time.",
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
      hvac: "Good news! Your HVAC technician {{tech_name}} is on the way and should arrive in about {{eta}} minutes. — {{business_name}}",
      plumbing:
        "Good news! Your plumber {{tech_name}} is on the way and should arrive in about {{eta}} minutes. — {{business_name}}",
      electrical:
        "Good news! Your electrician {{tech_name}} is on the way and should arrive in about {{eta}} minutes. — {{business_name}}",
      roofing:
        "Good news! Your roofing crew lead {{tech_name}} is on the way and should arrive in about {{eta}} minutes. — {{business_name}}",
      landscaping:
        "Good news! Your landscaping crew lead {{tech_name}} is on the way and should arrive in about {{eta}} minutes. — {{business_name}}",
    },
    estimatedROI: "Reduces 'where's my tech' calls by 60%",
  },

  // ── RETAIN ─────────────────────────────────────────────────────────────────

  {
    slug: "review-request",
    name: "Review Request",
    description:
      "Asks happy customers to leave a review after job completion.",
    detailedDescription:
      "After a job is marked complete, the system waits a configurable period then sends a friendly SMS asking the customer to leave a review on your preferred platform. Includes a direct link to make it as easy as possible.",
    funnelStage: "retain",
    releasePhase: "v1",
    icon: "Star",
    stageColor: "rose-100",
    trigger:
      "A job or appointment is marked as completed in the CRM.",
    output:
      "An SMS with a direct review link is sent to the customer after the configured delay.",
    requiredIntegrations: [],
    optionalIntegrations: ["google_business"],
    configFields: [
      {
        name: "reviewPlatform",
        label: "Review Platform",
        type: "select",
        required: true,
        options: ["google", "yelp", "facebook"],
      },
      {
        name: "reviewRequestMessage",
        label: "Review Request Message",
        type: "textarea",
        required: true,
      },
      {
        name: "reviewRequestDelayHours",
        label: "Hours After Job to Send Request",
        type: "number",
        required: false,
      },
    ],
    verticalMessages: {
      hvac: "Hey {{contact_name}}, thanks for choosing {{business_name}} for your HVAC service! If you had a great experience, we'd really appreciate a quick review: {{review_link}} — it helps other homeowners find us!",
      plumbing:
        "Hey {{contact_name}}, thanks for choosing {{business_name}} for your plumbing work! We'd love a quick review if you're happy with the job: {{review_link}}",
      electrical:
        "Hey {{contact_name}}, thanks for choosing {{business_name}} for your electrical work! A quick review really helps us out: {{review_link}}",
      roofing:
        "Hey {{contact_name}}, thanks for trusting {{business_name}} with your roof! If you're happy with the work, a quick review would mean a lot: {{review_link}}",
      landscaping:
        "Hey {{contact_name}}, thanks for choosing {{business_name}} for your landscaping! If you love how things look, we'd appreciate a review: {{review_link}}",
    },
    estimatedROI: "Increases reviews by 3-5x",
  },

  {
    slug: "post-job-upsell",
    name: "Post-Job Upsell",
    description:
      "Suggests related services after completing a job.",
    detailedDescription:
      "After a job is completed, the system identifies related services that the customer might need and sends a personalized recommendation. Drives repeat business and increases average customer lifetime value.",
    funnelStage: "retain",
    releasePhase: "v2",
    icon: "TrendingUp",
    stageColor: "rose-100",
    trigger:
      "A job is completed and the customer has no other open opportunities.",
    output:
      "An SMS is sent suggesting related services based on the completed job type.",
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
        label: "Days After Job to Send",
        type: "number",
        required: true,
      },
    ],
    verticalMessages: {
      hvac: "Hey {{contact_name}}, now that your AC is running great, have you thought about adding a UV air purifier or upgrading your thermostat? We're running a special this month. — {{business_name}}",
      plumbing:
        "Hey {{contact_name}}, now that your plumbing issue is fixed, have you thought about a whole-home water filtration system or tankless water heater? — {{business_name}}",
      electrical:
        "Hey {{contact_name}}, now that your electrical work is done, have you considered a whole-home surge protector or smart panel upgrade? — {{business_name}}",
      roofing:
        "Hey {{contact_name}}, now that your roof is in great shape, have you considered adding gutter guards or attic insulation? — {{business_name}}",
      landscaping:
        "Hey {{contact_name}}, now that your yard looks great, have you considered an irrigation system or outdoor lighting? — {{business_name}}",
    },
    estimatedROI: "Increases repeat revenue by 15-20%",
  },

  {
    slug: "maintenance-plan-enrollment",
    name: "Maintenance Plan Enrollment",
    description:
      "Encourages customers to sign up for a recurring maintenance plan.",
    detailedDescription:
      "After a service is completed, the system sends a message highlighting the benefits of a recurring maintenance plan — priority scheduling, discounts, and system longevity. Drives predictable recurring revenue.",
    funnelStage: "retain",
    releasePhase: "v2",
    icon: "Repeat",
    stageColor: "rose-100",
    trigger:
      "A job is completed and the customer is not on a maintenance plan.",
    output:
      "An SMS is sent promoting the maintenance plan with a sign-up link.",
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
      hvac: "Hey {{contact_name}}, did you know our HVAC maintenance plan includes 2 annual tune-ups, priority scheduling, and 15% off repairs? Plans start at $14.99/mo. Interested? — {{business_name}}",
      plumbing:
        "Hey {{contact_name}}, our plumbing maintenance plan includes an annual inspection, priority service, and 10% off all repairs. Plans start at $9.99/mo. — {{business_name}}",
      electrical:
        "Hey {{contact_name}}, our electrical maintenance plan includes an annual safety inspection and 15% off future work. Plans start at $9.99/mo. — {{business_name}}",
      roofing:
        "Hey {{contact_name}}, our roof maintenance plan includes biannual inspections and priority storm damage repair. Plans start at $12.99/mo. — {{business_name}}",
      landscaping:
        "Hey {{contact_name}}, our recurring maintenance plan covers weekly mowing, seasonal cleanup, and priority scheduling. Plans start at $149/mo. — {{business_name}}",
    },
    estimatedROI: "Converts 10-15% of one-time customers to recurring",
  },

  // ── REACTIVATE ─────────────────────────────────────────────────────────────

  {
    slug: "customer-reactivation",
    name: "Customer Reactivation",
    description:
      "Re-engages past customers who haven't booked in a while.",
    detailedDescription:
      "Identifies customers who haven't booked a service in a configurable period and sends a friendly check-in message with an incentive to book again. Reactivates dormant customers and fills quiet periods.",
    funnelStage: "reactivate",
    releasePhase: "v2",
    icon: "UserPlus",
    stageColor: "orange-100",
    trigger:
      "A customer has had no activity for a configurable number of days (e.g., 90+).",
    output:
      "A re-engagement SMS is sent with a personalized offer or check-in.",
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
        label: "Days of Inactivity Before Trigger",
        type: "number",
        required: true,
      },
    ],
    verticalMessages: {
      hvac: "Hey {{contact_name}}, it's been a while! Your HVAC system might be due for a checkup. Book a tune-up this month and get 10% off. — {{business_name}}",
      plumbing:
        "Hey {{contact_name}}, it's been a while! Just checking in — if you need any plumbing work, we're offering 10% off for returning customers this month. — {{business_name}}",
      electrical:
        "Hey {{contact_name}}, it's been a while! If you have any electrical projects on your list, we're offering 10% off for returning customers. — {{business_name}}",
      roofing:
        "Hey {{contact_name}}, it's been a while! Your roof may be due for an inspection. Book this month and get a free assessment. — {{business_name}}",
      landscaping:
        "Hey {{contact_name}}, it's been a while! Your yard might need some love. Book this month and get 10% off any service. — {{business_name}}",
    },
    estimatedROI: "Reactivates 10-20% of dormant customers",
  },

  {
    slug: "unsold-estimate-reactivation",
    name: "Unsold Estimate Reactivation",
    description:
      "Follows up on old estimates that were never closed.",
    detailedDescription:
      "Identifies estimates and proposals that were sent but never accepted, then sends a follow-up message checking if the customer is still interested. Often recovers revenue that would otherwise be lost.",
    funnelStage: "reactivate",
    releasePhase: "v3",
    icon: "RefreshCw",
    stageColor: "orange-100",
    trigger:
      "An opportunity has been in 'estimate sent' stage for a configurable number of days without a response.",
    output:
      "A follow-up SMS is sent asking if the customer is still interested in the quoted work.",
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
        label: "Days Before Estimate Is Considered Stale",
        type: "number",
        required: true,
      },
    ],
    verticalMessages: {
      hvac: "Hey {{contact_name}}, we sent you an estimate for HVAC work a while back. Still interested? We'd love to get you on the schedule — and we might be able to work on the price. — {{business_name}}",
      plumbing:
        "Hey {{contact_name}}, we sent you a plumbing estimate a while back. Still thinking about it? Let us know — we'd love to help. — {{business_name}}",
      electrical:
        "Hey {{contact_name}}, we sent you an electrical estimate a while back. Still interested? Let us know and we'll get you on the calendar. — {{business_name}}",
      roofing:
        "Hey {{contact_name}}, you got a roofing estimate from us a while back. Still considering the project? We'd love to chat. — {{business_name}}",
      landscaping:
        "Hey {{contact_name}}, you got a landscaping estimate from us a while back. Still interested? Spring's a great time to get started. — {{business_name}}",
    },
    estimatedROI: "Recovers 10-15% of stale estimates",
  },

  {
    slug: "weather-event-outreach",
    name: "Weather Event Outreach",
    description:
      "Proactively reaches out to customers after severe weather events.",
    detailedDescription:
      "After a major weather event (storm, freeze, heat wave), the system sends targeted outreach to customers in affected areas offering inspections and repairs. Positions your business as proactive and captures demand spikes.",
    funnelStage: "reactivate",
    releasePhase: "v3",
    icon: "CloudLightning",
    stageColor: "orange-100",
    trigger:
      "A weather event alert is triggered for the service area (manual or API-driven).",
    output:
      "A targeted SMS is sent to customers in the affected area offering post-storm services.",
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
        options: ["storm", "freeze", "heat_wave", "flooding", "hail"],
      },
    ],
    verticalMessages: {
      hvac: "Hey {{contact_name}}, after the recent {{weather_event}}, your HVAC system may need attention. We're offering free post-storm inspections this week. Want us to come take a look? — {{business_name}}",
      plumbing:
        "Hey {{contact_name}}, after the recent {{weather_event}}, frozen or burst pipes can be a real risk. Need a plumbing inspection? We're prioritizing existing customers. — {{business_name}}",
      electrical:
        "Hey {{contact_name}}, after the recent {{weather_event}}, power surges may have damaged appliances or wiring. We're offering free electrical safety checks. — {{business_name}}",
      roofing:
        "Hey {{contact_name}}, after the recent {{weather_event}}, your roof may have sustained damage. We're offering free storm damage inspections — want us to come take a look? — {{business_name}}",
      landscaping:
        "Hey {{contact_name}}, after the recent {{weather_event}}, your yard may need some cleanup. We're offering storm cleanup services — want us to come by? — {{business_name}}",
    },
    estimatedROI: "Captures 40-60% of post-storm demand",
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
