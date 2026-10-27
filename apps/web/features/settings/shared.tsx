"use client";
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import type { Branding } from "@tripweave/shared";
import { ApiError, apiGet } from "@/lib/api";
import { Alert } from "@/components/ui/card";

export interface OrganizationDetail {
  id: string;
  name: string;
  slug: string;
  organizationType: "tour_operator" | "hotel_management";
  status: string;
  defaultCurrency: string;
  timezone: string;
  country: string;
  branding: Branding;
  subscription: {
    plan: string;
    status: string;
    seatLimit: number;
    monthlyOptimisationLimit: number;
    seatsUsed: number;
    optimisationsThisMonth: number;
  } | null;
}

export const ORG_KEY = ["organization"] as const;

export function useOrganization() {
  return useQuery({ queryKey: ORG_KEY, queryFn: () => apiGet<OrganizationDetail>("/organization") });
}

export const CURRENCY_OPTIONS = ["USD", "EUR", "GBP", "LKR"] as const;

/** Shown when a page's permission is missing (the API enforces the same rule independently). */
export function NoAccess({ what, permission }: { what: string; permission: string }) {
  return (
    <Alert tone="warning" title="You do not have access to this page">
      {what} requires the <code className="rounded bg-card px-1 py-0.5 text-xs">{permission}</code> permission. Ask an organisation owner or admin if you need it.
    </Alert>
  );
}

/** Pushes a 422 response's field errors into React Hook Form. Returns the top-level message. */
export function applyFieldErrors(e: unknown, set: (name: never, err: { message: string }) => void): string {
  if (e instanceof ApiError) for (const [path, message] of Object.entries(e.fieldErrors)) set(path as never, { message });
  return e instanceof Error ? e.message : "Something went wrong";
}

/** Timezone names from the browser's ICU data (empty when unsupported); used only as autocomplete suggestions. */
export function useTimezones(): string[] {
  const [zones, setZones] = React.useState<string[]>([]);
  React.useEffect(() => {
    try {
      const fn = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf;
      if (fn) setZones(fn("timeZone"));
    } catch {
      /* unsupported */
    }
  }, []);
  return zones;
}
