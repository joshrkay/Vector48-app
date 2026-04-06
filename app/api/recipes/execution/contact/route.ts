import { type NextRequest, NextResponse } from "next/server";
import { getExecutionAuthConfigError, validateExecutionAuth } from "@/lib/recipes/executionAuth";
import { getAccountGhlCredentials } from "@/lib/ghl";
import { getContact } from "@/lib/ghl/contacts";

export async function GET(request: NextRequest) {
  const authConfigError = getExecutionAuthConfigError();
  if (authConfigError) {
    return NextResponse.json({ error: authConfigError }, { status: 500 });
  }

  const { searchParams } = request.nextUrl;
  const accountId = searchParams.get("accountId")?.trim() ?? "";
  const contactId = searchParams.get("contactId")?.trim() ?? "";

  if (!accountId) {
    return NextResponse.json({ error: "accountId is required" }, { status: 400 });
  }
  if (!contactId) {
    return NextResponse.json({ error: "contactId is required" }, { status: 400 });
  }

  if (!validateExecutionAuth(request, accountId)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { locationId, accessToken } = await getAccountGhlCredentials(accountId);
    const { contact } = await getContact(contactId, { locationId, apiKey: accessToken });
    return NextResponse.json({ contact });
  } catch (err) {
    console.error("[execution/contact]", err);
    return NextResponse.json({ error: "Failed to fetch contact" }, { status: 502 });
  }
}
