"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { formatCurrency, type PipelineOpportunityDetail, type PipelineOpportunitySummary } from "@/lib/crm/pipeline";
import { useMediaQuery } from "@/lib/hooks/useMediaQuery";
import type { GHLPipelineStage } from "@/lib/ghl/types";
import { formatRelativeTime } from "@/components/crm/contacts/contactUtils";

interface OpportunityDetailSheetProps {
  open: boolean;
  opportunity: PipelineOpportunitySummary | null;
  stages: GHLPipelineStage[];
  onOpenChange: (open: boolean) => void;
  onMoveStage: (opportunityId: string, stageId: string) => Promise<boolean>;
  onCloseStatus: (
    opportunityId: string,
    status: "won" | "lost",
  ) => Promise<boolean>;
}

export function OpportunityDetailSheet({
  open,
  opportunity,
  stages,
  onOpenChange,
  onMoveStage,
  onCloseStatus,
}: OpportunityDetailSheetProps) {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const [detail, setDetail] = useState<PipelineOpportunityDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMutating, setIsMutating] = useState(false);

  useEffect(() => {
    if (!open || !opportunity) {
      return;
    }

    const opportunityId = opportunity.id;
    const controller = new AbortController();

    async function loadDetail() {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/ghl/opportunities/${opportunityId}/detail`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("Failed to load opportunity detail");
        }

        const data = (await response.json()) as PipelineOpportunityDetail;
        setDetail(data);
      } catch (caught) {
        if (!controller.signal.aborted) {
          setError(caught instanceof Error ? caught.message : "Failed to load opportunity detail");
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    void loadDetail();

    return () => controller.abort();
  }, [open, opportunity]);

  useEffect(() => {
    if (!open) {
      setDetail(null);
      setError(null);
      setIsMutating(false);
    }
  }, [open]);

  async function handleStageChange(nextStageId: string) {
    if (!opportunity || nextStageId === opportunity.stageId) return;

    setIsMutating(true);
    const succeeded = await onMoveStage(opportunity.id, nextStageId);
    setIsMutating(false);

    if (succeeded) {
      setDetail((current) =>
        current
          ? {
              ...current,
              opportunity: {
                ...current.opportunity,
                stageId: nextStageId,
              },
            }
          : current,
      );
    }
  }

  async function handleStatusChange(status: "won" | "lost") {
    if (!opportunity) return;

    setIsMutating(true);
    const succeeded = await onCloseStatus(opportunity.id, status);
    setIsMutating(false);

    if (succeeded) {
      onOpenChange(false);
    }
  }

  const resolvedDetail =
    detail && opportunity
      ? {
          ...detail,
          opportunity: {
            ...detail.opportunity,
            stageId: opportunity.stageId,
          },
        }
      : detail;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isDesktop ? "right" : "bottom"}
        className="w-full gap-0 overflow-y-auto p-0 sm:max-w-xl"
      >
        <SheetHeader className="border-b border-[var(--v48-border)] px-5 py-4 text-left">
          <SheetTitle className="font-heading text-xl">
            {opportunity?.contactName ?? "Opportunity"}
          </SheetTitle>
          <SheetDescription>
            Review details, update stage, or close the opportunity.
          </SheetDescription>
        </SheetHeader>

        {!opportunity ? null : isLoading && !resolvedDetail ? (
          <div className="flex items-center gap-3 px-5 py-8 text-sm text-[var(--text-secondary)]">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading opportunity detail…
          </div>
        ) : error && !resolvedDetail ? (
          <div className="px-5 py-8 text-sm text-destructive">{error}</div>
        ) : (
          <div className="space-y-6 px-5 py-5">
            <section className="space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-[var(--text-secondary)]">
                    Contact
                  </p>
                  <Link
                    href={`/crm/contacts/${opportunity.contactId}`}
                    className="text-sm font-semibold text-[var(--text-primary)] underline-offset-4 hover:underline"
                  >
                    {resolvedDetail?.contact.name ?? opportunity.contactName}
                  </Link>
                </div>
                <span className="text-sm font-semibold text-[var(--text-primary)]">
                  {formatCurrency(opportunity.monetaryValue)}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-3 rounded-2xl border border-[var(--v48-border)] bg-[var(--bg)] p-4">
                <div>
                  <p className="text-xs uppercase tracking-wide text-[var(--text-secondary)]">
                    Job Description
                  </p>
                  <p className="mt-1 text-sm text-[var(--text-primary)]">
                    {opportunity.jobType}
                  </p>
                </div>

                <div>
                  <p className="text-xs uppercase tracking-wide text-[var(--text-secondary)]">
                    Stage
                  </p>
                  <Select
                    value={opportunity.stageId}
                    onValueChange={(value) => void handleStageChange(value)}
                    disabled={isMutating}
                  >
                    <SelectTrigger className="mt-1 bg-white">
                      <SelectValue placeholder="Select stage" />
                    </SelectTrigger>
                    <SelectContent>
                      {stages.map((stage) => (
                        <SelectItem key={stage.id} value={stage.id}>
                          {stage.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <p className="text-xs uppercase tracking-wide text-[var(--text-secondary)]">
                    Recipes
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(resolvedDetail?.opportunity.recipeSlugs ?? opportunity.recipeSlugs).length > 0 ? (
                      (resolvedDetail?.opportunity.recipeSlugs ?? opportunity.recipeSlugs).map((slug) => (
                        <Badge
                          key={slug}
                          className="border-transparent bg-teal-100 text-teal-700 hover:bg-teal-100"
                        >
                          {slug}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-sm text-[var(--text-secondary)]">
                        No active recipes.
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </section>

            <section>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">Notes</h3>
                <span className="text-xs text-[var(--text-secondary)]">
                  {resolvedDetail?.notes.length ?? 0}
                </span>
              </div>
              {resolvedDetail?.notes.length ? (
                <div className="space-y-2">
                  {resolvedDetail.notes.map((note) => (
                    <div
                      key={note.id}
                      className="rounded-xl border border-[var(--v48-border)] bg-white p-3"
                    >
                      <p className="text-sm text-[var(--text-primary)]">{note.body}</p>
                      <p className="mt-2 text-xs text-[var(--text-secondary)]">
                        {formatRelativeTime(note.dateAdded)}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-[var(--v48-border)] bg-white px-4 py-6 text-sm text-[var(--text-secondary)]">
                  No notes yet.
                </div>
              )}
            </section>

            <section>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">Activity</h3>
                <span className="text-xs text-[var(--text-secondary)]">
                  {resolvedDetail?.activity.length ?? 0}
                </span>
              </div>
              {resolvedDetail?.activity.length ? (
                <div className="space-y-2">
                  {resolvedDetail.activity.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-xl border border-[var(--v48-border)] bg-white p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-[var(--text-primary)]">
                            {item.title}
                          </p>
                          <p className="mt-1 text-sm text-[var(--text-secondary)]">
                            {item.body}
                          </p>
                        </div>
                        <span className="shrink-0 text-xs text-[var(--text-secondary)]">
                          {formatRelativeTime(item.timestamp)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-[var(--v48-border)] bg-white px-4 py-6 text-sm text-[var(--text-secondary)]">
                  No recent activity found.
                </div>
              )}
            </section>

            <section className="flex flex-col gap-2 border-t border-[var(--v48-border)] pt-4 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                className="sm:flex-1"
                disabled={isMutating}
                onClick={() => void handleStatusChange("lost")}
              >
                Close Lost
              </Button>
              <Button
                type="button"
                className="sm:flex-1"
                disabled={isMutating}
                onClick={() => void handleStatusChange("won")}
              >
                Close Won
              </Button>
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
