import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, ClipboardList } from "lucide-react";
import { requireAccountForUser } from "@/lib/auth/account";
import { createServerClient } from "@/lib/supabase/server";
import { RECIPE_CATALOG } from "@/lib/recipes/catalog";
import { mergeRecipesWithActivations } from "@/lib/recipes/merge";
import { RecipeGrid } from "@/components/recipes/RecipeGrid";
import type { Vertical } from "@/types/recipes";

export default async function RecipesPage() {
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }
  const session = await requireAccountForUser(supabase);
  if (!session) {
    redirect("/login");
  }

  const { data: account } = await supabase
    .from("accounts")
    .select(
      "id, vertical, plan_slug, phone, voice_gender, greeting_text, business_hours",
    )
    .eq("id", session.accountId)
    .maybeSingle();

  if (!account) {
    redirect("/login");
  }

  const { data: activations } = await supabase
    .from("recipe_activations")
    .select("*")
    .eq("account_id", account.id);

  const { data: integrationRows } = await supabase
    .from("integrations")
    .select("provider, status")
    .eq("account_id", account.id);

  const connectedProviders =
    integrationRows
      ?.filter((r) => r.status === "connected")
      .map((r) => r.provider) ?? [];

  const profile = {
    phone: account.phone,
    voice_gender: account.voice_gender,
    greeting_text: account.greeting_text,
    business_hours: account.business_hours,
  };

  const recipes = mergeRecipesWithActivations(
    RECIPE_CATALOG,
    activations ?? [],
  );

  const activeCount = recipes.filter((r) => r.status === "active").length;
  const availableCount = recipes.filter((r) => r.status === "available").length;
  const comingSoonCount = recipes.filter((r) => r.status === "coming_soon").length;

  return (
    <div>
      <header className="mb-6">
        <h1 className="font-heading text-[28px] font-bold tracking-tight text-slate-900">
          Your Recipes
        </h1>
        <p className="mt-1.5 text-[14px] text-slate-600">
          Automations that run in the background while you run the business.
        </p>
        <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-[13px]">
          <StatPill color="bg-emerald-500" label="Running" count={activeCount} />
          <StatPill color="bg-slate-400" label="Ready to activate" count={availableCount} />
          {comingSoonCount > 0 && (
            <StatPill color="bg-slate-200" label="Coming soon" count={comingSoonCount} />
          )}
        </dl>
      </header>

      <Link
        href="/recipes/estimate-audit"
        className="group mb-6 flex items-start gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
      >
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white">
          <ClipboardList className="h-5 w-5" strokeWidth={1.75} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-heading text-[15px] font-semibold text-slate-900">
              Estimate Audit
            </p>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-slate-600">
              On demand
            </span>
          </div>
          <p className="mt-0.5 text-[13px] leading-relaxed text-slate-600">
            Upload an estimate and Claude flags missed line items and upsells
            before you send it. Not a background automation — run it whenever
            you want.
          </p>
        </div>
        <ArrowRight
          className="mt-3 h-5 w-5 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-700"
          strokeWidth={1.75}
        />
      </Link>

      <RecipeGrid
        recipes={recipes}
        activeCount={activeCount}
        profile={profile}
        connectedProviders={connectedProviders}
        accountVertical={account.vertical as Vertical | null}
      />
    </div>
  );
}

function StatPill({
  label,
  count,
  color,
}: {
  label: string;
  count: number;
  color: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${color}`} />
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-semibold tabular-nums text-slate-900">{count}</dd>
    </div>
  );
}
