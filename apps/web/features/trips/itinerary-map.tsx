"use client";
import * as React from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export interface MapStop {
  key: string;
  destination: string;
  latitude: number | null;
  longitude: number | null;
}

/**
 * Client-only Leaflet map: numbered markers in stop order joined by a straight polyline (not a driving route).
 * `compact` drops the captions and fills its container (dashboard widget); tiles are tinted to the dark theme.
 */
export default function ItineraryMap({ stops, compact, className }: { stops: MapStop[]; compact?: boolean; className?: string }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const mapRef = React.useRef<L.Map | null>(null);
  const layerRef = React.useRef<L.LayerGroup | null>(null);

  const located = stops.map((s, i) => ({ ...s, n: i + 1 })).filter((s): s is MapStop & { n: number; latitude: number; longitude: number } => s.latitude !== null && s.longitude !== null && Number.isFinite(s.latitude) && Number.isFinite(s.longitude));
  const missing = stops.length - located.length;

  React.useEffect(() => {
    if (!ref.current || mapRef.current) return;
    const map = L.map(ref.current, { scrollWheelZoom: false, zoomControl: !compact, zoomAnimation: !compact, attributionControl: true }).setView([7.8, 80.7], 7);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    // Grid/flex parents can settle after init; keep Leaflet's tile layout in step with the container.
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(ref.current);
    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  const signature = located.map((s) => `${s.n}:${s.latitude},${s.longitude}:${s.destination}`).join("|");
  React.useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    if (located.length === 0) return;
    const pts: L.LatLngTuple[] = located.map((s) => [s.latitude, s.longitude]);
    for (const s of located) {
      const icon = L.divIcon({ className: "", html: `<div style="width:26px;height:26px;border-radius:9999px;background:#c25736;color:#ffffff;font:600 12px system-ui;display:flex;align-items:center;justify-content:center;border:2px solid #ffffff;box-shadow:0 1px 4px rgba(0,0,0,.4)">${s.n}</div>`, iconSize: [26, 26], iconAnchor: [13, 13] });
      L.marker([s.latitude, s.longitude], { icon, title: `${s.n}. ${s.destination}`, keyboard: true, alt: `Stop ${s.n}: ${s.destination}` }).bindPopup(`${s.n}. ${s.destination.replace(/[<>&]/g, "")}`).addTo(layer);
    }
    if (pts.length > 1) L.polyline(pts, { color: "#c25736", weight: 3, opacity: 0.7, dashArray: "6 6" }).addTo(layer);
    if (pts.length === 1) map.setView(pts[0]!, 9);
    else map.fitBounds(L.latLngBounds(pts), { padding: [30, 30] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  if (compact) {
    return <div ref={ref} role="region" aria-label="Map of the itinerary stops" className={`tw-map-dark size-full ${className ?? ""}`} />;
  }
  return (
    <div>
      {located.length === 0 ? <p role="status" className="mb-2 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning">None of the stops has coordinates yet, so nothing can be plotted. Pick a known place or enter latitude and longitude on each stop.</p> : null}
      {located.length > 0 && missing > 0 ? <p role="status" className="mb-2 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning">{missing} stop{missing === 1 ? " has" : "s have"} no coordinates and {missing === 1 ? "is" : "are"} not shown on the map.</p> : null}
      <div ref={ref} role="region" aria-label="Map of the itinerary stops" className={`tw-map-dark h-80 w-full rounded-lg border border-border ${className ?? ""}`} />
      <p className="mt-1 text-xs text-muted-foreground">The dashed line joins stops in order; it is not a driving route.</p>
    </div>
  );
}
