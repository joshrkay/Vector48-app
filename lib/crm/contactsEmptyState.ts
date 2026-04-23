// ---------------------------------------------------------------------------
// Empty-state resolution for /crm/contacts.
//
// Three distinct "zero contacts" scenarios; we used to conflate them all
// into a bare "No contacts found." This resolver picks the right message so
// the user knows whether to act, wait, or reconnect GoHighLevel.
// ---------------------------------------------------------------------------

export interface ContactsEmptyStateInput {
  contactsCount: number;
  ghlConnected: boolean;
  ghlUnavailableReason: string | null;
}

export type ContactsEmptyState =
  | { variant: "hidden" }
  | { variant: "ghl_not_connected"; title: string; body: string; ctaHref: string; ctaLabel: string }
  | { variant: "ghl_error"; title: string; body: string; ctaHref: string; ctaLabel: string }
  | { variant: "empty_synced"; title: string; body: string };

export function resolveContactsEmptyState(
  input: ContactsEmptyStateInput,
): ContactsEmptyState {
  if (input.contactsCount > 0) {
    return { variant: "hidden" };
  }

  if (!input.ghlConnected) {
    return {
      variant: "ghl_not_connected",
      title: "Connect GoHighLevel to see your contacts",
      body: "Your contacts sync from GoHighLevel. Connect your account in Settings and they'll appear here within a few minutes.",
      ctaHref: "/settings",
      ctaLabel: "Go to Settings",
    };
  }

  if (input.ghlUnavailableReason) {
    return {
      variant: "ghl_error",
      title: "We couldn't load your contacts",
      body: `GoHighLevel returned an error: ${input.ghlUnavailableReason}. Your credentials may have expired — try reconnecting in Settings.`,
      ctaHref: "/settings",
      ctaLabel: "Reconnect GoHighLevel",
    };
  }

  return {
    variant: "empty_synced",
    title: "No contacts yet",
    body: "Contacts added to your GoHighLevel account will appear here. Add your first contact in GHL or use the 'Add Contact' button above to create one.",
  };
}
