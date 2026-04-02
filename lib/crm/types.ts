export interface CRMContactSearchItem {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
}

export interface CRMContactSearchResponse {
  contacts: CRMContactSearchItem[];
  error: {
    message: string;
  } | null;
}

export interface CRMContactSeed {
  id?: string | null;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
}
