"use client";

import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Lock } from "lucide-react";
import type { RecipeConfigField } from "@/types/recipes";
import type { AccountProfileSlice } from "@/lib/recipes/activationValidator";
import { buildRecipeConfigZodSchema } from "@/lib/recipes/configSchema";
import {
  getAccountProfileValue,
  isProfileValuePresent,
  profileValueToDisplayString,
} from "@/lib/recipes/profileFields";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

function coerceLockedValue(
  val: unknown,
  field: RecipeConfigField,
): string | number | boolean {
  if (field.type === "number") return Number(val);
  if (field.type === "boolean" || field.type === "toggle") return Boolean(val);
  return profileValueToDisplayString(val);
}

function formatPhoneInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6)
    return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export interface RecipeConfigFormProps {
  configFields: RecipeConfigField[];
  profile: AccountProfileSlice | null;
  formId: string;
  onSubmit: (data: Record<string, unknown>) => void;
  className?: string;
  /** Pre-fill editable fields when activating from a CRM contact (e.g. phone). Profile-locked fields win. */
  contactPrefill?: Record<string, unknown>;
}

export function RecipeConfigForm({
  configFields,
  profile,
  formId,
  onSubmit,
  className,
  contactPrefill,
}: RecipeConfigFormProps) {
  const { lockedKeys, lockedValues, editableFields } = useMemo(() => {
    const locked = new Set<string>();
    const values: Record<string, unknown> = {};

    for (const f of configFields) {
      if (!f.defaultFromProfile || !profile) continue;
      const pv = getAccountProfileValue(profile, f.defaultFromProfile);
      if (!isProfileValuePresent(pv)) continue;
      locked.add(f.name);
      values[f.name] = coerceLockedValue(pv, f);
    }

    return {
      lockedKeys: locked,
      lockedValues: values,
      editableFields: configFields.filter((f) => !locked.has(f.name)),
    };
  }, [configFields, profile]);

  const schema = useMemo(
    () => buildRecipeConfigZodSchema(editableFields),
    [editableFields],
  );

  const defaultValues = useMemo(() => {
    const v: Record<string, unknown> = {};
    for (const f of editableFields) {
      const pre = contactPrefill?.[f.name];
      const hasPre =
        pre !== undefined &&
        pre !== null &&
        (typeof pre !== "string" || pre.trim() !== "");

      if (hasPre) {
        if (f.type === "toggle" || f.type === "boolean") v[f.name] = Boolean(pre);
        else if (f.type === "number")
          v[f.name] = typeof pre === "number" ? pre : Number(pre);
        else if (f.type === "phone")
          v[f.name] = String(pre).replace(/\D/g, "").slice(0, 10);
        else v[f.name] = String(pre);
      } else if (f.type === "toggle" || f.type === "boolean") v[f.name] = false;
      else if (f.type === "number") v[f.name] = undefined;
      else v[f.name] = "";
    }
    return v;
  }, [editableFields, contactPrefill]);

  const form = useForm<Record<string, unknown>>({
    resolver: zodResolver(schema),
    defaultValues,
  });

  useEffect(() => {
    form.reset(defaultValues);
  }, [defaultValues, form]);

  const mergedSubmit = (data: Record<string, unknown>) => {
    onSubmit({ ...lockedValues, ...data });
  };

  const lockedFields = configFields.filter((f) => lockedKeys.has(f.name));

  return (
    <Form {...form}>
      <form
        id={formId}
        className={cn("space-y-6", className)}
        onSubmit={form.handleSubmit(mergedSubmit)}
      >
        {lockedFields.length > 0 && (
          <FieldGroup
            title="Pulled from your profile"
            hint="These fields stay in sync with your account. Update them in Settings."
          >
            <div className="space-y-2">
              {lockedFields.map((field) => (
                <LockedFieldRow
                  key={field.name}
                  field={field}
                  display={profileValueToDisplayString(lockedValues[field.name])}
                />
              ))}
            </div>
          </FieldGroup>
        )}

        {editableFields.length > 0 && (
          <FieldGroup title="Your settings">
            <div className="space-y-4">
              {editableFields.map((field) => (
                <FormField
                  key={field.name}
                  control={form.control}
                  name={field.name}
                  render={({ field: fCtrl }) => (
                    <FormItem>
                      <FormLabel className="text-[13px] font-medium text-slate-800">
                        {field.label}
                        {field.required ? (
                          <span className="text-destructive"> *</span>
                        ) : null}
                      </FormLabel>
                      <FormControl>
                        {field.type === "textarea" ? (
                          <textarea
                            className="flex min-h-[92px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm leading-relaxed shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                            placeholder={field.placeholder}
                            value={String(fCtrl.value ?? "")}
                            onChange={(e) => fCtrl.onChange(e.target.value)}
                            onBlur={fCtrl.onBlur}
                            name={fCtrl.name}
                            ref={fCtrl.ref}
                          />
                        ) : field.type === "phone" ? (
                          <Input
                            type="tel"
                            autoComplete="tel"
                            placeholder={field.placeholder ?? "(555) 123-4567"}
                            value={formatPhoneInput(String(fCtrl.value ?? ""))}
                            onChange={(e) => {
                              const d = e.target.value
                                .replace(/\D/g, "")
                                .slice(0, 10);
                              fCtrl.onChange(d);
                            }}
                            onBlur={fCtrl.onBlur}
                            name={fCtrl.name}
                            ref={fCtrl.ref}
                          />
                        ) : field.type === "number" ? (
                          <Input
                            type="number"
                            placeholder={field.placeholder}
                            value={
                              fCtrl.value === undefined || fCtrl.value === ""
                                ? ""
                                : String(fCtrl.value)
                            }
                            onChange={(e) => {
                              const v = e.target.value;
                              fCtrl.onChange(v === "" ? undefined : Number(v));
                            }}
                            onBlur={fCtrl.onBlur}
                            name={fCtrl.name}
                            ref={fCtrl.ref}
                          />
                        ) : field.type === "select" && field.options?.length ? (
                          <Select
                            value={String(fCtrl.value ?? "")}
                            onValueChange={fCtrl.onChange}
                          >
                            <SelectTrigger>
                              <SelectValue
                                placeholder={
                                  field.placeholder ?? `Select ${field.label}`
                                }
                              />
                            </SelectTrigger>
                            <SelectContent>
                              {field.options.map((opt) => (
                                <SelectItem key={opt} value={opt}>
                                  {opt}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : field.type === "toggle" || field.type === "boolean" ? (
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={Boolean(fCtrl.value)}
                              onCheckedChange={fCtrl.onChange}
                            />
                            <span className="text-sm text-slate-600">
                              {Boolean(fCtrl.value) ? "On" : "Off"}
                            </span>
                          </div>
                        ) : (
                          <Input
                            placeholder={field.placeholder}
                            value={String(fCtrl.value ?? "")}
                            onChange={fCtrl.onChange}
                            onBlur={fCtrl.onBlur}
                            name={fCtrl.name}
                            ref={fCtrl.ref}
                          />
                        )}
                      </FormControl>
                      {field.helperText && (
                        <p className="text-[12px] leading-relaxed text-slate-500">
                          {field.helperText}
                        </p>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ))}
            </div>
          </FieldGroup>
        )}
      </form>
    </Form>
  );
}

function FieldGroup({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <header>
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          {title}
        </h3>
        {hint && <p className="mt-1 text-[12px] text-slate-500">{hint}</p>}
      </header>
      {children}
    </section>
  );
}

function LockedFieldRow({
  field,
  display,
}: {
  field: RecipeConfigField;
  display: string;
}) {
  return (
    <div className="flex gap-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3">
      <Lock className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" strokeWidth={2} />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-slate-800">{field.label}</p>
        <p className="mt-0.5 whitespace-pre-wrap break-words text-[13px] text-slate-600">
          {display || "—"}
        </p>
      </div>
    </div>
  );
}
