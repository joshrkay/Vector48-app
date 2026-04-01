import type { CRMContactSearchItem } from "@/lib/crm/contactCache";

export interface CRMContactSearchResponse {
  contacts: CRMContactSearchItem[];
  error: {
    message: string;
  } | null;
}
