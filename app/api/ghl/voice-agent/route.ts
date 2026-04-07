import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireAccountForUser } from "@/lib/auth/account";
import { getAccountGhlCredentials, withAuthRetry } from "@/lib/ghl";
import { buildVoiceAgentPayload } from "@/lib/ghl/voiceAgent";
import { createServerClient } from "@/lib/supabase/server";

const createBodySchema = z.object({
  greeting: z.string().optional(),
  voiceGender: z.enum(["male", "female"]).optional(),
  forwardingNumber: z.string().optional(),
  timezone: z.string().optional(),
  /** Optional webhook URL for post-call actions */
  webhookUrl: z.string().url().optional(),
});

export async function POST(request: NextRequest) {
  const supabase = await createServerClient();
  const session = await requireAccountForUser(supabase);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: z.infer<typeof createBodySchema>;
  try {
    const raw = await request.json();
    const parsed = createBodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }
    body = parsed.data;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Fetch account details for business name and vertical
  const { data: account } = await supabase
    .from("accounts")
    .select("id, business_name, vertical")
    .eq("id", session.accountId)
    .single();

  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  try {
    const { locationId } = await getAccountGhlCredentials(session.accountId);

    const payload = buildVoiceAgentPayload({
      locationId,
      businessName: account.business_name,
      vertical: account.vertical,
      greeting: body.greeting,
      voiceGender: body.voiceGender,
      forwardingNumber: body.forwardingNumber,
      timezone: body.timezone,
    });

    const agentResponse = await withAuthRetry(session.accountId, async (client) => {
      const response = await client.voiceAgent.create(payload);

      // If a webhook URL is provided, create a post-call action
      if (body.webhookUrl && response.agent?.id) {
        await client.voiceAgent.createAction(response.agent.id, {
          type: "webhook",
          url: body.webhookUrl,
          method: "POST",
          description: "Post-call summary webhook",
        });
      }

      return response;
    });

    return NextResponse.json({ agent: agentResponse.agent }, { status: 201 });
  } catch (error) {
    console.error("[ghl-voice-agent-create]", error);
    return NextResponse.json(
      { error: "Failed to create voice agent" },
      { status: 502 },
    );
  }
}
