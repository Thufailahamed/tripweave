export interface Customer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  country: string | null;
  preferredLanguage: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export const customerKeys = {
  all: ["customers"] as const,
  list: (params: Record<string, unknown>) => ["customers", "list", params] as const,
  detail: (id: string) => ["customers", "detail", id] as const,
};
