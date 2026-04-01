export interface CRMContactSearchItem {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
}

const contactNameCache = new Map<string, CRMContactSearchItem>();

export function upsertContactsInCache(contacts: CRMContactSearchItem[]) {
  contacts.forEach((contact) => {
    contactNameCache.set(contact.id, contact);
  });
}

export function getContactFromCache(contactId: string) {
  return contactNameCache.get(contactId) ?? null;
}
