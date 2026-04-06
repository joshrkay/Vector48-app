import { RECIPE_CATALOG } from "../recipes/catalog";
import type { VoiceAction } from "@/lib/voice/types";

export interface VoiceLiveSummary {
  openLeads: number;
  conversationsToday: number;
  totalContacts: number;
  unreadInbox: number;
}

export interface FastPathIntentInput {
  transcript: string;
  activeRecipeSlugs: string[];
  summary: VoiceLiveSummary | null;
}

const HELP_RESPONSES: Array<{ pattern: RegExp; message: string; openRoute?: string }> =
  [
    {
      pattern: /\bhow (do|can) i add (a )?contact\b/i,
      message:
        "Open Contacts, tap Add Contact, enter details, then save. I can open Contacts now.",
      openRoute: "/crm/contacts",
    },
    {
      pattern: /\bfollow[- ]?up recipe\b.*\b(do|does|what)\b|\bwhat\b.*\bfollow[- ]?up recipe\b/i,
      message:
        "Follow-up recipes send timed check-ins after a lead or estimate so opportunities do not go cold.",
      openRoute: "/recipes",
    },
  ];

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[^\w\s-]/g, " ").replace(/\s+/g, " ").trim();
}

function includesAny(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(term));
}

function buildDashboardSummary(summary: VoiceLiveSummary | null, activeCount: number): string {
  if (!summary) {
    return `Today: ${activeCount} active recipes. I can also open Dashboard for details.`;
  }
  return `Today: ${summary.conversationsToday} conversations, ${summary.unreadInbox} unread inbox, ${summary.openLeads} open leads, ${summary.totalContacts} total contacts, and ${activeCount} active recipes.`;
}

function buildActiveRecipesAnswer(activeRecipes: string[]): string {
  if (!activeRecipes.length) {
    return "No recipes are active right now.";
  }
  const names = activeRecipes
    .map(
      (slug) =>
        RECIPE_CATALOG.find((recipe) => recipe.slug === slug)?.name ?? slug,
    )
    .slice(0, 6);
  return `Active recipes: ${names.join(", ")}.`;
}

function mapRecipeNameToSlug(normalizedTranscript: string): string | null {
  const normalized = normalizeText(normalizedTranscript);
  for (const recipe of RECIPE_CATALOG) {
    const slugPhrase = recipe.slug.replace(/-/g, " ");
    const namePhrase = normalizeText(recipe.name);
    if (normalized.includes(slugPhrase) || normalized.includes(namePhrase)) {
      return recipe.slug;
    }
  }
  return null;
}

function routeForSurface(normalizedTranscript: string): string | null {
  const routeMap: Array<{ route: string; terms: string[] }> = [
    { route: "/dashboard", terms: ["dashboard", "home"] },
    { route: "/recipes", terms: ["recipe", "recipes", "automation", "automations"] },
    { route: "/crm/contacts", terms: ["contacts", "contact list"] },
    { route: "/crm/inbox", terms: ["inbox", "messages", "message center"] },
    { route: "/crm/pipeline", terms: ["pipeline", "opportunities", "deals"] },
    { route: "/crm/calendar", terms: ["calendar", "appointments"] },
    { route: "/crm/reports", terms: ["reports", "reporting"] },
    { route: "/settings", terms: ["settings", "preferences"] },
    { route: "/billing", terms: ["billing", "plan", "subscription"] },
  ];

  const hasNavigateVerb = includesAny(normalizedTranscript, [
    "show",
    "open",
    "go to",
    "take me to",
    "navigate",
  ]);

  for (const item of routeMap) {
    if (includesAny(normalizedTranscript, item.terms) && hasNavigateVerb) {
      return item.route;
    }
  }
  return null;
}

function maybeFilteredNavigation(normalizedTranscript: string): VoiceAction | null {
  if (includesAny(normalizedTranscript, ["unread"]) && includesAny(normalizedTranscript, ["inbox", "message", "messages"])) {
    return {
      type: "navigate",
      route: "/crm/inbox",
      params: { filter: "unread" },
      message: "Opening unread inbox messages.",
    };
  }

  if (includesAny(normalizedTranscript, ["ai handled", "ai messages", "automation messages"])) {
    return {
      type: "navigate",
      route: "/crm/inbox",
      params: { filter: "ai_handled" },
      message: "Opening AI-handled inbox messages.",
    };
  }

  if (includesAny(normalizedTranscript, ["needs reply", "need reply", "reply pending"])) {
    return {
      type: "navigate",
      route: "/crm/inbox",
      params: { filter: "needs_reply" },
      message: "Opening messages that need a reply.",
    };
  }

  if (includesAny(normalizedTranscript, ["new leads", "new lead", "leads this week"])) {
    return {
      type: "navigate",
      route: "/crm/contacts",
      params: { filter: "new_lead" },
      message: "Opening new leads.",
    };
  }

  if (includesAny(normalizedTranscript, ["contacted leads", "contacted contacts"])) {
    return {
      type: "navigate",
      route: "/crm/contacts",
      params: { filter: "contacted" },
      message: "Opening contacted contacts.",
    };
  }

  return null;
}

function maybeContactLookup(normalizedTranscript: string): VoiceAction | null {
  const match = normalizedTranscript.match(
    /\b(find|search for|look up|show)\s+([a-z0-9][a-z0-9\s'-]{1,80})$/,
  );
  if (!match) return null;
  const query = match[2].trim();
  if (!query) return null;

  return {
    type: "navigate",
    route: "/crm/contacts",
    params: { q: query },
    message: `Searching contacts for ${query}.`,
  };
}

function maybeStatusAnswer(
  normalizedTranscript: string,
  summary: VoiceLiveSummary | null,
): VoiceAction | null {
  const isCountIntent = includesAny(normalizedTranscript, [
    "how many",
    "count",
    "what's",
    "what is",
  ]);
  if (!isCountIntent) return null;

  if (includesAny(normalizedTranscript, ["calls today", "conversations today", "today calls"])) {
    if (!summary) {
      return {
        type: "clarify",
        message: "I could not fetch live call stats right now. Want me to open Dashboard?",
        openRoute: "/dashboard",
      };
    }
    return {
      type: "answer",
      message: `You have ${summary.conversationsToday} conversations today.`,
      openRoute: "/dashboard",
    };
  }

  if (includesAny(normalizedTranscript, ["pipeline", "open leads", "leads open"])) {
    if (!summary) {
      return {
        type: "clarify",
        message: "I could not fetch pipeline counts right now. Want me to open Pipeline?",
        openRoute: "/crm/pipeline",
      };
    }
    return {
      type: "answer",
      message: `You currently have ${summary.openLeads} open leads in the pipeline.`,
      openRoute: "/crm/pipeline",
    };
  }

  if (includesAny(normalizedTranscript, ["unread", "unread messages", "unread inbox"])) {
    if (!summary) {
      return {
        type: "clarify",
        message: "I could not fetch unread counts right now. Want me to open Inbox?",
        openRoute: "/crm/inbox",
      };
    }
    return {
      type: "answer",
      message: `You have ${summary.unreadInbox} unread inbox conversations.`,
      openRoute: "/crm/inbox",
    };
  }

  if (includesAny(normalizedTranscript, ["total contacts", "how many contacts"])) {
    if (!summary) {
      return {
        type: "clarify",
        message: "I could not fetch total contacts right now. Want me to open Contacts?",
        openRoute: "/crm/contacts",
      };
    }
    return {
      type: "answer",
      message: `You have ${summary.totalContacts} contacts in your CRM.`,
      openRoute: "/crm/contacts",
    };
  }

  return null;
}

function maybeRecipeIntent(
  normalizedTranscript: string,
  activeRecipes: string[],
): VoiceAction | null {
  if (
    includesAny(normalizedTranscript, [
      "what recipes are running",
      "recipes running",
      "active recipes",
    ])
  ) {
    return {
      type: "answer",
      message: buildActiveRecipesAnswer(activeRecipes),
      openRoute: "/recipes",
    };
  }

  const recipeSlug = mapRecipeNameToSlug(normalizedTranscript);
  if (
    includesAny(normalizedTranscript, ["activate", "turn on", "enable", "start"]) &&
    includesAny(normalizedTranscript, ["recipe", "automation"])
  ) {
    if (!recipeSlug) {
      return {
        type: "clarify",
        message: "Which recipe should I activate?",
        openRoute: "/recipes",
      };
    }
    return {
      type: "action",
      action: "recipe.activate",
      params: { recipeSlug },
      message: `I can activate ${recipeSlug.replace(/-/g, " ")}.`,
      requiresConfirmation: true,
    };
  }

  if (
    includesAny(normalizedTranscript, ["deactivate", "turn off", "disable", "stop", "pause"]) &&
    includesAny(normalizedTranscript, ["recipe", "automation"])
  ) {
    if (!recipeSlug) {
      return {
        type: "clarify",
        message: "Which recipe should I deactivate?",
        openRoute: "/recipes",
      };
    }
    return {
      type: "action",
      action: "recipe.deactivate",
      params: { recipeSlug },
      message: `I can deactivate ${recipeSlug.replace(/-/g, " ")}.`,
      requiresConfirmation: true,
    };
  }

  return null;
}

function maybeDashboardSummary(
  normalizedTranscript: string,
  summary: VoiceLiveSummary | null,
  activeRecipeCount: number,
): VoiceAction | null {
  if (
    includesAny(normalizedTranscript, [
      "what's happening today",
      "what is happening today",
      "give me a summary",
      "daily summary",
      "today summary",
    ])
  ) {
    return {
      type: "answer",
      message: buildDashboardSummary(summary, activeRecipeCount),
      openRoute: "/dashboard",
    };
  }
  return null;
}

function maybeHelp(normalizedTranscript: string): VoiceAction | null {
  for (const item of HELP_RESPONSES) {
    if (item.pattern.test(normalizedTranscript)) {
      return {
        type: "answer",
        message: item.message,
        openRoute: item.openRoute,
      };
    }
  }
  return null;
}

export function routeVoiceIntentFastPath({
  transcript,
  activeRecipeSlugs,
  summary,
}: FastPathIntentInput): VoiceAction | null {
  const normalizedTranscript = normalizeText(transcript);

  const filtered = maybeFilteredNavigation(normalizedTranscript);
  if (filtered) return filtered;

  const contactLookup = maybeContactLookup(normalizedTranscript);
  if (contactLookup) return contactLookup;

  const recipeIntent = maybeRecipeIntent(normalizedTranscript, activeRecipeSlugs);
  if (recipeIntent) return recipeIntent;

  const statusAnswer = maybeStatusAnswer(normalizedTranscript, summary);
  if (statusAnswer) return statusAnswer;

  const dashboardSummary = maybeDashboardSummary(
    normalizedTranscript,
    summary,
    activeRecipeSlugs.length,
  );
  if (dashboardSummary) return dashboardSummary;

  const help = maybeHelp(normalizedTranscript);
  if (help) return help;

  const route = routeForSurface(normalizedTranscript);
  if (route) {
    return {
      type: "navigate",
      route,
      message: `Opening ${route.replace(/\//g, " ").trim() || "dashboard"}.`,
    };
  }

  return null;
}
