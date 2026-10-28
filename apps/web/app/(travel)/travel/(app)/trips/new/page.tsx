"use client";
import { Suspense } from "react";
import { LoadingBlock } from "@/components/ui/card";
import { TripWizard } from "@/features/travel/trip-wizard";

export default function NewTripPage() {
  return (
    <Suspense fallback={<LoadingBlock label="Opening the trip form" />}>
      <TripWizard />
    </Suspense>
  );
}
