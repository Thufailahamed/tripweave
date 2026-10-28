"use client";
import * as React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isTravelerSession, useSession } from "@/lib/session";

/** Header actions: swaps to the right workspace when the visitor already has a session. */
export function HeaderActions() {
  const { data: session } = useSession();
  if (session) {
    const traveler = isTravelerSession(session);
    return (
      <Button asChild size="sm">
        <Link href={traveler ? "/travel/trips" : session.organization || !session.user.platformAdmin ? "/dashboard" : "/admin"}>{traveler ? "Open my trips" : "Open dashboard"}</Link>
      </Button>
    );
  }
  return (
    <>
      <Button asChild variant="ghost" size="sm" className="hidden min-[400px]:inline-flex">
        <Link href="/login">Sign in</Link>
      </Button>
      <Button asChild size="sm">
        <Link href="/register">Get started</Link>
      </Button>
    </>
  );
}

/** Primary calls to action used in the hero and the closing band. `accent` uses the amber pill. */
export function CtaButtons({ accent, center }: { accent?: boolean; center?: boolean }) {
  const { data: session } = useSession();
  if (session) {
    const traveler = isTravelerSession(session);
    return (
      <Button asChild size="lg" variant={accent ? "accent" : "default"} className="group">
        <Link href={traveler ? "/travel/trips" : session.organization || !session.user.platformAdmin ? "/dashboard" : "/admin"}>
          {traveler ? "Open my trips" : "Open dashboard"} <ArrowRight className="transition-transform duration-300 group-hover:translate-x-1" />
        </Link>
      </Button>
    );
  }
  return (
    <div className={`flex flex-wrap items-center gap-3 ${center ? "justify-center" : ""}`}>
      <Button asChild size="lg" variant={accent ? "accent" : "default"} className="group">
        <Link href="/register">
          Create your organisation <ArrowRight className="transition-transform duration-300 group-hover:translate-x-1" />
        </Link>
      </Button>
      <Button asChild size="lg" variant="outline" className="border-white/30 bg-background/30 text-white backdrop-blur hover:bg-white/10">
        <Link href="/login">Sign in</Link>
      </Button>
    </div>
  );
}
