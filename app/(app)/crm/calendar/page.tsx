import { redirect } from "next/navigation";
import { requireAccountForUser } from "@/lib/auth/account";
import { createServerClient } from "@/lib/supabase/server";
import { tryGetAccountGhlCredentials } from "@/lib/ghl";
import { cachedGHLClient } from "@/lib/ghl/cache";
import { CalendarClientShell } from "@/components/crm/calendar/CalendarClientShell";
import {
  getStartOfWeek,
  getWeekRange,
  toDateString,
  fromDateString,
} from "@/lib/crm/calendar-utils";

export default async function CalendarPage({
  searchParams,
}: {
  searchParams?: Promise<{ weekStart?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const session = await requireAccountForUser(supabase);
  if (!session) redirect("/login");

  const { data: account } = await supabase
    .from("accounts")
    .select("id, business_hours, ghl_provisioning_status")
    .eq("id", session.accountId)
    .maybeSingle();
  if (!account) redirect("/login");

  // Determine week start from URL param or default to current Monday
  let weekStart: Date;
  if (resolvedSearchParams?.weekStart) {
    try {
      weekStart = fromDateString(resolvedSearchParams.weekStart);
    } catch {
      weekStart = getStartOfWeek(new Date());
    }
  } else {
    weekStart = getStartOfWeek(new Date());
  }
  const { startDate, endDate } = getWeekRange(weekStart);

  // Extract timezone from business_hours JSONB
  const businessHours = account.business_hours as Record<string, unknown> | null;
  const timezone: string =
    typeof businessHours?.timezone === "string" ? businessHours.timezone : "UTC";

  const credentials = await tryGetAccountGhlCredentials(account.id);
  const auth = credentials
    ? { locationId: credentials.locationId, accessToken: credentials.accessToken }
    : null;

  const ghlClient = auth ? cachedGHLClient(account.id) : null;
  const [appointmentsResult, calendarsResult, recipeResult] = await Promise.allSettled([
    ghlClient && auth
      ? ghlClient.getAppointments(
          { startDate, endDate },
          { locationId: auth.locationId, apiKey: auth.accessToken },
        )
      : Promise.resolve({ events: [] }),
    ghlClient && auth
      ? ghlClient.getCalendars({ locationId: auth.locationId, apiKey: auth.accessToken })
      : Promise.resolve({ calendars: [] }),
    supabase
      .from("recipe_activations")
      .select("status")
      .eq("account_id", account.id)
      .eq("recipe_slug", "appointment-reminder")
      .maybeSingle(),
  ]);

  const appointments =
    appointmentsResult.status === "fulfilled"
      ? (appointmentsResult.value.events ?? [])
      : [];

  const calendars =
    calendarsResult.status === "fulfilled"
      ? (calendarsResult.value.calendars ?? [])
      : [];

  const reminderActive =
    recipeResult.status === "fulfilled" &&
    recipeResult.value.data?.status === "active";

  return (
    <CalendarClientShell
      initialAppointments={appointments}
      initialWeekStart={toDateString(weekStart)}
      calendars={calendars}
      timezone={timezone}
      reminderActive={reminderActive}
    />
  );
}
