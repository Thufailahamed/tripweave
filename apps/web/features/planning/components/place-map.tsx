"use client";
import * as React from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { defineComponent } from "@openuidev/react-lang";
import { ArrowUpRight, MapPinOff, Route } from "lucide-react";
import { PlaceMapSchema, planningComponentDescriptions } from "@tripweave/planning-contract";
import { cn } from "@/lib/utils";
import { placeKey, usePlaceInfos } from "../place-image";
import { useAskAssistant } from "./travel";
import { DestinationPhoto } from "./destination-photo";

const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

function markerIcon(position: number, selected: boolean) {
  const size = selected ? 34 : 28;
  const background = selected ? "#1c1a15" : "#c25736";
  return L.divIcon({
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div style="width:${size}px;height:${size}px;border-radius:9999px;background:${background};color:#fff;font:700 ${selected ? 13 : 12}px system-ui;display:flex;align-items:center;justify-content:center;border:2px solid #fffdf8;box-shadow:0 4px 12px rgba(20,16,10,.35)">${position}</div>`,
  });
}

/**
 * Plots named places from their public coordinates, in the order the reply gives them, joined by a
 * dashed route line. Each marker or chip selects a place to explore; places without coordinates are
 * listed rather than guessed at.
 */
export const PlaceMap = defineComponent({
  name: "PlaceMap",
  description: planningComponentDescriptions.PlaceMap,
  props: PlaceMapSchema,
  component: function PlaceMapView({ props }) {
    const ask = useAskAssistant();
    const { loading, byKey } = usePlaceInfos(props.places);
    const located = props.places
      .map((name) => ({ name, key: placeKey(name), info: byKey[placeKey(name)] ?? null }))
      .filter((place): place is { name: string; key: string; info: NonNullable<typeof place.info> } => place.info?.latitude != null && place.info?.longitude != null);
    const unlocated = props.places.filter((name) => !located.some((place) => place.key === placeKey(name)));
    const signature = located.map((place) => `${place.key}:${place.info.latitude},${place.info.longitude}`).join("|");
    const [selectedKey, setSelectedKey] = React.useState<string | null>(null);
    const activeKey = located.some((place) => place.key === selectedKey) ? selectedKey : (located[0]?.key ?? null);
    const active = located.find((place) => place.key === activeKey) ?? null;

    const containerRef = React.useRef<HTMLDivElement | null>(null);
    const mapRef = React.useRef<L.Map | null>(null);
    const layerRef = React.useRef<L.LayerGroup | null>(null);
    const selectRef = React.useRef<(key: string) => void>(() => undefined);
    selectRef.current = setSelectedKey;

    React.useEffect(() => {
      const node = containerRef.current;
      if (!node || located.length === 0) return;
      if (!mapRef.current) {
        const map = L.map(node, { scrollWheelZoom: false, attributionControl: true });
        L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: 18 }).addTo(map);
        mapRef.current = map;
        layerRef.current = L.layerGroup().addTo(map);
      }
      const map = mapRef.current!;
      const layer = layerRef.current!;
      layer.clearLayers();
      const points = located.map((place) => [place.info.latitude!, place.info.longitude!] as L.LatLngTuple);
      located.forEach((place, index) => {
        L.marker([place.info.latitude!, place.info.longitude!], { icon: markerIcon(index + 1, place.key === activeKey), title: place.name, alt: place.name })
          .on("click", () => selectRef.current(place.key))
          .addTo(layer);
      });
      if (points.length >= 2) L.polyline(points, { color: "#c25736", weight: 3, dashArray: "6 8" }).addTo(layer);
      if (points.length >= 2) map.fitBounds(L.latLngBounds(points), { padding: [36, 36], maxZoom: 11 });
      else map.setView(points[0]!, 9);
      map.invalidateSize();
      // The signature captures the located places; the active marker is refreshed with them.
    }, [signature, activeKey]);

    React.useEffect(
      () => () => {
        mapRef.current?.remove();
        mapRef.current = null;
        layerRef.current = null;
      },
      [],
    );

    const title = props.title ?? "Places on the map";
    return (
      <section aria-label={title} className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="pl-eyebrow">{title}</p>
          <span className="text-[11px] text-[var(--pl-muted)]" aria-live="polite">
            {loading ? "Locating places…" : `${located.length} of ${props.places.length} located`}
          </span>
        </div>

        {located.length > 0 ? (
          <div ref={containerRef} role="region" aria-label="Map of the places" className="h-[320px] w-full overflow-hidden rounded-[18px] border border-[var(--pl-line)] sm:h-[380px]" />
        ) : !loading ? (
          <div className="flex items-start gap-3 rounded-[18px] border border-dashed border-[var(--pl-line)] p-4 text-[12px] text-[var(--pl-muted)]">
            <MapPinOff className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p>None of these places could be located on the map right now. Ask the assistant to describe them instead.</p>
          </div>
        ) : (
          <div className="h-[220px] animate-pulse rounded-[18px] bg-[var(--pl-surface-2)]" aria-hidden />
        )}

        {located.length > 0 ? (
          <div role="group" aria-label="Jump to a place on the map" className="pl-scroll flex gap-2 overflow-x-auto pb-1">
            {located.map((place, index) => {
              const selected = place.key === activeKey;
              return (
                <button
                  key={place.key}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setSelectedKey(place.key)}
                  className={cn(
                    "flex shrink-0 items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-left text-[12px] font-semibold transition",
                    selected ? "border-[var(--pl-ink)] bg-[var(--pl-surface)]" : "border-[var(--pl-line)] bg-[var(--pl-surface-2)] hover:border-[var(--pl-ink)]",
                  )}
                >
                  <span aria-hidden className="grid size-6 place-items-center rounded-full bg-[var(--pl-accent)] text-[10px] font-bold text-white">
                    {index + 1}
                  </span>
                  {place.name}
                </button>
              );
            })}
          </div>
        ) : null}

        {active ? (
          <article className="pl-card grid overflow-hidden sm:grid-cols-[minmax(0,200px)_minmax(0,1fr)]">
            <div className="relative aspect-[4/3] sm:aspect-auto sm:min-h-[180px]">
              <DestinationPhoto destination={active.name} className="absolute inset-0 size-full pl-photo" />
            </div>
            <div className="flex min-w-0 flex-col gap-2.5 p-4 sm:p-5">
              <p className="pl-display text-[1.5rem]">{active.name}</p>
              <p className="line-clamp-4 text-[13px] leading-relaxed text-[var(--pl-muted)]">
                {active.info.extract ?? "Ask the assistant what to see here and how long to stay."}
              </p>
              <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
                <button type="button" className="pl-btn pl-btn-solid" onClick={() => ask(`Tell me about ${active.name}: what to see, how long to stay and how to get there.`)}>
                  Ask about this place
                </button>
                {located.length > 1 ? (
                  <button
                    type="button"
                    className="pl-btn"
                    onClick={() => {
                      const index = located.findIndex((place) => place.key === active.key);
                      const next = located[(index + 1) % located.length]!;
                      ask(`How do I get from ${active.name} to ${next.name}? Include the rough travel time and the best way to travel.`);
                    }}
                  >
                    <Route className="size-3.5" aria-hidden /> Route to next stop
                  </button>
                ) : null}
                {active.info.articleUrl ? (
                  <a href={active.info.articleUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-[11px] text-[var(--pl-muted)] underline decoration-[var(--pl-line)] underline-offset-2 hover:text-[var(--pl-ink)]">
                    Read on Wikipedia <ArrowUpRight className="size-3" aria-hidden />
                  </a>
                ) : null}
              </div>
            </div>
          </article>
        ) : null}

        {unlocated.length > 0 && !loading ? <p className="text-[11px] text-[var(--pl-muted)]">Not on the map: {unlocated.join(", ")}</p> : null}
      </section>
    );
  },
});
