import { NextRequest, NextResponse } from "next/server";
import { requireAccountForUser } from "@/lib/auth/account";
import { getAccountGhlCredentials } from "@/lib/ghl";
import { getContact } from "@/lib/ghl/contacts";
import {
  getActivationsMatchingContactPhone,
  normalizePhoneDigits,
  type RecipeActivationRow,
} from "@/lib/recipes/phoneActivationMatch";
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
    const [{ data: activationRows, error: actError }, ghlCreds] = await Promise.all([
      supabase
        .from("recipe_activations")
        .select("*")
        .eq("account_id", session.accountId)
        .eq("status", "active"),
      getAccountGhlCredentials(session.accountId),
    ]);

    if (actError) {
      console.error("[active-for-contact] activations", actError.message);
      return NextResponse.json({ error: "Failed to load activations" }, { status: 502 });
    }

    const activations = (activationRows ?? []) as RecipeActivationRow[];
    const { locationId, accessToken } = ghlCreds;
    const { contact } = await getContact(contactId.trim(), {
      locationId,
      apiKey: accessToken,
    });

    const digits = normalizePhoneDigits(contact.phone);
    const matched = getActivationsMatchingContactPhone(activations, digits);

    return NextResponse.json({
      active: matched.length > 0,
      recipeSlugs: matched.map((m) => m.recipe_slug),
    });
  } catch (error) {
    console.error("[active-for-contact]", error);
    return NextResponse.json({ error: "Failed to resolve contact or activations" }, { status: 502 });
  }
}
