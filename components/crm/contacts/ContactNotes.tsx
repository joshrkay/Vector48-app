"use client";

import { useState } from "react";
import { Plus, StickyNote } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatRelativeTime } from "@/lib/dashboard/formatRelativeTime";
import type { GHLNote } from "@/lib/ghl/types";

interface Props {
  notes: GHLNote[] | null;
  contactId: string;
}

export function ContactNotes({ notes: initialNotes, contactId }: Props) {
  const [notes, setNotes] = useState<GHLNote[]>(initialNotes ?? []);
  const [showInput, setShowInput] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const text = noteText.trim();
    if (!text) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/ghl/contacts/${contactId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      if (!res.ok) throw new Error("Save failed");
      const note: GHLNote = await res.json();
      setNotes((prev) => [note, ...prev]);
      setNoteText("");
      setShowInput(false);
      toast.success("Note saved");
    } catch {
      toast.error("Failed to save note");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-[var(--v48-border)] bg-white">
      <div className="flex items-center justify-between border-b border-[var(--v48-border)] px-5 py-3">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">Notes</h2>
        {!showInput ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowInput(true)}
            className="h-7 gap-1 text-xs"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Note
          </Button>
        ) : null}
      </div>

      <div className="p-4 space-y-3">
        {showInput ? (
          <div className="space-y-2">
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Write a note…"
              rows={3}
              autoFocus
              className="w-full resize-none rounded-lg border border-[var(--v48-border)] bg-white px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--v48-accent)]"
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSave} disabled={saving || !noteText.trim()}>
                {saving ? "Saving…" : "Save Note"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setShowInput(false);
                  setNoteText("");
                }}
                disabled={saving}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : null}

        {initialNotes === null ? (
          <p className="text-sm text-[var(--text-secondary)]">Could not load notes.</p>
        ) : notes.length === 0 && !showInput ? (
          <p className="text-sm text-[var(--text-secondary)]">No notes yet.</p>
        ) : (
          notes.map((note) => (
            <div
              key={note.id}
              className="rounded-lg border border-[var(--v48-border)] bg-slate-50 p-3"
            >
              <div className="flex items-start gap-2">
                <StickyNote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--text-secondary)]" />
                <div className="min-w-0">
                  <p className="text-sm text-[var(--text-primary)] whitespace-pre-wrap break-words">
                    {note.body}
                  </p>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">
                    {formatRelativeTime(note.dateAdded)}
                  </p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
