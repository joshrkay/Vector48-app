import type { CRMContactSearchItem, CRMContactSeed } from "@/lib/crm/types";

export type { CRMContactSearchItem, CRMContactSeed };

const contactNameCache = new Map<string, CRMContactSearchItem>();

function resolveContactName(contact: CRMContactSeed) {
  if (contact.name?.trim()) {
    return contact.name.trim();
  }

  const derivedName = `${contact.firstName ?? ""} ${contact.lastName ?? ""}`.trim();
  return derivedName || "Contact";
}

export function toCachedContact(contact: CRMContactSeed): CRMContactSearchItem | null {
  if (!contact.id) {
    return null;
  }

  const email = contact.email?.trim() ?? "";
  const phone = contact.phone?.trim() ?? "";

  return {
    id: contact.id,
    name: resolveContactName(contact),
    email: email || null,
    phone: phone || null,
  };
}

export function upsertContactsInCache(contacts: CRMContactSearchItem[]) {
  contacts.forEach((contact) => {
    contactNameCache.set(contact.id, contact);
  });
}

export function seedContactsInCache(contacts: CRMContactSeed[]) {
  const normalized = contacts
    .map(toCachedContact)
    .filter((contact): contact is CRMContactSearchItem => contact !== null);

  if (normalized.length) {
    upsertContactsInCache(normalized);
  }

  return normalized;
}

export function getContactFromCache(contactId: string) {
  return contactNameCache.get(contactId) ?? null;
}
