"use client";
import { useQuery } from "@tanstack/react-query";
import type { TravelerBudgetItem, TravelerNote, TravelerPackingItem, TravelerProfile, TravelerShare } from "@tripweave/shared";
import { apiGet, apiList } from "@/lib/api";
import type { Trip } from "@/features/trips/types";

export const travelKeys = {
  trips: ["traveler", "trips"] as const,
  profile: ["traveler", "profile"] as const,
  budget: (tripId: string) => ["traveler", "budget", tripId] as const,
  packing: (tripId: string) => ["traveler", "packing", tripId] as const,
  notes: (tripId: string) => ["traveler", "notes", tripId] as const,
  shares: (tripId: string) => ["traveler", "shares", tripId] as const,
};

export interface TravelerProfileResponse {
  user: { id: string; email: string; displayName: string; emailVerified: boolean };
  profile: TravelerProfile;
}

export function useTravelerTrips() {
  return useQuery({ queryKey: travelKeys.trips, queryFn: () => apiList<Trip>("/trips", { pageSize: 50, sort: "updated", order: "desc" }) });
}

export function useBudgetItems(tripId: string, enabled = true) {
  return useQuery({ queryKey: travelKeys.budget(tripId), queryFn: () => apiGet<{ items: TravelerBudgetItem[] }>(`/traveler/trips/${tripId}/budget`), enabled: enabled && !!tripId });
}

export function usePackingItems(tripId: string, enabled = true) {
  return useQuery({ queryKey: travelKeys.packing(tripId), queryFn: () => apiGet<{ items: TravelerPackingItem[] }>(`/traveler/trips/${tripId}/packing`), enabled: enabled && !!tripId });
}

export function useTripNotes(tripId: string, enabled = true) {
  return useQuery({ queryKey: travelKeys.notes(tripId), queryFn: () => apiGet<{ items: TravelerNote[] }>(`/traveler/trips/${tripId}/notes`), enabled: enabled && !!tripId });
}

export function useTripShares(tripId: string, enabled = true) {
  return useQuery({ queryKey: travelKeys.shares(tripId), queryFn: () => apiGet<{ shares: TravelerShare[] }>(`/traveler/trips/${tripId}/shares`), enabled: enabled && !!tripId });
}

export function useTravelerProfile() {
  return useQuery({ queryKey: travelKeys.profile, queryFn: () => apiGet<TravelerProfileResponse>("/traveler/profile") });
}
