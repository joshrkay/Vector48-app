import { redirect } from "next/navigation";
import { requireAccountForUser } from "@/lib/auth/account";
import { createServerClient } from "@/lib/supabase/server";
import { tryGetAccountGhlCredentials, withAuthRetry } from "@/lib/ghl";
import { CalendarClientShell } from "@/components/crm/calendar/CalendarClientShell";
import {
  getStartOfWeek,
  getWeekRange,
  toDateString,
  fromDateString,
} from "@/lib/crm/calendar-utils";
import type { GHLAppointment, GHLCalendar } from "@/lib/ghl/types";

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

  let appointments: GHLAppointment[] = [];
  let calendars: GHLCalendar[] = [];
  let ghlError = false;

  if (credentials) {
    try {
      const ghlData = await withAuthRetry(account.id, async (client) => {
        const [appts, cals] = await Promise.all([
          client.appointments.list({ startDate, endDate }),
          client.calendars.list(),
        ]);
        return { appointments: appts, calendars: cals };
      });
      appointments = ghlData.appointments;
      calendars = ghlData.calendars;
    } catch (err) {
      console.error("[calendar] GHL API error:", (err as Error).message);
      ghlError = true;
    }
  }

  const { data: recipeData } = await supabase
    .from("recipe_activations")
    .select("status")
    .eq("account_id", account.id)
    .eq("recipe_slug", "appointment-reminder")
    .maybeSingle();

  const reminderActive = recipeData?.status === "active";

  return (
    <>
      {ghlError && (
        <div className="mx-4 mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          Unable to connect to GoHighLevel. Your credentials may have expired &mdash; please reconnect in Settings.
        </div>
      )}
      <CalendarClientShell
        initialAppointments={appointments}
        initialWeekStart={toDateString(weekStart)}
        calendars={calendars}
        timezone={timezone}
        reminderActive={reminderActive}
      />
    </>
  );
}
