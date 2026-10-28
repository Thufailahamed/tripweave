"use client";
import * as React from "react";
import { createPortal } from "react-dom";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { defineComponent } from "@openuidev/react-lang";
import { ArrowUpRight, Maximize2, MapPinOff, Minimize2, Route, Scan } from "lucide-react";
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

interface Located {
  name: string;
  key: string;
  latitude: number;
  longitude: number;
  extract: string | null;
  articleUrl: string | null;
}

/**
 * Plots named places from their public coordinates, in the order the reply gives them, joined by a
 * dashed route line. Markers carry their number and name, a chip row selects a place to explore, and
 * the map can be opened full screen. Places without coordinates are listed rather than guessed at.
 */
export const PlaceMap = defineComponent({
  name: "PlaceMap",
  description: planningComponentDescriptions.PlaceMap,
  props: PlaceMapSchema,
  component: function PlaceMapView({ props }) {
    const ask = useAskAssistant();
    const { loading, byKey } = usePlaceInfos(props.places);
    const located: Located[] = props.places.flatMap((name) => {
      const key = placeKey(name);
      const info = byKey[key];
      if (!info || info.latitude == null || info.longitude == null) return [];
      return [{ name, key, latitude: info.latitude, longitude: info.longitude, extract: info.extract, articleUrl: info.articleUrl }];
    });
    const unlocated = props.places.filter((name) => !located.some((place) => place.key === placeKey(name)));
    const signature = located.map((place) => `${place.key}:${place.latitude},${place.longitude}`).join("|");
    const [selectedKey, setSelectedKey] = React.useState<string | null>(null);
    const [expanded, setExpanded] = React.useState(false);
    const activeKey = located.some((place) => place.key === selectedKey) ? selectedKey : (located[0]?.key ?? null);
    const active = located.find((place) => place.key === activeKey) ?? null;
    const hasMap = located.length > 0;

    const containerRef = React.useRef<HTMLDivElement | null>(null);
    const mapRef = React.useRef<L.Map | null>(null);
    const layerRef = React.useRef<L.LayerGroup | null>(null);
    const pointsRef = React.useRef<L.LatLngTuple[]>([]);
    const selectRef = React.useRef<(key: string) => void>(() => undefined);
    selectRef.current = setSelectedKey;

    // The map is recreated when it is shown or hidden or moved to the full-screen layer.
    React.useEffect(() => {
      const node = containerRef.current;
      if (!node || !hasMap) return;
      const map = L.map(node, { scrollWheelZoom: false, attributionControl: true, zoomControl: true });
      L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: 18 }).addTo(map);
      mapRef.current = map;
      layerRef.current = L.layerGroup().addTo(map);
      let disposed = false;
      // Measure once laid out; cancelled if the map is removed first (Strict Mode, streaming re-renders).
      const frame = requestAnimationFrame(() => {
        if (!disposed && mapRef.current === map) map.invalidateSize();
      });
      // When the column changes width (window resize, sidebar, rotation), keep the whole route in view.
      // Older test DOMs lack ResizeObserver.
      let width = node.clientWidth;
      const observer =
        typeof ResizeObserver === "undefined"
          ? null
          : new ResizeObserver(() => {
              if (disposed || mapRef.current !== map) return;
              if (node.clientWidth === width) return;
              width = node.clientWidth;
              map.invalidateSize();
              const points = pointsRef.current;
              if (points.length >= 2) map.fitBounds(L.latLngBounds(points), { padding: [44, 44], maxZoom: 11 });
            });
      observer?.observe(node);
      return () => {
        disposed = true;
        cancelAnimationFrame(frame);
        observer?.disconnect();
        map.remove();
        mapRef.current = null;
        layerRef.current = null;
      };
    }, [expanded, hasMap]);

    // Markers, labels and the route line follow the located places and the selection.
    React.useEffect(() => {
      const map = mapRef.current;
      const layer = layerRef.current;
      if (!map || !layer) return;
      layer.clearLayers();
      const points = located.map((place) => [place.latitude, place.longitude] as L.LatLngTuple);
      pointsRef.current = points;
      const wide = typeof window.matchMedia === "function" && window.matchMedia("(min-width: 640px)").matches;
      located.forEach((place, index) => {
        const marker = L.marker([place.latitude, place.longitude], { icon: markerIcon(index + 1, place.key === activeKey), title: place.name, alt: place.name, keyboard: true });
        marker.bindTooltip(`${index + 1}. ${place.name}`, { permanent: wide, direction: "right", offset: [16, 0], className: "tw-map-label", interactive: false });
        marker.on("click", () => selectRef.current(place.key));
        marker.addTo(layer);
      });
      if (points.length >= 2) L.polyline(points, { color: "#c25736", weight: 3, dashArray: "6 8" }).addTo(layer);
      if (points.length >= 2) map.fitBounds(L.latLngBounds(points), { padding: [44, 44], maxZoom: 11 });
      else if (points.length === 1) map.setView(points[0]!, 9);
      map.invalidateSize();
    }, [signature, activeKey, expanded]);

    React.useEffect(() => {
      if (!expanded) return;
      const onKey = (event: KeyboardEvent) => {
        if (event.key === "Escape") setExpanded(false);
      };
      // Capture phase: Leaflet's keyboard handling stops Escape before it bubbles to the window.
      window.addEventListener("keydown", onKey, true);
      return () => window.removeEventListener("keydown", onKey, true);
    }, [expanded]);

    const title = props.title ?? "Places on the map";
    const mapNode = <div ref={containerRef} role="region" aria-label="Map of the places" className="size-full" />;
    const toolbar = (
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button type="button" className="pl-btn" onClick={() => {
          const map = mapRef.current;
          if (!map || pointsRef.current.length === 0) return;
          if (pointsRef.current.length === 1) map.setView(pointsRef.current[0]!, 9);
          else map.fitBounds(L.latLngBounds(pointsRef.current), { padding: [44, 44], maxZoom: 11 });
        }}>
          <Scan className="size-3.5" aria-hidden /> Fit route
        </button>
        <button type="button" className="pl-btn" aria-pressed={expanded} onClick={() => setExpanded((value) => !value)}>
          {expanded ? <Minimize2 className="size-3.5" aria-hidden /> : <Maximize2 className="size-3.5" aria-hidden />}
          {expanded ? "Close map" : "Expand map"}
        </button>
      </div>
    );

    return (
      <section aria-label={title} className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="pl-eyebrow">{title}</p>
          <span className="text-[11px] text-[var(--pl-muted)]" aria-live="polite">
            {loading ? "Locating places…" : `${located.length} of ${props.places.length} located`}
          </span>
        </div>

        {hasMap && !expanded ? (
          <>
            {toolbar}
            <div className="relative h-[320px] w-full overflow-hidden rounded-[18px] border border-[var(--pl-line)] sm:h-[400px]">{mapNode}</div>
          </>
        ) : !hasMap && !loading ? (
          <div className="flex items-start gap-3 rounded-[18px] border border-dashed border-[var(--pl-line)] p-4 text-[12px] text-[var(--pl-muted)]">
            <MapPinOff className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p>None of these places could be located on the map right now. Ask the assistant to describe them instead.</p>
          </div>
        ) : !hasMap ? (
          <div className="h-[220px] animate-pulse rounded-[18px] bg-[var(--pl-surface-2)]" aria-hidden />
        ) : null}

        {expanded && hasMap && typeof document !== "undefined"
          ? createPortal(
              <div role="dialog" aria-modal="true" aria-label={`${title} (full screen)`} className="tw-planner fixed inset-0 z-[90] flex flex-col gap-3 bg-[var(--pl-bg)] p-3 sm:p-5">
                <div className="flex items-center justify-between gap-2">
                  <p className="pl-eyebrow">{title}</p>
                  {toolbar}
                </div>
                <div className="relative min-h-0 flex-1 overflow-hidden rounded-[18px] border border-[var(--pl-line)]">{mapNode}</div>
              </div>,
              document.body,
            )
          : null}

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
          <article className="pl-card grid overflow-hidden sm:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
            <div className="relative aspect-[4/3] sm:aspect-auto sm:min-h-[200px]">
              <DestinationPhoto destination={active.name} className="absolute inset-0 size-full pl-photo" />
            </div>
            <div className="flex min-w-0 flex-col gap-2.5 p-4 sm:p-5">
              <p className="pl-display text-[1.5rem] break-words">{active.name}</p>
              <p className="line-clamp-4 text-[13px] leading-relaxed text-[var(--pl-muted)]">
                {active.extract ?? "Ask the assistant what to see here and how long to stay."}
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
                {active.articleUrl ? (
                  <a href={active.articleUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-[11px] text-[var(--pl-muted)] underline decoration-[var(--pl-line)] underline-offset-2 hover:text-[var(--pl-ink)]">
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
