import { type CRMContactSearchItem } from "@/lib/crm/types";

export type { CRMContactSearchItem };

const contactNameCache = new Map<string, CRMContactSearchItem>();

export function upsertContactsInCache(contacts: CRMContactSearchItem[]) {
  contacts.forEach((contact) => {
    contactNameCache.set(contact.id, contact);
  });
}

export function getContactFromCache(contactId: string) {
  return contactNameCache.get(contactId) ?? null;
}
