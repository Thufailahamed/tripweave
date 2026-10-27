"use client";
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, apiGet } from "./api";
import type { Permission } from "@tripweave/shared";

export interface SessionOrganization {
  id: string;
  name: string;
  slug: string;
  type: "tour_operator" | "hotel_management";
  status: string;
  defaultCurrency: string;
  timezone: string;
  country: string;
  branding: { productName?: string; logoUrl?: string; primaryColor?: string; accentColor?: string; contactEmail?: string; contactPhone?: string; address?: string; website?: string; quoteFooter?: string };
  role: string;
}
export interface SessionData {
  user: { id: string; email: string; displayName: string; platformAdmin: boolean; emailVerified: boolean; mfaEnabled: boolean };
  organization: SessionOrganization | null;
  permissions: Permission[];
  memberships: { organizationId: string; name: string; type: string; role: string; status: string }[];
}

export const SESSION_KEY = ["session"] as const;

/** `data === null` means signed out; `undefined` while loading. */
export function useSession() {
  return useQuery<SessionData | null>({
    queryKey: SESSION_KEY,
    queryFn: async () => {
      try {
        return await apiGet<SessionData>("/auth/me");
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    staleTime: 60_000,
    retry: false,
  });
}

/** Permission check for UI affordances only; the API enforces every permission independently. */
export function useCan() {
  const { data } = useSession();
  return React.useCallback((p: Permission) => !!data?.permissions.includes(p), [data]);
}

export function useRefreshSession() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: SESSION_KEY });
}

/** Wipes every cached query (used on sign-out and organisation switch so no tenant data lingers). */
export function useResetCache() {
  const qc = useQueryClient();
  return () => qc.clear();
}
