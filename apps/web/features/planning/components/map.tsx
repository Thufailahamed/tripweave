"use client";
import * as React from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { defineComponent, useTriggerAction } from "@openuidev/react-lang";
import { ArrowRight, BedDouble, CalendarDays, Car, Compass, Maximize2, MapPinOff, Route, Sparkles } from "lucide-react";
import { TripMapSchema } from "@tripweave/planning-contract";
import { formatDate, minutesLabel, nightsLabel } from "@/lib/utils";
import { usePlanningItinerary, usePlanningSnapshot } from "../context";
import { EmptyBlock, IconBadge, MissingEntity, SectionHeader } from "../ui";
import { DestinationPhoto, PhotoCreditLine } from "./destination-photo";

const DESCRIPTION = "Interactive map of the itinerary's stops in order, joined by a route line, with each stop's photograph and a select-to-explore card. Pass the itineraryId from CONTEXT. Use it for questions about where places are, the geography or the route.";
const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

function MapFact({ icon: Icon, label, children }: { icon: React.ComponentType<{ className?: string }>; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <IconBadge icon={Icon} tone="ink" size="sm" />
      <div className="min-w-0">
        <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--pl-muted)]">{label}</dt>
        <dd className="mt-0.5 text-[13px] leading-snug">{children}</dd>
      </div>
    </div>
  );
}

function markerIcon(n: number, selected: boolean) {
  const size = selected ? 34 : 28;
  const background = selected ? "#1c1a15" : "#c25736";
  return L.divIcon({
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div style="width:${size}px;height:${size}px;border-radius:9999px;background:${background};color:#fff;font:700 ${selected ? 13 : 12}px system-ui;display:flex;align-items:center;justify-content:center;border:2px solid #fffdf8;box-shadow:0 4px 12px rgba(20,16,10,.35)">${n}</div>`,
  });
}

export const TripMap = defineComponent({
  name: "TripMap",
  description: DESCRIPTION,
  props: TripMapSchema,
  component: function TripMapView({ props }) {
    const snapshot = usePlanningSnapshot();
    const itinerary = usePlanningItinerary(props.itineraryId);
    const triggerAction = useTriggerAction();
    const containerRef = React.useRef<HTMLDivElement | null>(null);
    const mapRef = React.useRef<L.Map | null>(null);
    const layerRef = React.useRef<L.LayerGroup | null>(null);
    const boundsRef = React.useRef<L.LatLngBounds | null>(null);
    const [selectedId, setSelectedId] = React.useState<string | null>(null);
    const [showRoute, setShowRoute] = React.useState(true);

    const stops = itinerary?.stops ?? [];
    const located = stops
      .map((stop, index) => ({ stop, n: index + 1 }))
      .filter(({ stop }) => stop.latitude !== null && stop.longitude !== null && Number.isFinite(stop.latitude) && Number.isFinite(stop.longitude));
    const signature = located.map(({ stop, n }) => `${n}:${stop.id}:${stop.latitude},${stop.longitude}`).join("|");
    const selectedIndex = Math.max(0, stops.findIndex((stop) => stop.id === selectedId));
    const selected = stops[selectedIndex] ?? stops[0] ?? null;
    const hotelCount = (stopId: string) => snapshot.offers.filter((entry) => entry.stopId === stopId).length;

    // Create the map once, on the client only. Leaflet needs a real DOM node and cannot run during SSR.
    React.useEffect(() => {
      if (!containerRef.current || mapRef.current) return;
      const map = L.map(containerRef.current, { scrollWheelZoom: false, attributionControl: true }).setView([7.8, 80.7], 7);
      L.tileLayer(TILE_URL, { maxZoom: 18, attribution: TILE_ATTRIBUTION }).addTo(map);
      layerRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      // Grid parents settle after mount, so keep Leaflet's size in step. Older test DOMs lack ResizeObserver.
      const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => map.invalidateSize());
      observer?.observe(containerRef.current);
      return () => {
        observer?.disconnect();
        map.remove();
        mapRef.current = null;
        layerRef.current = null;
      };
    }, []);

    // Redraw markers and the route whenever the stops, the selection or the route toggle change.
    React.useEffect(() => {
      const map = mapRef.current;
      const layer = layerRef.current;
      if (!map || !layer) return;
      layer.clearLayers();
      const points: L.LatLngTuple[] = located.map(({ stop }) => [stop.latitude as number, stop.longitude as number]);
      if (showRoute && points.length > 1) {
        L.polyline(points, { color: "#c25736", weight: 3, opacity: 0.75, dashArray: "6 7" }).addTo(layer);
      }
      for (const { stop, n } of located) {
        L.marker([stop.latitude as number, stop.longitude as number], { icon: markerIcon(n, stop.id === selected?.id), title: `${n}. ${stop.destination}`, alt: `Stop ${n}: ${stop.destination}`, keyboard: true })
          .on("click", () => setSelectedId(stop.id))
          .addTo(layer);
      }
      boundsRef.current = points.length > 0 ? L.latLngBounds(points) : null;
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [signature, selected?.id, showRoute]);

    // Frame the whole route only when the stops change, so selecting a stop never moves the map away from it.
    React.useEffect(() => {
      const map = mapRef.current;
      const bounds = boundsRef.current;
      if (!map || !bounds) return;
      if (located.length === 1) map.setView(bounds.getCenter(), 9);
      else map.fitBounds(bounds, { padding: [36, 36] });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [signature]);

    if (!itinerary) return <MissingEntity what="itinerary" />;
    if (stops.length === 0) return <EmptyBlock>This itinerary has no stops yet, so there is nothing to place on the map.</EmptyBlock>;

    const missing = stops.length - located.length;
    const fit = () => {
      const bounds = boundsRef.current;
      if (bounds) mapRef.current?.fitBounds(bounds, { padding: [36, 36] });
    };
    const focus = (stopId: string) => {
      setSelectedId(stopId);
      const target = located.find(({ stop }) => stop.id === stopId)?.stop;
      if (target && target.latitude !== null && target.longitude !== null) mapRef.current?.panTo([target.latitude, target.longitude]);
    };

    return (
      <section aria-label={itinerary.title ? `Map of ${itinerary.title}` : "Trip map"} className="flex flex-col gap-3">
        <SectionHeader
          icon={Compass}
          eyebrow="On the map"
          title="Where you’ll be"
          meta={
            <>
              <button type="button" aria-pressed={showRoute} onClick={() => setShowRoute((value) => !value)} className={`pl-chip cursor-pointer transition ${showRoute ? "pl-chip-accent" : ""}`}>
                <Route className="size-3" aria-hidden /> Route line {showRoute ? "on" : "off"}
              </button>
              <button type="button" onClick={fit} className="pl-chip cursor-pointer transition hover:border-[var(--pl-ink)]">
                <Maximize2 className="size-3" aria-hidden /> Fit all stops
              </button>
            </>
          }
        />

        {located.length === 0 ? (
          <p role="status" className="flex items-center gap-2 rounded-xl border border-dashed border-[var(--pl-line)] bg-[var(--pl-surface-2)] px-4 py-3 text-[12px] text-[var(--pl-muted)]">
            <MapPinOff className="size-4 shrink-0" aria-hidden /> None of the stops has coordinates yet, so the map cannot place them.
          </p>
        ) : null}
        {located.length > 0 && missing > 0 ? (
          <p role="status" className="text-[11px] text-[var(--pl-muted)]">
            {missing} stop{missing === 1 ? " has" : "s have"} no coordinates and {missing === 1 ? "is" : "are"} not plotted.
          </p>
        ) : null}

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <div className="relative overflow-hidden rounded-2xl border border-[var(--pl-line)] bg-[var(--pl-surface-2)]">
            <div ref={containerRef} role="region" aria-label="Map of the itinerary stops" className="h-[300px] w-full sm:h-[380px]" />
          </div>

          {selected ? (
            <article className="pl-card pl-rise flex h-full flex-col overflow-hidden" key={selected.id}>
              <div className="relative h-40 shrink-0">
                <DestinationPhoto destination={selected.destination} className="absolute inset-0 size-full" />
                <div aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,transparent_30%,rgba(20,16,10,0.72))]" />
                <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-4">
                  <div className="min-w-0">
                    <p className="pl-eyebrow" style={{ color: "rgba(255,255,255,0.9)" }}>
                      Stop {selectedIndex + 1} of {stops.length}
                    </p>
                    <h4 className="pl-display mt-1 truncate text-[1.9rem] leading-none text-white">{selected.destination}</h4>
                  </div>
                  <span className="pl-chip shrink-0 border-white/25 bg-black/30 text-white">{nightsLabel(selected.nights)}</span>
                </div>
              </div>
              <dl className="flex flex-1 flex-col divide-y divide-[var(--pl-line)] px-4">
                <MapFact icon={CalendarDays} label="Dates">
                  <span className="tw-num">
                    {formatDate(selected.arrivalDate, { day: "numeric", month: "short" })} → {formatDate(selected.departureDate, { day: "numeric", month: "short" })}
                  </span>
                </MapFact>
                <MapFact icon={BedDouble} label="Hotels here">
                  {hotelCount(selected.id) > 0 ? `${hotelCount(selected.id)} option${hotelCount(selected.id) === 1 ? "" : "s"} attached to this stop` : "None attached to this stop yet"}
                </MapFact>
                {(() => {
                  const legIn = itinerary.legs.find((leg) => leg.toStopId === selected.id) ?? null;
                  if (!legIn) return null;
                  const from = stops.find((stop) => stop.id === legIn.fromStopId)?.destination ?? "the previous stop";
                  return (
                    <MapFact icon={Car} label={`Drive from ${from}`}>
                      <span className="tw-num">
                        {legIn.durationMinutes === null ? "Drive time unavailable" : minutesLabel(legIn.durationMinutes)}
                        {legIn.distanceKm !== null ? ` · ${legIn.distanceKm} km` : ""}
                      </span>
                    </MapFact>
                  );
                })()}
                {selected.activities.length > 0 ? (
                  <MapFact icon={Sparkles} label="Things to do">
                    {selected.activities.slice(0, 3).join(" · ")}
                  </MapFact>
                ) : null}
              </dl>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--pl-line)] p-4">
                <PhotoCreditLine destination={selected.destination} />
                {snapshot.allowedActions.includes("open_itinerary") ? (
                  <button type="button" className="pl-btn pl-btn-solid" onClick={() => void triggerAction("Open itinerary", undefined, { type: "open_itinerary", params: {} })}>
                    Open itinerary <ArrowRight className="size-3.5" aria-hidden />
                  </button>
                ) : null}
              </div>
            </article>
          ) : null}
        </div>

        <div className="pl-scroll flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Jump to a stop on the map">
          {stops.map((stop, index) => {
            const active = stop.id === selected?.id;
            return (
              <button
                key={stop.id}
                type="button"
                aria-pressed={active}
                onClick={() => focus(stop.id)}
                className={`flex shrink-0 items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-[12px] font-semibold transition ${active ? "border-[var(--pl-ink)] bg-[var(--pl-surface)]" : "border-[var(--pl-line)] bg-[var(--pl-surface-2)] hover:border-[var(--pl-ink)]"}`}
              >
                <span className="tw-num grid size-6 place-items-center rounded-full bg-[var(--pl-accent)] text-[10px] font-bold text-white">{index + 1}</span>
                {stop.destination}
              </button>
            );
          })}
        </div>
        <p className="text-[10px] text-[var(--pl-muted)]">The dashed line joins stops in order; it is not a driving route. Coordinates come from the saved itinerary.</p>
      </section>
    );
  },
});
