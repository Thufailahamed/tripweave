"use client";
import * as React from "react";
import Link from "next/link";
import { ArrowRight, MapPin, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { DestinationPhoto, PhotoCreditLine } from "@/features/planning/components/destination-photo";
import { lookupPlace, placeKey, usePlaceInfos } from "@/features/planning/place-image";

interface Destination {
  name: string;
  country: string;
  blurb: string;
}

const CURATED: Destination[] = [
  { name: "Kandy", country: "Sri Lanka", blurb: "A lake, a temple, a market and the last cool air before the hills." },
  { name: "Ella", country: "Sri Lanka", blurb: "Tea country at walking pace: ridges, waterfalls and the train everyone talks about." },
  { name: "Galle", country: "Sri Lanka", blurb: "A fort by the sea, old streets, and the long way round to the coast." },
  { name: "Nuwara Eliya", country: "Sri Lanka", blurb: "Cloud, tea factories and a very good excuse to slow down." },
  { name: "Sigiriya", country: "Sri Lanka", blurb: "A rock fortress above the plains, best before the heat arrives." },
  { name: "Mirissa", country: "Sri Lanka", blurb: "A bay for swimming, whale mornings and doing very little." },
  { name: "Anuradhapura", country: "Sri Lanka", blurb: "Ancient ruins under huge trees; bring water and take your time." },
  { name: "Trincomalee", country: "Sri Lanka", blurb: "East-coast water, a temple on the hill and a slower season." },
];

export function TravelDiscover() {
  const [query, setQuery] = React.useState("");
  const [extra, setExtra] = React.useState<Destination[]>([]);
  const [searching, setSearching] = React.useState(false);
  const [notFound, setNotFound] = React.useState<string | null>(null);
  const places = [...extra, ...CURATED];
  const infos = usePlaceInfos(places.map((place) => place.name));

  const search = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = query.trim().slice(0, 80);
    if (name.length < 2) return;
    setSearching(true);
    setNotFound(null);
    try {
      const info = await lookupPlace(name);
      if (!info) {
        setNotFound(name);
        return;
      }
      setExtra((current) => (current.some((place) => placeKey(place.name) === placeKey(name)) || CURATED.some((place) => placeKey(place.name) === placeKey(name)) ? current : [{ name: info.articleTitle || name, country: "Found on Wikipedia", blurb: info.extract?.slice(0, 180) ?? "A place worth a closer look." }, ...current]));
      setQuery("");
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="flex flex-col gap-10">
      <header className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <p className="tw-travel-eyebrow">Discover</p>
          <h1 className="tw-travel-display mt-2 max-w-[15ch] text-5xl leading-none tracking-[-0.045em] md:text-6xl">Borrow a place for a few days.</h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">Short guides and photographs from Wikipedia. Start a trip from anything that catches your eye; you can change the plan later.</p>
        </div>
        <form onSubmit={search} className="flex w-full max-w-md items-end gap-2">
          <label htmlFor="discover-search" className="sr-only">Search for a place</label>
          <Input id="discover-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search any place, e.g. Lisbon" maxLength={80} />
          <Button type="submit" loading={searching} aria-label="Search places"><Search className="size-4" /></Button>
        </form>
      </header>

      {notFound ? (
        <p className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          We could not find a free Wikipedia guide for “{notFound}”. You can still <Link href={`/travel/trips/new?destination=${encodeURIComponent(notFound)}`} className="font-semibold text-accent hover:underline">start a trip there</Link>.
        </p>
      ) : null}

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {places.map((place) => {
          const info = infos.byKey[placeKey(place.name)] ?? null;
          const blurb = info?.extract?.split(/(?<=\.)\s/).slice(0, 2).join(" ") || place.blurb;
          return (
            <article key={`${place.name}-${place.country}`} className="group flex flex-col">
              <Link href={`/travel/trips/new?destination=${encodeURIComponent(place.name)}&idea=${encodeURIComponent(`A trip to ${place.name}. ${place.blurb}`)}`}>
                <div className="tw-travel-photo aspect-[4/5]">
                  <DestinationPhoto destination={place.name} alt={place.name} className="size-full" placeholder="art" />
                </div>
                <div className="mt-3 flex items-start justify-between gap-2">
                  <div>
                    <h2 className="tw-travel-display text-2xl leading-none">{place.name}</h2>
                    <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground"><MapPin className="size-3" /> {place.country}</p>
                  </div>
                  <ArrowRight className="mt-1 size-4 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-accent" />
                </div>
                <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-muted-foreground">{blurb}</p>
              </Link>
              {info?.articleUrl ? (
                <a href={info.articleUrl} target="_blank" rel="noreferrer noopener" className="mt-2 text-[10px] text-muted-foreground underline decoration-border underline-offset-2 hover:text-accent">Read on Wikipedia</a>
              ) : (
                <PhotoCreditLine destination={place.name} />
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
