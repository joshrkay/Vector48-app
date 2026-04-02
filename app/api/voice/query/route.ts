import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { requireAccountForUser } from "@/lib/auth/account";
import { cachedGHLClient } from "@/lib/ghl/cache";
import { getAccountGhlCredentials } from "@/lib/ghl";
import { buildVoiceRouterSystemPrompt } from "@/lib/prompts/voiceRouter";
import {
  routeVoiceIntentFastPath,
  type VoiceLiveSummary,
} from "@/lib/voice/fastPathRouter";
import {
  parseVoiceActionPayload,
  voiceQueryBodySchema,
  type VoiceAction,
} from "@/lib/voice/types";
import { createServerClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

export const runtime = "nodejs";

const MODEL = "claude-sonnet-4-6";
const CLAUDE_TIMEOUT_MS = 1_500;
const SUMMARY_TIMEOUT_MS = 800;

type Vertical = Database["public"]["Enums"]["vertical"] | null;

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  fallbackValue: T,
): Promise<T> {
  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => resolve(fallbackValue), timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timeoutId);
        resolve(value);
      })
      .catch(() => {
        clearTimeout(timeoutId);
        resolve(fallbackValue);
      });
  });
}

function stripAssistantJsonFence(raw: string): string {
  const value = raw.trim();
  if (!value.startsWith("```")) return value;
  return value.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

function parseClaudeTextPayload(text: string): VoiceAction | null {
  try {
    const parsed = JSON.parse(stripAssistantJsonFence(text));
    return parseVoiceActionPayload(parsed);
  } catch {
    return null;
  }
}

function getUtcMidnightUnix(): number {
  const now = new Date();
  return Math.floor(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 1000,
  );
}

async function getLiveSummary(accountId: string): Promise<VoiceLiveSummary | null> {
  try {
    const { locationId, accessToken } = await getAccountGhlCredentials(accountId);
    const client = cachedGHLClient(accountId);
    const opts = { locationId, apiKey: accessToken };
    const dayStart = getUtcMidnightUnix();
    const dayStartMs = dayStart * 1_000;

    const [newLead, contacted, conversationsToday, allContacts, unread] =
      await Promise.allSettled([
        client.getContacts({ locationId, limit: 1, tag: "New Lead" }, opts),
        client.getContacts({ locationId, limit: 1, tag: "Contacted" }, opts),
        client.getConversations(
          {
            locationId,
            limit: 1,
            startAfter: dayStart,
            sort: "desc",
            sortBy: "last_message_date",
          },
          opts,
        ),
        client.getContacts({ locationId, limit: 1 }, opts),
        client.getConversations({ locationId, limit: 1, unreadOnly: true }, opts),
      ]);

    const openLeads =
      (newLead.status === "fulfilled" ? newLead.value.meta?.total ?? 0 : 0) +
      (contacted.status === "fulfilled" ? contacted.value.meta?.total ?? 0 : 0);

    let conversationsCount = 0;
    if (conversationsToday.status === "fulfilled") {
      conversationsCount =
        conversationsToday.value.meta?.total ??
        conversationsToday.value.conversations.filter((conversation) => {
          const date = conversation.lastMessageDate;
          if (!date) return false;
          return new Date(date).getTime() >= dayStartMs;
        }).length;
    }

    return {
      openLeads,
      conversationsToday: conversationsCount,
      totalContacts: allContacts.status === "fulfilled" ? allContacts.value.meta?.total ?? 0 : 0,
      unreadInbox: unread.status === "fulfilled" ? unread.value.meta?.total ?? 0 : 0,
    };
  } catch {
    return null;
  }
}

async function runClaudeRouter({
  transcript,
  vertical,
  currentRoute,
  activeRecipes,
  summary,
}: {
  transcript: string;
  vertical: Vertical;
  currentRoute: string;
  activeRecipes: string[];
  summary: VoiceLiveSummary | null;
}): Promise<VoiceAction | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return null;
  }

  const system = buildVoiceRouterSystemPrompt();
  const client = new Anthropic({ apiKey });
  const userPayload = JSON.stringify(
    {
      transcript,
      context: {
        vertical,
        currentRoute,
        activeRecipes,
        summary,
      },
    },
    null,
    2,
  );

  const response = await withTimeout(
    client.messages.create({
      model: MODEL,
      max_tokens: 500,
      temperature: 0,
      system,
      messages: [{ role: "user", content: userPayload }],
    }),
    CLAUDE_TIMEOUT_MS,
    null,
  );

  if (!response) {
    return null;
  }

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    return null;
  }
  return parseClaudeTextPayload(textBlock.text);
}

export async function POST(request: Request) {
  const supabase = await createServerClient();
  const session = await requireAccountForUser(supabase);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rawBody = await request.json().catch(() => null);
  const parsed = voiceQueryBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const transcript = parsed.data.transcript.trim();
  if (!transcript) {
    return NextResponse.json({ error: "transcript is required" }, { status: 400 });
  }

  const [accountResult, activeRecipesResult] = await Promise.all([
    supabase
      .from("accounts")
      .select("vertical")
      .eq("id", session.accountId)
      .maybeSingle(),
    supabase
      .from("recipe_activations")
      .select("recipe_slug")
      .eq("account_id", session.accountId)
      .eq("status", "active"),
  ]);

  const vertical: Vertical = accountResult.data?.vertical ?? null;
  const dbActiveRecipes = (activeRecipesResult.data ?? []).map((row) => row.recipe_slug);
  const activeRecipes = Array.from(
    new Set([...(parsed.data.context.activeRecipes ?? []), ...dbActiveRecipes]),
  );

  const liveSummary = await withTimeout(
    getLiveSummary(session.accountId),
    SUMMARY_TIMEOUT_MS,
    null,
  );

  const fastPath = routeVoiceIntentFastPath({
    transcript,
    activeRecipeSlugs: activeRecipes,
    summary: liveSummary,
  });

  if (fastPath) {
    return NextResponse.json(fastPath);
  }

  const claudeAction = await runClaudeRouter({
    transcript,
    vertical,
    currentRoute: parsed.data.context.currentRoute ?? "/dashboard",
    activeRecipes,
    summary: liveSummary,
  });

  if (claudeAction) {
    return NextResponse.json(claudeAction);
  }

  return NextResponse.json({
    type: "clarify",
    message:
      "I wasn’t sure what to do. Try asking to open a page, search a contact, or run a specific recipe action.",
  } satisfies VoiceAction);
}

