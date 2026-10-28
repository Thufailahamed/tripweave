"use client";
import { Suspense } from "react";
import { LoadingBlock } from "@/components/ui/card";
import { TravelTripOverview } from "@/features/travel/trip-overview";

export default function TravelTripOverviewPage() {
  return (
    <Suspense fallback={<LoadingBlock label="Opening your trip" />}>
      <TravelTripOverview />
    </Suspense>
  );
}
