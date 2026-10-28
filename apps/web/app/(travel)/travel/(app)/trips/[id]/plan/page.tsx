"use client";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { LoadingBlock } from "@/components/ui/card";

const PlanningPanel = dynamic(() => import("@/features/planning/planning-panel").then((module) => module.PlanningPanel), {
  ssr: false,
  loading: () => <LoadingBlock label="Opening the planning assistant" />,
});

export default function TravelPlanPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="tw-travel-eyebrow">Plan</p>
        <h2 className="tw-travel-display mt-2 text-4xl leading-none tracking-[-0.04em]">A travel page, not a transcript.</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">Ask for a slower morning, a different base or what to do when it rains. The reply is composed from safe travel blocks; prices and availability always come from the saved trip.</p>
      </header>
      <PlanningPanel tripId={id} mode="traveler" persistKey={`tw.traveler.plan.${id}`} />
    </div>
  );
}
