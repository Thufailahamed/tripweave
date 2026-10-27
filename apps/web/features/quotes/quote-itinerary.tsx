"use client";
import * as React from "react";
import { Hotel, MapPin } from "lucide-react";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { dateRange, mealLabel, nightsLabel, formatDate, titleCase } from "@/lib/utils";
import { cancellationLabel } from "./helpers";
import type { VersionDetail } from "./types";

export function ItineraryCard({ version }: { version: VersionDetail }) {
  const stops = version.itinerary.stops ?? [];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Itinerary</CardTitle>
        <CardDescription>{version.itinerary.title ?? "Itinerary snapshot"} — frozen with this version.</CardDescription>
      </CardHeader>
      <CardContent>
        {stops.length === 0 ? (
          <p className="text-sm text-muted-foreground">This version has no itinerary stops.</p>
        ) : (
          <ol className="relative flex flex-col gap-4 border-l border-border pl-5">
            {stops.map((s, i) => (
              <li key={`${s.destination}-${i}`} className="relative">
                <span aria-hidden className="absolute -left-[26px] top-1 flex size-3 items-center justify-center rounded-full border-2 border-primary bg-card" />
                <p className="flex flex-wrap items-center gap-2 font-semibold">
                  <MapPin className="size-3.5 text-accent" aria-hidden />
                  {s.destination}
                  <Badge tone="neutral">{nightsLabel(s.nights)}</Badge>
                </p>
                <p className="text-xs text-muted-foreground">{dateRange(s.arrivalDate, s.departureDate)}</p>
                {s.activities && s.activities.length > 0 ? <p className="mt-1 text-sm">{s.activities.join(" · ")}</p> : null}
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

export function HotelsCard({ version }: { version: VersionDetail }) {
  const stays = version.package.selections ?? [];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Accommodation</CardTitle>
        <CardDescription>Hotels locked into this version.</CardDescription>
      </CardHeader>
      <CardContent>
        {stays.length === 0 ? (
          <p className="text-sm text-muted-foreground">This version has no accommodation.</p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {stays.map((s, i) => (
              <li key={`${s.offer.property.name}-${i}`} className="rounded-lg border border-border p-3">
                <p className="flex items-start gap-2 font-semibold">
                  <Hotel className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                  <span>{s.offer.property.name}</span>
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {s.destination}
                  {s.offer.property.category ? ` · ${titleCase(s.offer.property.category)}` : ""}
                </p>
                <p className="mt-2 text-sm">
                  {s.offer.roomType.name} · {mealLabel(s.offer.mealPlan)}
                </p>
                <p className="text-sm text-muted-foreground">
                  {formatDate(s.offer.stayStart, { day: "numeric", month: "short" })} – {formatDate(s.offer.stayEnd)} · {nightsLabel(s.offer.nights)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{cancellationLabel(s.offer.cancellation)}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {s.offer.isMock ? <Badge tone="warning">Illustrative data</Badge> : null}
                  {s.offer.verificationStatus ? <Badge tone="outline">{titleCase(s.offer.verificationStatus)}</Badge> : null}
                  {s.offer.supplierName ? <Badge tone="outline">Supplier: {s.offer.supplierName}</Badge> : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function TermsCard({ version }: { version: VersionDetail }) {
  const t = version.terms;
  const lists: [string, string[] | undefined][] = [
    ["Inclusions", t.inclusions],
    ["Exclusions", t.exclusions],
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Terms, inclusions and notes</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm">
        <div className="grid gap-4 md:grid-cols-2">
          {lists.map(([title, items]) => (
            <div key={title}>
              <p className="mb-1 text-xs font-medium text-muted-foreground">{title}</p>
              {items && items.length > 0 ? (
                <ul className="list-disc pl-4">
                  {items.map((x, i) => (
                    <li key={i}>{x}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground">None listed.</p>
              )}
            </div>
          ))}
        </div>
        {t.clientNotes ? (
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Notes for the client</p>
            <p className="whitespace-pre-wrap">{t.clientNotes}</p>
          </div>
        ) : null}
        {t.terms ? (
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Terms and conditions</p>
            <p className="whitespace-pre-wrap text-muted-foreground">{t.terms}</p>
          </div>
        ) : null}
        {version.internalNotes ? (
          <div className="rounded-md border border-dashed border-border bg-muted/40 p-3">
            <p className="mb-1 text-xs font-medium text-muted-foreground">Internal notes (never shown to the client)</p>
            <p className="whitespace-pre-wrap">{version.internalNotes}</p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
