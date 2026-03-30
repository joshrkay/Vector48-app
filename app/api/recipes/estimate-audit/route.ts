import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServerClient } from "@/lib/supabase/server";
import { buildEstimateAuditSystemPrompt } from "@/lib/prompts/estimateAudit";
import { analyzeBodySchema } from "@/lib/recipes/estimate-audit/schema";
import { parseEstimateAuditModelJson } from "@/lib/recipes/estimate-audit/parseModelJson";

const MODEL = "claude-sonnet-4-6";

export async function POST(req: Request) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: account } = await supabase
    .from("accounts")
    .select("id")
    .eq("owner_user_id", user.id)
    .single();

  if (!account) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rawBody = await req.json().catch(() => null);
  const parsedBody = analyzeBodySchema.safeParse(rawBody);
  if (!parsedBody.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { estimateText, vertical, jobType } = parsedBody.data;
  const trimmed = estimateText.trim();
  if (trimmed.length === 0) {
    return NextResponse.json({ error: "estimateText is required" }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("[estimate-audit] ANTHROPIC_API_KEY missing");
    return NextResponse.json(
      { error: "Estimate audit is not configured" },
      { status: 503 },
    );
  }

  const system = buildEstimateAuditSystemPrompt(vertical);
  const userContent = `Job type (free text from the owner): ${jobType}

Estimate text to analyze:
---
${trimmed}
---`;

  const client = new Anthropic({ apiKey });

  let assistantText: string;
  try {
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system,
      messages: [{ role: "user", content: userContent }],
    });
    const block = msg.content[0];
    if (block.type !== "text") {
      console.error("[estimate-audit] unexpected block type", block.type);
      return NextResponse.json(
        { error: "Unexpected model response" },
        { status: 502 },
      );
    }
    assistantText = block.text;
  } catch (e) {
    console.error("[estimate-audit] anthropic request failed", e);
    return NextResponse.json(
      { error: "Could not complete estimate audit" },
      { status: 502 },
    );
  }

  let auditResult: ReturnType<typeof parseEstimateAuditModelJson>;
  try {
    auditResult = parseEstimateAuditModelJson(assistantText);
  } catch (e) {
    console.error("[estimate-audit] JSON parse failed", e);
    return NextResponse.json(
      { error: "Could not parse audit results" },
      { status: 502 },
    );
  }

  const suggestionsPayload = auditResult.suggestions.map((s) => ({
    item: s.item,
    reason: s.reason,
    estimatedValue: s.estimatedValue,
  }));

  const { data: inserted, error: insertError } = await supabase
    .from("estimate_audit_log")
    .insert({
      account_id: account.id,
      vertical,
      job_type: jobType,
      suggestions: suggestionsPayload,
      total_potential_value: auditResult.totalPotentialValue,
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    console.error("[estimate-audit] insert failed", insertError?.message);
    return NextResponse.json(
      { error: "Could not save audit" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    auditLogId: inserted.id,
    suggestions: auditResult.suggestions,
    totalPotentialValue: auditResult.totalPotentialValue,
  });
}
