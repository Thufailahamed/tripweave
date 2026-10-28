"use client";
import * as React from "react";
import type { PlanningPackageView, PlanningSnapshot } from "@tripweave/planning-contract";

const PlanningSnapshotContext = React.createContext<PlanningSnapshot | null>(null);
const PlanningModeContext = React.createContext<"operator" | "traveler">("operator");

export function PlanningProvider({ snapshot, mode = "operator", children }: { snapshot: PlanningSnapshot; mode?: "operator" | "traveler"; children: React.ReactNode }) {
  return (
    <PlanningSnapshotContext.Provider value={snapshot}>
      <PlanningModeContext.Provider value={mode}>{children}</PlanningModeContext.Provider>
    </PlanningSnapshotContext.Provider>
  );
}

export function usePlanningMode(): "operator" | "traveler" {
  return React.useContext(PlanningModeContext);
}

export function usePlanningSnapshot(): PlanningSnapshot {
  const snapshot = React.useContext(PlanningSnapshotContext);
  if (!snapshot) throw new Error("Planning blocks must be rendered inside a PlanningProvider");
  return snapshot;
}

export function resolvePlanningPackage(snapshot: PlanningSnapshot, key: string): PlanningPackageView | null {
  return snapshot.packages.find((pkg) => pkg.id === key || pkg.ref === key) ?? null;
}

export function resolvePlanningOffer(snapshot: PlanningSnapshot, key: string) {
  return snapshot.offers.find((entry) => entry.offerId === key || entry.ref === key) ?? null;
}

export function resolvePlanningItinerary(snapshot: PlanningSnapshot, key?: string | null) {
  if (!key) return snapshot.itinerary;
  return snapshot.itinerary && (snapshot.itinerary.id === key || snapshot.itinerary.ref === key) ? snapshot.itinerary : null;
}

export function usePlanningPackage(packageId: string): PlanningPackageView | null {
  return resolvePlanningPackage(usePlanningSnapshot(), packageId);
}

export function usePlanningItinerary(itineraryId?: string) {
  return resolvePlanningItinerary(usePlanningSnapshot(), itineraryId);
}

export function usePlanningOffer(offerId: string) {
  return resolvePlanningOffer(usePlanningSnapshot(), offerId);
}
