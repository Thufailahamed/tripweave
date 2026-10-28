"use client";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isTravelerSession, useSession } from "@/lib/session";

export function TravelPublicCta({ accent = false, label = "Plan your trip" }: { accent?: boolean; label?: string }) {
  const { data: session } = useSession();
  if (isTravelerSession(session)) {
    return (
      <Button asChild size="lg" variant={accent ? "accent" : "default"} className="group">
        <Link href="/travel/trips">
          Open my trips <ArrowRight className="transition-transform group-hover:translate-x-1" />
        </Link>
      </Button>
    );
  }
  return (
    <Button asChild size="lg" variant={accent ? "accent" : "default"} className="group">
      <Link href="/travel/join">
        {label} <ArrowRight className="transition-transform group-hover:translate-x-1" />
      </Link>
    </Button>
  );
}
