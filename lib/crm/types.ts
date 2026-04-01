export interface CRMContactSearchItem {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
}

export interface CRMContactSearchResponse {
  items: CRMContactSearchItem[];
  error: {
    message: string;
  } | null;
}
