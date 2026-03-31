"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { businessHoursSchema } from "@/lib/validations/onboarding";
import { US_STATES } from "@/lib/constants/usStates";
import { BusinessHoursFields } from "./BusinessHoursFields";
import type { AccountRow } from "./types";

const VERTICALS = [
  { value: "hvac", label: "HVAC" },
  { value: "plumbing", label: "Plumbing" },
  { value: "electrical", label: "Electrical" },
  { value: "roofing", label: "Roofing" },
  { value: "landscaping", label: "Landscaping" },
  { value: "other", label: "Other" },
] as const;

const schema = z.object({
  business_name: z.string().min(1, "Business name is required"),
  phone: z.string().max(40).optional().nullable(),
  email: z.union([z.string().email(), z.literal("")]).optional(),
  address_city: z.string().max(100).optional().nullable(),
  address_state: z.string().max(100).optional().nullable(),
  vertical: z.enum([
    "hvac",
    "plumbing",
    "electrical",
    "roofing",
    "landscaping",
    "other",
  ]),
  business_hours: businessHoursSchema,
});

type FormValues = z.infer<typeof schema>;

function parseHours(raw: unknown): FormValues["business_hours"] {
  const parsed = businessHoursSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  return { preset: "weekday_8_5" };
}

export function BusinessProfileForm({ account }: { account: AccountRow }) {
  const router = useRouter();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      business_name: account.business_name,
      phone: account.phone ?? "",
      email: account.email ?? "",
      address_city: account.address_city ?? "",
      address_state: account.address_state ?? "",
      vertical:
        (account.vertical as FormValues["vertical"] | null) ?? "hvac",
      business_hours: parseHours(account.business_hours),
    },
  });

  async function onSubmit(values: FormValues) {
    const res = await fetch("/api/settings/business", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        business_name: values.business_name,
        phone: values.phone || null,
        email: values.email || null,
        address_city: values.address_city || null,
        address_state: values.address_state || null,
        vertical: values.vertical,
        business_hours: values.business_hours,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      warnings?: string[];
      error?: unknown;
    };
    if (!res.ok) {
      toast.error(
        typeof data.error === "string"
          ? data.error
          : "Could not save settings",
      );
      return;
    }
    if (data.warnings?.includes("ghl_location_name")) {
      toast.warning(
        "Saved locally, but we couldn't sync the name to your phone system. We'll retry automatically.",
      );
    } else {
      toast.success("Settings saved");
    }
    router.refresh();
    form.reset(values);
  }

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      className="mx-auto max-w-2xl space-y-4 rounded-xl border bg-card p-4 shadow-sm md:p-6"
    >
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Business profile
      </h2>
      <div className="space-y-2">
        <Label htmlFor="business_name">Business name</Label>
        <Input id="business_name" {...form.register("business_name")} />
        {form.formState.errors.business_name && (
          <p className="text-xs text-destructive">
            {form.formState.errors.business_name.message}
          </p>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="phone">Primary phone</Label>
          <Input id="phone" type="tel" {...form.register("phone")} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" {...form.register("email")} />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="address_city">City</Label>
          <Input id="address_city" {...form.register("address_city")} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="address_state">State</Label>
          <select
            id="address_state"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            {...form.register("address_state")}
          >
            <option value="">Select state</option>
            {US_STATES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="vertical">Industry / vertical</Label>
        <select
          id="vertical"
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          {...form.register("vertical")}
        >
          {VERTICALS.map((v) => (
            <option key={v.value} value={v.value}>
              {v.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <Label className="mb-2 block">Business hours</Label>
        <BusinessHoursFields
          value={{ preset: form.watch("business_hours.preset") }}
          onChange={(next) =>
            form.setValue("business_hours", {
              ...form.getValues("business_hours"),
              preset: next.preset,
            })
          }
        />
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
