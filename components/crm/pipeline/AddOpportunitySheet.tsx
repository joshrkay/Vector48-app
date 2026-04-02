"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { normalizePipelineOpportunity, type PipelineOpportunitySummary } from "@/lib/crm/pipeline";
import { useMediaQuery } from "@/lib/hooks/useMediaQuery";
import type { CRMContactSearchItem } from "@/lib/crm/contactCache";
import type { CRMContactSearchResponse } from "@/lib/crm/types";
import type { GHLPipelineStage, GHLOpportunity } from "@/lib/ghl/types";

const schema = z.object({
  contactId: z.string().min(1, "Select a contact"),
  jobType: z.string().min(1, "Job type is required"),
  monetaryValue: z.string().optional(),
  stageId: z.string().min(1, "Select a stage"),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

interface AddOpportunitySheetProps {
  open: boolean;
  pipelineId: string;
  stages: GHLPipelineStage[];
  initialStageId: string;
  onOpenChange: (open: boolean) => void;
  onCreated: (opportunity: PipelineOpportunitySummary) => void;
}

export function AddOpportunitySheet({
  open,
  pipelineId,
  stages,
  initialStageId,
  onOpenChange,
  onCreated,
}: AddOpportunitySheetProps) {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<CRMContactSearchItem[]>([]);
  const [selectedContact, setSelectedContact] = useState<CRMContactSearchItem | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      contactId: "",
      jobType: "",
      monetaryValue: "",
      stageId: initialStageId,
      notes: "",
    },
  });

  useEffect(() => {
    if (!open) return;
    form.setValue("stageId", initialStageId);
  }, [form, initialStageId, open]);

  useEffect(() => {
    if (!open) return;

    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setSearchResults([]);
      return;
    }

    const timeout = window.setTimeout(async () => {
      setIsSearching(true);

      try {
        const response = await fetch(`/api/ghl/contacts/search?q=${encodeURIComponent(trimmed)}`);
        if (!response.ok) {
          throw new Error("Contact search failed");
        }

        const data = (await response.json()) as CRMContactSearchResponse;
        setSearchResults(data.contacts ?? []);
      } catch {
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 200);

    return () => window.clearTimeout(timeout);
  }, [open, query]);

  function handleOpenChange(next: boolean) {
    if (!next) {
      form.reset({
        contactId: "",
        jobType: "",
        monetaryValue: "",
        stageId: initialStageId,
        notes: "",
      });
      setQuery("");
      setSearchResults([]);
      setSelectedContact(null);
      setIsSearching(false);
    }

    onOpenChange(next);
  }

  function selectContact(contact: CRMContactSearchItem) {
    setSelectedContact(contact);
    setQuery(contact.name);
    setSearchResults([]);
    form.setValue("contactId", contact.id, { shouldValidate: true });
  }

  async function onSubmit(values: FormValues) {
    if (!selectedContact) {
      form.setError("contactId", { message: "Select a contact" });
      return;
    }

    const monetaryValue = values.monetaryValue?.trim()
      ? Number(values.monetaryValue)
      : null;

    if (monetaryValue !== null && Number.isNaN(monetaryValue)) {
      form.setError("monetaryValue", { message: "Value must be numeric" });
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/ghl/opportunities", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contactId: selectedContact.id,
          pipelineId,
          pipelineStageId: values.stageId,
          jobType: values.jobType.trim(),
          monetaryValue,
          notes: values.notes?.trim() || undefined,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Failed to create opportunity");
      }

      const data = (await response.json()) as { opportunity: GHLOpportunity };

      onCreated(
        normalizePipelineOpportunity(data.opportunity, {
          name: selectedContact.name,
          phone: selectedContact.phone,
        }),
      );

      toast.success("Opportunity added");
      handleOpenChange(false);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Failed to create opportunity");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side={isDesktop ? "right" : "bottom"}
        className="w-full overflow-y-auto sm:max-w-lg"
      >
        <SheetHeader className="text-left">
          <SheetTitle>Add Opportunity</SheetTitle>
          <SheetDescription>
            Create a new opportunity and place it into the selected stage.
          </SheetDescription>
        </SheetHeader>

        <Form {...form}>
          <form
            id="add-opportunity-form"
            onSubmit={form.handleSubmit(onSubmit)}
            className="mt-6 space-y-4"
          >
            <FormField
              control={form.control}
              name="contactId"
              render={() => (
                <FormItem className="relative">
                  <FormLabel>Contact</FormLabel>
                  <FormControl>
                    <Input
                      value={query}
                      onChange={(event) => {
                        const nextValue = event.target.value;
                        setQuery(nextValue);
                        if (!selectedContact || nextValue !== selectedContact.name) {
                          setSelectedContact(null);
                          form.setValue("contactId", "", { shouldValidate: true });
                        }
                      }}
                      placeholder="Search contacts"
                    />
                  </FormControl>

                  {isSearching ? (
                    <div className="mt-2 flex items-center gap-2 rounded-lg border border-[var(--v48-border)] bg-white px-3 py-2 text-sm text-[var(--text-secondary)]">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Searching…
                    </div>
                  ) : null}

                  {!selectedContact && searchResults.length > 0 ? (
                    <div className="mt-2 overflow-hidden rounded-xl border border-[var(--v48-border)] bg-white shadow-sm">
                      {searchResults.map((contact) => (
                        <button
                          key={contact.id}
                          type="button"
                          className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left transition-colors hover:bg-slate-50"
                          onClick={() => selectContact(contact)}
                        >
                          <span className="text-sm font-medium text-[var(--text-primary)]">
                            {contact.name}
                          </span>
                          <span className="text-xs text-[var(--text-secondary)]">
                            {contact.phone ?? contact.email ?? "No contact info"}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : null}

                  {selectedContact ? (
                    <p className="text-xs text-[var(--text-secondary)]">
                      Selected: {selectedContact.name}
                    </p>
                  ) : null}
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="jobType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Job Type</FormLabel>
                  <FormControl>
                    <Input placeholder="AC replacement" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="monetaryValue"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Estimated Value</FormLabel>
                  <FormControl>
                    <Input inputMode="numeric" placeholder="9500" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="stageId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Stage</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select stage" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {stages.map((stage) => (
                        <SelectItem key={stage.id} value={stage.id}>
                          {stage.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <textarea
                      {...field}
                      rows={4}
                      className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      placeholder="Add any notes for the team"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>

        <SheetFooter className="mt-6 border-t border-[var(--v48-border)] pt-4">
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="add-opportunity-form" disabled={isSubmitting}>
            {isSubmitting ? "Saving…" : "Create Opportunity"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
