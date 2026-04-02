import { type NextRequest, NextResponse } from "next/server";
import { requireAccountForUser } from "@/lib/auth/account";
import { getAccountGhlCredentials } from "@/lib/ghl";
import { getContact } from "@/lib/ghl/contacts";
import { RECIPE_CATALOG } from "@/lib/recipes/catalog";
import { normalizePhone } from "@/lib/recipes/contactMatcher";
import { listActiveRecipeActivationsForAccount } from "@/lib/recipes/contactRecipeActivity";
import { normalizePhoneDigits } from "@/lib/recipes/phoneActivationMatch";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createServerClient } from "@/lib/supabase/server";

// Build a slug → name lookup from the static catalog
const RECIPE_NAME_BY_SLUG = new Map(RECIPE_CATALOG.map((r) => [r.slug, r.name]));

interface LastAction {
  eventType: string;
  summary: string;
  at: string;
}

interface ActiveRecipeSummary {
  slug: string;
  name: string;
  status: string;
  lastAction: LastAction | null;
}

export async function GET(request: NextRequest) {
  const supabase = await createServerClient();
  const session = await requireAccountForUser(supabase);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const contactId = searchParams.get("contactId")?.trim() ?? "";
  const phone = searchParams.get("phone")?.trim() ?? "";

  if (!contactId && !phone) {
    return NextResponse.json({ error: "contactId or phone is required" }, { status: 400 });
  }

  try {
    let contactPhone: string | null = null;

    if (contactId) {
      // Fetch contact to get their phone
      const { locationId, accessToken } = await getAccountGhlCredentials(session.accountId);
      const { contact } = await getContact(contactId, { locationId, apiKey: accessToken });
      contactPhone = contact.phone ?? null;
    } else {
      contactPhone = phone;
    }

    // Normalize using the +1-aware normalizer for matching
    const normalizedPhone = normalizePhone(contactPhone);
    if (!normalizedPhone) {
      return NextResponse.json({ activeRecipes: [] });
    }

    // Load all active activations for this account
    const activations = await listActiveRecipeActivationsForAccount(supabase, session.accountId);

    // Match activations by phone (config.phone field, normalized)
    const matched = activations.filter((activation) => {
      const cfg = (activation.config ?? {}) as Record<string, unknown>;
      const cfgPhone = normalizePhoneDigits(String(cfg.phone ?? ""));
      const cfgPhoneNormalized = normalizePhone(cfgPhone);
      return cfgPhoneNormalized.length > 0 && cfgPhoneNormalized === normalizedPhone;
    });

    if (matched.length === 0) {
      return NextResponse.json({ activeRecipes: [] });
    }

    const matchedSlugs = matched.map((a) => a.recipe_slug);

    // Fetch recent automation_events per recipe_slug and take the first
    // (most recent) per slug in JS.  Capped at 20 per matched slug to avoid
    // unbounded table scans as the table grows.  A DISTINCT ON query via .rpc()
    // would be more efficient long-term if volume warrants it.
    const admin = getSupabaseAdmin();
    const { data: events, error: eventsError } = await admin
      .from("automation_events")
      .select("recipe_slug, event_type, summary, created_at")
      .eq("account_id", session.accountId)
      .in("recipe_slug", matchedSlugs)
      .order("created_at", { ascending: false })
      .limit(matchedSlugs.length * 20);

    if (eventsError) {
      console.error("[status-for-contact] events query", eventsError.message);
    }

    // Take only the first (most recent) event per slug
    const lastActionBySlug = new Map<string, LastAction>();
    for (const event of events ?? []) {
      if (event.recipe_slug && !lastActionBySlug.has(event.recipe_slug)) {
        lastActionBySlug.set(event.recipe_slug, {
          eventType: event.event_type,
          summary: event.summary ?? "",
          at: event.created_at,
        });
      }
    }

    const activeRecipes: ActiveRecipeSummary[] = matched.map((activation) => ({
      slug: activation.recipe_slug,
      name: RECIPE_NAME_BY_SLUG.get(activation.recipe_slug) ?? activation.recipe_slug,
      status: activation.status,
      lastAction: lastActionBySlug.get(activation.recipe_slug) ?? null,
    }));

    return NextResponse.json({ activeRecipes });
  } catch (err) {
    console.error("[status-for-contact]", err);
    return NextResponse.json({ error: "Failed to get recipe status" }, { status: 502 });
  }
}
