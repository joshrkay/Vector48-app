import { NextResponse } from "next/server";
import { reconcileProvisioning } from "@/lib/n8n/provision";

/**
 * Retries provisioning for activations that stayed active with null n8n_workflow_id
 * (e.g. N8N unavailable during the initial enqueue). Secure with CRON_SECRET.
 */
export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await reconcileProvisioning();
  return NextResponse.json(result);
}
