import type { Metadata } from "next";
import { DestinationPhoto, PhotoCreditLine } from "@/features/planning/components/destination-photo";
import { TravelerJoinForm } from "@/features/travel/join-form";

export const metadata: Metadata = {
  title: "Create your TripWeave account",
  description: "Create a free personal TripWeave account and start planning a trip.",
};

export default function TravelerJoinPage() {
  return (
    <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-12 md:px-8 md:py-20 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
      <div className="order-2 lg:order-1">
        <div className="tw-travel-photo relative aspect-[4/5] max-h-[680px]">
          <DestinationPhoto destination="Nuwara Eliya" alt="Tea country in the hills" className="size-full" placeholder="art" eager />
          <div className="absolute inset-x-4 bottom-4 rounded-2xl bg-[#211d17]/80 p-5 text-[#fffdf8] backdrop-blur">
            <p className="tw-travel-hand text-3xl">the good part is the planning</p>
            <p className="mt-2 max-w-sm text-xs leading-relaxed text-white/65">A calm place for dates, days, stays, spending and the small details. Share it when you are ready.</p>
          </div>
        </div>
        <PhotoCreditLine destination="Nuwara Eliya" />
      </div>
      <div className="order-1 lg:order-2 lg:pt-6">
        <TravelerJoinForm />
      </div>
    </div>
  );
}
