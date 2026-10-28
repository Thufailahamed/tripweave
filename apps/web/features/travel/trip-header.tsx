"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, CalendarDays, Pencil, Sparkles, Users } from "lucide-react";
import { Badge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { Trip } from "@/features/trips/types";
import { cn, dateRange, titleCase } from "@/lib/utils";
import { EditTripDialog } from "./edit-trip-dialog";

const TABS = [
  { href: "", label: "Overview" },
  { href: "/plan", label: "Plan" },
  { href: "/itinerary", label: "Itinerary" },
  { href: "/stays", label: "Stays" },
  { href: "/budget", label: "Budget" },
  { href: "/packing", label: "Packing" },
  { href: "/notes", label: "Notes" },
  { href: "/share", label: "Share" },
];

export function TravelTripHeader({ trip }: { trip: Trip }) {
  const pathname = usePathname();
  const base = `/travel/trips/${trip.id}`;
  const [editing, setEditing] = React.useState(false);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/travel/trips" className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-accent">
          <ArrowLeft className="size-3.5" /> All trips
        </Link>
        <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="tw-travel-eyebrow">Trip dossier</p>
              <Badge tone={trip.status === "archived" ? "outline" : "neutral"}>{titleCase(trip.status)}</Badge>
            </div>
            <h1 className="tw-travel-display mt-2 text-4xl leading-[0.98] tracking-[-0.045em] md:text-6xl">{trip.title}</h1>
            <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><CalendarDays className="size-4" /> {dateRange(trip.arrivalDate, trip.departureDate)}</span>
              <span className="inline-flex items-center gap-1.5"><Users className="size-4" /> {trip.party.adults + trip.party.children} traveller{trip.party.adults + trip.party.children === 1 ? "" : "s"}</span>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild><Link href={`${base}/plan`}><Sparkles className="size-4" /> Plan with AI</Link></Button>
            <Button variant="outline" onClick={() => setEditing(true)}><Pencil className="size-4" /> Edit</Button>
          </div>
        </div>
      </div>

      <nav aria-label="Trip sections" className="-mx-4 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
        <div className="flex w-max items-center gap-1 rounded-full border border-border bg-card p-1">
          {TABS.map((tab) => {
            const href = `${base}${tab.href}`;
            const active = tab.href === "" ? pathname === base : pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={tab.label}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "whitespace-nowrap rounded-full px-3.5 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground md:text-sm",
                  active && "bg-[#211d17] text-[#fffdf8]",
                )}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
      </nav>

      <EditTripDialog trip={trip} open={editing} onOpenChange={setEditing} />
    </div>
  );
}
