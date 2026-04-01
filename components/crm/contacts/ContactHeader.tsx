"use client";

import { useState } from "react";
import { Mail, Phone, Pencil, X, Check } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatRelativeTime } from "@/lib/dashboard/formatRelativeTime";
import type { GHLContact } from "@/lib/ghl/types";

interface Props {
  contact: GHLContact;
}

export function ContactHeader({ contact }: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fields, setFields] = useState({
    firstName: contact.firstName ?? "",
    lastName: contact.lastName ?? "",
    email: contact.email ?? "",
    phone: contact.phone ?? "",
  });

  const displayName =
    contact.name ||
    `${contact.firstName ?? ""} ${contact.lastName ?? ""}`.trim() ||
    "Unnamed Contact";

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/ghl/contacts/${contact.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: fields.firstName || undefined,
          lastName: fields.lastName || undefined,
          email: fields.email || undefined,
          phone: fields.phone || undefined,
        }),
      });
      if (!res.ok) throw new Error("Update failed");
      toast.success("Contact updated");
      setIsEditing(false);
    } catch {
      toast.error("Failed to update contact");
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setFields({
      firstName: contact.firstName ?? "",
      lastName: contact.lastName ?? "",
      email: contact.email ?? "",
      phone: contact.phone ?? "",
    });
    setIsEditing(false);
  }

  return (
    <div className="rounded-2xl border border-[var(--v48-border)] bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          {isEditing ? (
            <div className="flex gap-2">
              <Input
                value={fields.firstName}
                onChange={(e) => setFields((f) => ({ ...f, firstName: e.target.value }))}
                placeholder="First name"
                className="h-9 text-lg font-semibold"
              />
              <Input
                value={fields.lastName}
                onChange={(e) => setFields((f) => ({ ...f, lastName: e.target.value }))}
                placeholder="Last name"
                className="h-9 text-lg font-semibold"
              />
            </div>
          ) : (
            <h1 className="font-heading text-2xl font-bold text-[var(--text-primary)] truncate">
              {displayName}
            </h1>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
            {isEditing ? (
              <>
                <div className="flex items-center gap-1.5">
                  <Phone className="h-4 w-4 shrink-0 text-[var(--text-secondary)]" />
                  <Input
                    value={fields.phone}
                    onChange={(e) => setFields((f) => ({ ...f, phone: e.target.value }))}
                    placeholder="Phone"
                    className="h-8 w-44 text-sm"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <Mail className="h-4 w-4 shrink-0 text-[var(--text-secondary)]" />
                  <Input
                    value={fields.email}
                    onChange={(e) => setFields((f) => ({ ...f, email: e.target.value }))}
                    placeholder="Email"
                    className="h-8 w-56 text-sm"
                  />
                </div>
              </>
            ) : (
              <>
                {contact.phone ? (
                  <a
                    href={`tel:${contact.phone}`}
                    className="flex items-center gap-1.5 text-sm text-[var(--text-primary)] hover:text-[var(--v48-accent)]"
                  >
                    <Phone className="h-4 w-4 shrink-0 text-[var(--text-secondary)]" />
                    {contact.phone}
                  </a>
                ) : null}
                {contact.email ? (
                  <a
                    href={`mailto:${contact.email}`}
                    className="flex items-center gap-1.5 text-sm text-[var(--text-primary)] hover:text-[var(--v48-accent)]"
                  >
                    <Mail className="h-4 w-4 shrink-0 text-[var(--text-secondary)]" />
                    {contact.email}
                  </a>
                ) : null}
              </>
            )}
          </div>

          {contact.tags.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {contact.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          ) : null}

          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--text-secondary)]">
            {contact.source ? <span>Source: {contact.source}</span> : null}
            {contact.dateAdded ? (
              <span>Added {formatRelativeTime(contact.dateAdded)}</span>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 gap-2">
          {isEditing ? (
            <>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleCancel}
                disabled={saving}
                className="h-8 w-8 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saving}
                className="h-8 gap-1"
              >
                <Check className="h-4 w-4" />
                Save
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsEditing(true)}
              className="h-8 gap-1"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
