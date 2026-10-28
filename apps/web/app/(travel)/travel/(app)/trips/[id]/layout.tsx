"use client";
import * as React from "react";
import { useParams } from "next/navigation";
import { ErrorState, LoadingBlock } from "@/components/ui/card";
import { TravelTripHeader } from "@/features/travel/trip-header";
import { useTrip } from "@/features/trips/hooks";

export default function TravelTripLayout({ children }: { children: React.ReactNode }) {
  const { id } = useParams<{ id: string }>();
  const tripQuery = useTrip(id);

  if (tripQuery.isLoading) return <LoadingBlock label="Opening your trip" />;
  if (tripQuery.isError) return <ErrorState error={tripQuery.error} onRetry={() => tripQuery.refetch()} title="Could not open this trip" />;
  if (!tripQuery.data) return <ErrorState error={new Error("Trip not found")} title="This trip is no longer available" />;

  return (
    <div className="flex flex-col gap-8">
      <TravelTripHeader trip={tripQuery.data.trip} />
      {children}
    </div>
  );
}
