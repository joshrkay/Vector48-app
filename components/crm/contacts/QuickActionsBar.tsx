"use client";

import { useState } from "react";
import {
  MessageSquare,
  CalendarPlus,
  StickyNote,
  GitBranch,
  Zap,
  Send,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AddAppointmentSheet } from "./AddAppointmentSheet";
import { ActivationSheet } from "@/components/recipes/ActivationSheet";
import { cn } from "@/lib/utils";
import type { GHLContact, GHLOpportunity, GHLPipeline, GHLMessageType } from "@/lib/ghl/types";
import type { RecipeWithStatus } from "@/lib/recipes/types";
import type { AccountProfileSlice } from "@/lib/recipes/activationValidator";

interface Props {
  contactId: string;
  contact: GHLContact;
  primaryConversationId: string | null;
  opportunities: GHLOpportunity[];
  pipelines: GHLPipeline[];
  availableRecipes: RecipeWithStatus[];
  profile: AccountProfileSlice | null;
  connectedProviders: string[];
}

type ActivePanel = "message" | "note" | "stage" | "recipe" | null;

export function QuickActionsBar({
  contactId,
  contact,
  primaryConversationId,
  opportunities,
  pipelines,
  availableRecipes,
  profile,
  connectedProviders,
}: Props) {
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);
  const [showSchedule, setShowSchedule] = useState(false);
  const [activationRecipe, setActivationRecipe] = useState<RecipeWithStatus | null>(null);

  // Message panel state
  const [messageText, setMessageText] = useState("");
  const [messageType, setMessageType] = useState<"TYPE_SMS" | "TYPE_EMAIL">("TYPE_SMS");
  const [sendingMessage, setSendingMessage] = useState(false);

  // Note panel state
  const [noteText, setNoteText] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  // Stage panel state
  const [selectedPipelineId, setSelectedPipelineId] = useState(
    opportunities[0]?.pipelineId ?? "",
  );
  const [selectedStageId, setSelectedStageId] = useState(
    opportunities[0]?.pipelineStageId ?? "",
  );
  const [movingStage, setMovingStage] = useState(false);

  const primaryOpportunity = opportunities[0] ?? null;
  const selectedPipeline = pipelines.find((p) => p.id === selectedPipelineId);

  function togglePanel(panel: ActivePanel) {
    setActivePanel((prev) => (prev === panel ? null : panel));
  }

  async function handleSendMessage() {
    const text = messageText.trim();
    if (!text || !primaryConversationId) return;
    setSendingMessage(true);
    try {
      const res = await fetch(`/api/ghl/conversations/${primaryConversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: messageType as GHLMessageType,
          message: text,
          contactId,
        }),
      });
      if (!res.ok) throw new Error("Send failed");
      toast.success("Message sent");
      setMessageText("");
      setActivePanel(null);
    } catch {
      toast.error("Failed to send message");
    } finally {
      setSendingMessage(false);
    }
  }

  async function handleSaveNote() {
    const text = noteText.trim();
    if (!text) return;
    setSavingNote(true);
    try {
      const res = await fetch(`/api/ghl/contacts/${contactId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      if (!res.ok) throw new Error("Save failed");
      toast.success("Note saved");
      setNoteText("");
      setActivePanel(null);
    } catch {
      toast.error("Failed to save note");
    } finally {
      setSavingNote(false);
    }
  }

  async function handleMoveStage() {
    if (!primaryOpportunity || !selectedStageId) return;
    setMovingStage(true);
    try {
      const res = await fetch(`/api/ghl/opportunities/${primaryOpportunity.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pipelineStageId: selectedStageId }),
      });
      if (!res.ok) throw new Error("Move failed");
      toast.success("Stage updated");
      setActivePanel(null);
    } catch {
      toast.error("Failed to move stage");
    } finally {
      setMovingStage(false);
    }
  }

  return (
    <div className="rounded-2xl border border-[var(--v48-border)] bg-white p-4">
      {/* Action buttons row */}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={activePanel === "message" ? "default" : "outline"}
          onClick={() => togglePanel("message")}
          className="gap-1.5"
        >
          <MessageSquare className="h-3.5 w-3.5" />
          Send Message
        </Button>

        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowSchedule(true)}
          className="gap-1.5"
        >
          <CalendarPlus className="h-3.5 w-3.5" />
          Schedule
        </Button>

        <Button
          size="sm"
          variant={activePanel === "note" ? "default" : "outline"}
          onClick={() => togglePanel("note")}
          className="gap-1.5"
        >
          <StickyNote className="h-3.5 w-3.5" />
          Add Note
        </Button>

        <Button
          size="sm"
          variant={activePanel === "stage" ? "default" : "outline"}
          onClick={() => togglePanel("stage")}
          disabled={pipelines.length === 0}
          className="gap-1.5"
          title={pipelines.length === 0 ? "No pipelines found" : undefined}
        >
          <GitBranch className="h-3.5 w-3.5" />
          Move Stage
        </Button>

        <Button
          size="sm"
          variant={activePanel === "recipe" ? "default" : "outline"}
          onClick={() => togglePanel("recipe")}
          disabled={availableRecipes.length === 0}
          className="gap-1.5"
          title={availableRecipes.length === 0 ? "No recipes available" : undefined}
        >
          <Zap className="h-3.5 w-3.5" />
          Activate Recipe
        </Button>
      </div>

      {/* Inline panels */}
      {activePanel === "message" ? (
        <div className="mt-3 rounded-xl border border-[var(--v48-border)] bg-slate-50 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-[var(--text-secondary)]">Send Message</span>
            <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setActivePanel(null)}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
          {!primaryConversationId ? (
            <p className="text-sm text-[var(--text-secondary)]">
              No conversation found. Start one in the Conversations section below.
            </p>
          ) : (
            <>
              <div className="mb-2 flex gap-2">
                <Select
                  value={messageType}
                  onValueChange={(v) => setMessageType(v as "TYPE_SMS" | "TYPE_EMAIL")}
                >
                  <SelectTrigger className="h-8 w-28 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TYPE_SMS">SMS</SelectItem>
                    <SelectItem value="TYPE_EMAIL">Email</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <textarea
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                placeholder="Type your message…"
                rows={3}
                className="w-full resize-none rounded-lg border border-[var(--v48-border)] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--v48-accent)]"
              />
              <div className="mt-2 flex justify-end">
                <Button
                  size="sm"
                  onClick={handleSendMessage}
                  disabled={!messageText.trim() || sendingMessage}
                  className="gap-1"
                >
                  <Send className="h-3.5 w-3.5" />
                  {sendingMessage ? "Sending…" : "Send"}
                </Button>
              </div>
            </>
          )}
        </div>
      ) : null}

      {activePanel === "note" ? (
        <div className="mt-3 rounded-xl border border-[var(--v48-border)] bg-slate-50 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-[var(--text-secondary)]">Add Note</span>
            <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setActivePanel(null)}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
          <textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="Write a note…"
            rows={3}
            autoFocus
            className="w-full resize-none rounded-lg border border-[var(--v48-border)] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--v48-accent)]"
          />
          <div className="mt-2 flex justify-end">
            <Button
              size="sm"
              onClick={handleSaveNote}
              disabled={!noteText.trim() || savingNote}
            >
              {savingNote ? "Saving…" : "Save Note"}
            </Button>
          </div>
        </div>
      ) : null}

      {activePanel === "stage" ? (
        <div className="mt-3 rounded-xl border border-[var(--v48-border)] bg-slate-50 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-[var(--text-secondary)]">Move Pipeline Stage</span>
            <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setActivePanel(null)}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
          {!primaryOpportunity ? (
            <p className="text-sm text-[var(--text-secondary)]">
              No pipeline opportunity found for this contact.
            </p>
          ) : (
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <p className="text-xs text-[var(--text-secondary)]">Pipeline</p>
                <Select
                  value={selectedPipelineId}
                  onValueChange={(v) => {
                    setSelectedPipelineId(v);
                    setSelectedStageId("");
                  }}
                >
                  <SelectTrigger className="h-8 w-44 text-xs">
                    <SelectValue placeholder="Select pipeline" />
                  </SelectTrigger>
                  <SelectContent>
                    {pipelines.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-[var(--text-secondary)]">Stage</p>
                <Select
                  value={selectedStageId}
                  onValueChange={setSelectedStageId}
                  disabled={!selectedPipeline}
                >
                  <SelectTrigger className="h-8 w-44 text-xs">
                    <SelectValue placeholder="Select stage" />
                  </SelectTrigger>
                  <SelectContent>
                    {(selectedPipeline?.stages ?? []).map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                size="sm"
                onClick={handleMoveStage}
                disabled={!selectedStageId || movingStage}
                className={cn("h-8")}
              >
                {movingStage ? "Moving…" : "Confirm"}
              </Button>
            </div>
          )}
        </div>
      ) : null}

      {activePanel === "recipe" ? (
        <div className="mt-3 rounded-xl border border-[var(--v48-border)] bg-slate-50 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-[var(--text-secondary)]">Activate Recipe</span>
            <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setActivePanel(null)}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="flex items-end gap-2">
            <div className="space-y-1">
              <p className="text-xs text-[var(--text-secondary)]">Recipe</p>
              <Select onValueChange={(slug) => {
                const r = availableRecipes.find((r) => r.slug === slug);
                if (r) setActivationRecipe(r);
              }}>
                <SelectTrigger className="h-8 w-56 text-xs">
                  <SelectValue placeholder="Select a recipe" />
                </SelectTrigger>
                <SelectContent>
                  {availableRecipes.map((r) => (
                    <SelectItem key={r.slug} value={r.slug}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              size="sm"
              className="h-8"
              disabled={!activationRecipe}
              onClick={() => {
                if (activationRecipe) {
                  setActivePanel(null);
                }
              }}
            >
              Open
            </Button>
          </div>
        </div>
      ) : null}

      {/* Sheets */}
      <AddAppointmentSheet
        open={showSchedule}
        onOpenChange={setShowSchedule}
        contact={contact}
      />

      {activationRecipe ? (
        <ActivationSheet
          open={!!activationRecipe}
          onOpenChange={(open) => {
            if (!open) setActivationRecipe(null);
          }}
          recipe={activationRecipe}
          profile={profile}
          connectedProviders={connectedProviders}
        />
      ) : null}
    </div>
  );
}
