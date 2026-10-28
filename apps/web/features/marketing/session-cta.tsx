"use client";
import * as React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Magnetic } from "@/components/motion";
import { RollText } from "@/features/marketing/ui";
import { isTravelerSession, useSession } from "@/lib/session";

/** Header actions (the lime pill beside the floating nav): swaps to the right workspace when the visitor already has a session. */
export function HeaderActions() {
  const { data: session } = useSession();
  const pill = "group h-12 rounded-full px-5 text-[13px] md:px-6";
  if (session) {
    const traveler = isTravelerSession(session);
    return (
      <Button asChild variant="accent" className={pill}>
        <Link href={traveler ? "/travel/trips" : session.organization || !session.user.platformAdmin ? "/dashboard" : "/admin"}>
          <RollText text={traveler ? "Open my trips" : "Open dashboard"} />
        </Link>
      </Button>
    );
  }
  return (
    <>
      <Button asChild variant="ghost" className={`${pill} hidden border border-white/10 bg-card/70 backdrop-blur-xl hover:bg-muted min-[480px]:inline-flex`}>
        <Link href="/login">
          <RollText text="Sign in" />
        </Link>
      </Button>
      <Button asChild variant="accent" className={pill}>
        <Link href="/register">
          <RollText text="Get started" />
        </Link>
      </Button>
    </>
  );
}

/** Primary calls to action used in the hero and the closing band. `accent` uses the lime pill. */
export function CtaButtons({ accent, center }: { accent?: boolean; center?: boolean }) {
  const { data: session } = useSession();
  if (session) {
    const traveler = isTravelerSession(session);
    return (
      <div className={`flex ${center ? "justify-center" : ""}`}>
        <Magnetic>
          <Button asChild size="lg" variant={accent ? "accent" : "default"} className="group h-14 px-8">
            <Link href={traveler ? "/travel/trips" : session.organization || !session.user.platformAdmin ? "/dashboard" : "/admin"}>
              <RollText text={traveler ? "Open my trips" : "Open dashboard"} /> <ArrowRight className="transition-transform duration-300 group-hover:translate-x-1" />
            </Link>
          </Button>
        </Magnetic>
      </div>
    );
  }
  return (
    <div className={`flex flex-wrap items-center gap-3 ${center ? "justify-center" : ""}`}>
      <Magnetic>
        <Button asChild size="lg" variant={accent ? "accent" : "default"} className="group h-14 px-8">
          <Link href="/register">
            <RollText text="Create your organisation" /> <ArrowRight className="transition-transform duration-300 group-hover:translate-x-1" />
          </Link>
        </Button>
      </Magnetic>
      <Button asChild size="lg" variant="outline" className="group h-14 border-white/20 bg-background/30 px-8 text-white backdrop-blur hover:bg-white/10">
        <Link href="/login">
          <RollText text="Sign in" />
        </Link>
      </Button>
    </div>
  );
}
