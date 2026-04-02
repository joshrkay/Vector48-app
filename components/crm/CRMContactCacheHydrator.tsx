"use client";

import { useEffect } from "react";
import {
  seedContactsInCache,
  type CRMContactSeed,
} from "@/lib/crm/contactCache";

export function CRMContactCacheHydrator({
  contacts,
}: {
  contacts: CRMContactSeed[];
}) {
  useEffect(() => {
    seedContactsInCache(contacts);
  }, [contacts]);

  return null;
}
