import { NextRequest, NextResponse } from "next/server";
import { requireAccountForUser } from "@/lib/auth/account";
import { getAccountGhlCredentials } from "@/lib/ghl";
import { getContact } from "@/lib/ghl/contacts";
import { getRecipeActivityForContact } from "@/lib/recipes/contactRecipeActivity";
import { createServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createServerClient();
  const session = await requireAccountForUser(supabase);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const contactId = request.nextUrl.searchParams.get("contactId");
  if (!contactId?.trim()) {
    return NextResponse.json({ error: "contactId is required" }, { status: 400 });
  }

  try {
    const activity = await getRecipeActivityForContact({
      accountId: session.accountId,
      contactId: contactId.trim(),
      supabase,
      getCredentials: getAccountGhlCredentials,
      fetchContact: getContact,
    });

    return NextResponse.json({
      active: activity.active,
      recipeSlugs: activity.recipeSlugs,
    });
  } catch (error) {
    console.error("[active-for-contact]", error);
    return NextResponse.json({ error: "Failed to resolve contact or activations" }, { status: 502 });
  }
}
