import type { Metadata } from "next";
import { Suspense } from "react";
import { DestinationPhoto } from "@/features/planning/components/destination-photo";
import { SignInForm } from "@/features/auth/sign-in-form";

export const metadata: Metadata = {
  title: "Sign in to TripWeave",
  description: "Sign in to your personal TripWeave trip planner.",
};

export default function TravelerSignInPage() {
  return (
    <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-12 md:px-8 md:py-20 lg:grid-cols-2 lg:items-center">
      <div className="tw-travel-photo hidden aspect-[4/5] max-h-[620px] lg:block">
        <DestinationPhoto destination="Galle" alt="The fort at Galle" className="size-full" eager />
      </div>
      <div className="mx-auto w-full max-w-md lg:px-6">
        <p className="tw-travel-eyebrow">Good to see you</p>
        <div className="mt-6">
          <Suspense>
            <SignInForm variant="traveler" defaultNext="/travel/trips" joinHref="/travel/join" joinLabel="Create an account" />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
