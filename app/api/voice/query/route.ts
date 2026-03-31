import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServerClient } from "@/lib/supabase/server";
import {
  buildVoiceRouterPrompt,
  verticalLabelForVoice,
} from "@/lib/prompts/voiceRouter";
import { parseVoiceRouterModelJson } from "@/lib/voice/routerSchema";
import { voiceQueryBodySchema } from "@/lib/validations/voice";

const MODEL = "claude-sonnet-4-6";

export async function POST(req: Request) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rawBody = await req.json().catch(() => null);
  const parsedBody = voiceQueryBodySchema.safeParse(rawBody);
  if (!parsedBody.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { transcript, currentRoute } = parsedBody.data;

  const { data: account, error: accountError } = await supabase
    .from("accounts")
    .select("id, business_name, vertical")
    .eq("owner_user_id", user.id)
    .single();

  if (accountError || !account) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: activations } = await supabase
    .from("recipe_activations")
    .select("recipe_slug")
    .eq("account_id", account.id)
    .eq("status", "active");

  const activeRecipes =
    activations?.map((a) => a.recipe_slug).filter(Boolean) ?? [];

  const vertical = verticalLabelForVoice(account.vertical);
  const businessName = account.business_name?.trim() || "your business";

  const system = buildVoiceRouterPrompt({
    vertical,
    activeRecipes,
    currentRoute,
    businessName,
  });

  const userContent = `User said (transcript):\n${transcript}`;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("[voice/query] ANTHROPIC_API_KEY missing");
    return NextResponse.json(
      { error: "Voice routing is not configured" },
      { status: 503 },
    );
  }

  const client = new Anthropic({ apiKey });

  console.log(
    `[voice/query] user=${user.id} transcript_len=${transcript.length} currentRoute=${currentRoute}`,
  );

  try {
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system,
      messages: [{ role: "user", content: userContent }],
    });

    const textBlock = msg.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      console.error(
        "[voice/query] unexpected response blocks",
        msg.content.map((b) => b.type),
      );
      return NextResponse.json(
        { error: "Unexpected model response" },
        { status: 502 },
      );
    }

    let action;
    try {
      action = parseVoiceRouterModelJson(textBlock.text);
    } catch (parseErr) {
      console.error("[voice/query] parse/validate failed", parseErr);
      return NextResponse.json(
        { error: "Could not parse voice routing response" },
        { status: 400 },
      );
    }

    return NextResponse.json({ action });
  } catch (e) {
    console.error("[voice/query] anthropic request failed", e);
    return NextResponse.json(
      { error: "Could not complete voice routing" },
      { status: 502 },
    );
  }
}
