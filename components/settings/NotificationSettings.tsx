"use client";

import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import type { AccountRow } from "./types";

const schema = z
  .object({
    notification_contact_name: z.string().max(200),
    notification_contact_phone: z.string().max(200),
    notifications_enabled: z.boolean(),
    notification_email: z.string().max(200),
    quiet_hours_enabled: z.boolean(),
    quiet_hours_start: z.string(),
    quiet_hours_end: z.string(),
  })
  .superRefine((data, ctx) => {
    if (data.notifications_enabled) {
      const r = z.string().email().safeParse(data.notification_email.trim());
      if (!r.success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["notification_email"],
          message: "Enter a valid notification email",
        });
      }
    }
    if (data.quiet_hours_enabled) {
      if (!data.quiet_hours_start || !data.quiet_hours_end) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["quiet_hours_start"],
          message: "Set start and end times",
        });
      }
    }
  });

type FormValues = z.infer<typeof schema>;

function toTimeInput(raw: string | null): string {
  if (!raw) return "";
  const m = String(raw).match(/(\d{1,2}):(\d{2})/);
  if (!m) return "";
  const hh = m[1].padStart(2, "0");
  return `${hh}:${m[2]}`;
}

export function NotificationSettings({ account }: { account: AccountRow }) {
  const router = useRouter();
  const qhStart = toTimeInput(account.quiet_hours_start);
  const qhEnd = toTimeInput(account.quiet_hours_end);
  const quietEnabled = Boolean(qhStart && qhEnd);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      notification_contact_name: account.notification_contact_name ?? "",
      notification_contact_phone: account.notification_contact_phone ?? "",
      notifications_enabled: account.notifications_enabled ?? true,
      notification_email: account.notification_email ?? "",
      quiet_hours_enabled: quietEnabled,
      quiet_hours_start: qhStart || "22:00",
      quiet_hours_end: qhEnd || "07:00",
    },
  });

  const emailOn = form.watch("notifications_enabled");

  async function onSubmit(values: FormValues) {
    const res = await fetch("/api/settings/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        notification_contact_name: values.notification_contact_name || null,
        notification_contact_phone: values.notification_contact_phone || null,
        notifications_enabled: values.notifications_enabled,
        notification_email:
          values.notifications_enabled && values.notification_email.trim()
            ? values.notification_email.trim()
            : null,
        quiet_hours_start: values.quiet_hours_enabled
          ? values.quiet_hours_start
          : null,
        quiet_hours_end: values.quiet_hours_enabled
          ? values.quiet_hours_end
          : null,
      }),
    });
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: unknown };
      toast.error(
        typeof j.error === "string" ? j.error : "Could not save settings",
      );
      return;
    }
    toast.success("Settings saved");
    router.refresh();
    form.reset(values);
  }

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      className="mx-auto max-w-2xl space-y-6 rounded-xl border bg-card p-4 shadow-sm md:p-6"
    >
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Notifications
      </h2>
      <div className="space-y-2">
        <Label htmlFor="notification_contact_name">Primary contact name</Label>
        <Input
          id="notification_contact_name"
          {...form.register("notification_contact_name")}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="notification_contact_phone">
          Primary contact phone (SMS summaries)
        </Label>
        <Input
          id="notification_contact_phone"
          type="tel"
          {...form.register("notification_contact_phone")}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border p-3">
        <div>
          <Label htmlFor="notifications_enabled">Email notifications</Label>
          <p className="text-xs text-muted-foreground">
            Receive alerts by email when recipes fire
          </p>
        </div>
        <Controller
          control={form.control}
          name="notifications_enabled"
          render={({ field }) => (
            <Switch
              id="notifications_enabled"
              checked={field.value}
              onCheckedChange={field.onChange}
            />
          )}
        />
      </div>
      {emailOn && (
        <div className="space-y-2">
          <Label htmlFor="notification_email">Notification email</Label>
          <Input
            id="notification_email"
            type="email"
            {...form.register("notification_email")}
          />
          {form.formState.errors.notification_email && (
            <p className="text-xs text-destructive">
              {form.formState.errors.notification_email.message}
            </p>
          )}
        </div>
      )}
      <div className="space-y-3 rounded-lg border p-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <Label htmlFor="quiet_hours_enabled">Quiet hours</Label>
            <p className="text-xs text-muted-foreground">
              Don&apos;t send notifications between these times
            </p>
          </div>
          <Controller
            control={form.control}
            name="quiet_hours_enabled"
            render={({ field }) => (
              <Switch
                id="quiet_hours_enabled"
                checked={field.value}
                onCheckedChange={field.onChange}
              />
            )}
          />
        </div>
        {form.watch("quiet_hours_enabled") && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="quiet_hours_start">From</Label>
              <Input
                id="quiet_hours_start"
                type="time"
                {...form.register("quiet_hours_start")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quiet_hours_end">To</Label>
              <Input
                id="quiet_hours_end"
                type="time"
                {...form.register("quiet_hours_end")}
              />
            </div>
          </div>
        )}
        {form.formState.errors.quiet_hours_start && (
          <p className="text-xs text-destructive">
            {form.formState.errors.quiet_hours_start.message}
          </p>
        )}
      </div>
      <Button
        type="submit"
        className="bg-[#00B4A6] text-white hover:bg-[#00B4A6]/90"
        disabled={form.formState.isSubmitting || !form.formState.isDirty}
      >
        Save Changes
      </Button>
    </form>
  );
}
