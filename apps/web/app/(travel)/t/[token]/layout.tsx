import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "A shared trip · TripWeave",
  description: "A read-only trip shared with TripWeave.",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function SharedTripLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
