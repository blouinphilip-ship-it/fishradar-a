"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import type { GeoJSONSource, Map as MlMap, MapLayerMouseEvent, Marker, Popup, StyleSpecification } from "maplibre-gl";
import type { SpotMarker } from "@/lib/data";

export type Basemap = "ocean" | "satellite" | "plain";
export type GlobeFilters = { water: "all" | "salt" | "fresh"; days: number; heatmap: boolean; basemap: Basemap };

type Props = {
  filters: GlobeFilters;
  selected: string | null;
  onSelectSpot: (slug: string) => void;
  onPickLocation: (lat: number, lon: number) => void;
  myLocation: { lat: number; lon: number } | null;
  flyTo: { lat: number; lon: number; zoom?: number } | null;
};

const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services";

function style(): StyleSpecification {
  return {
    version: 8,
    projection: { type: "globe" },
    glyphs: "https://fonts.openmaptiles.org/{fontstack}/{range}.pbf",
    sky: { "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 5, 1, 7, 0] },
    sources: {
      land: { type: "geojson", data: "/geo/land-50m.json" },
      ocean: { type: "raster", tiles: [`${ESRI}/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}`], tileSize: 256, maxzoom: 13, attribution: "Esri, GEBCO, NOAA, Garmin, HERE" },
      oceanLabels: { type: "raster", tiles: [`${ESRI}/Ocean/World_Ocean_Reference/MapServer/tile/{z}/{y}/{x}`], tileSize: 256, maxzoom: 13 },
      satellite: { type: "raster", tiles: [`${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`], tileSize: 256, maxzoom: 18, attribution: "Esri, Maxar, Earthstar Geographics" },
    },
    layers: [
      { id: "bg", type: "background", paint: { "background-color": "#0b2a45" } },
      { id: "land", type: "fill", source: "land", paint: { "fill-color": "#24384d", "fill-outline-color": "#4a6a86" } },
      { id: "ocean", type: "raster", source: "ocean", paint: { "raster-opacity": 0.95 } },
      { id: "satellite", type: "raster", source: "satellite", layout: { visibility: "none" } },
      { id: "oceanLabels", type: "raster", source: "oceanLabels", paint: { "raster-opacity": 0.9 } },
    ],
  };
}

export function Globe({ filters, selected, onSelectSpot, onPickLocation, myLocation, flyTo }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const markersRef = useRef<SpotMarker[]>([]);
  const pinRef = useRef<Marker | null>(null);
  const popupRef = useRef<Popup | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cb = useRef({ onSelectSpot, onPickLocation });
  const filtersRef = useRef(filters);
  const selectedRef = useRef(selected);
  useEffect(() => {
    cb.current = { onSelectSpot, onPickLocation };
    filtersRef.current = filters;
    selectedRef.current = selected;
  });

  // init
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ml = await import("maplibre-gl");
      if (cancelled || !ref.current) return;
      ml.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
      const map = new ml.Map({ container: ref.current, style: style(), center: [-80, 34], zoom: 2.4, attributionControl: { compact: true }, maxPitch: 60 });
      mapRef.current = map;
      map.addControl(new ml.NavigationControl({ visualizePitch: true }), "bottom-right");
      const ro = new ResizeObserver(() => map.resize());
      ro.observe(ref.current);
      map.on("remove", () => ro.disconnect());
      map.on("error", (e) => {
        // tile failures are expected when offline/blocked; the land layer still renders
        if (!String(e.error?.message ?? "").match(/tile|fetch|glyph|pbf|Failed/i)) console.warn(e.error);
      });
      map.on("load", async () => {
        const res = await fetch("/api/spots").then((r) => r.json()).catch(() => null);
        if (!res) { setError("Couldn't load spots"); return; }
        markersRef.current = res.markers;
        map.addSource("spots", { type: "geojson", data: toGeo(res.markers, filtersRef.current), cluster: true, clusterRadius: 38, clusterMaxZoom: 7, clusterProperties: { maxScore: ["max", ["get", "score"]] } });
        map.addSource("heat", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        map.addLayer({ id: "heat", type: "heatmap", source: "heat", layout: { visibility: "none" }, paint: { "heatmap-weight": ["interpolate", ["linear"], ["get", "n"], 0, 0, 20, 1], "heatmap-intensity": 1.2, "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 2, 18, 8, 40], "heatmap-opacity": 0.75 } });
        map.addLayer({ id: "clusters", type: "circle", source: "spots", filter: ["has", "point_count"], paint: { "circle-color": "#0e7490", "circle-opacity": 0.85, "circle-stroke-color": "#e6eef7", "circle-stroke-width": 1.5, "circle-radius": ["step", ["get", "point_count"], 14, 8, 18, 20, 24] } });
        map.addLayer({ id: "cluster-count", type: "symbol", source: "spots", filter: ["has", "point_count"], layout: { "text-field": ["get", "point_count_abbreviated"], "text-font": ["Open Sans Bold"], "text-size": 12 }, paint: { "text-color": "#fff" } });
        map.addLayer({ id: "run-halo", type: "circle", source: "spots", filter: ["all", ["!", ["has", "point_count"]], ["==", ["get", "activeRun"], true]], paint: { "circle-radius": ["+", 9, ["/", ["get", "score"], 9]], "circle-color": "transparent", "circle-stroke-color": "#f97316", "circle-stroke-width": 2.5, "circle-stroke-opacity": ["get", "opacity"] } });
        map.addLayer({ id: "points", type: "circle", source: "spots", filter: ["!", ["has", "point_count"]], paint: {
          "circle-color": ["match", ["get", "water"], "fresh", "#2fa36b", "#2f7fe0"],
          "circle-radius": ["+", 5, ["/", ["get", "score"], 12]],
          "circle-opacity": ["get", "opacity"], "circle-stroke-color": "#ffffff", "circle-stroke-width": ["case", ["==", ["get", "slug"], selectedRef.current ?? ""], 3, 1], "circle-stroke-opacity": ["get", "opacity"],
          "circle-blur": 0.05,
        } });
        map.addLayer({ id: "labels", type: "symbol", source: "spots", filter: ["!", ["has", "point_count"]], minzoom: 6, layout: { "text-field": ["get", "name"], "text-font": ["Open Sans Bold"], "text-size": 11, "text-offset": [0, 1.3], "text-anchor": "top" }, paint: { "text-color": "#fff", "text-halo-color": "#07121f", "text-halo-width": 1.5 } });

        map.on("click", "clusters", async (e) => {
          const f = e.features?.[0];
          if (!f) return;
          const zoom = await (map.getSource("spots") as GeoJSONSource).getClusterExpansionZoom(f.properties!.cluster_id);
          map.easeTo({ center: (f.geometry as GeoJSON.Point).coordinates as [number, number], zoom: zoom + 0.5 });
        });
        map.on("click", "points", (e) => {
          const slug = e.features?.[0]?.properties?.slug;
          if (slug) cb.current.onSelectSpot(slug);
        });
        map.on("click", (e: MapLayerMouseEvent) => {
          const hit = map.queryRenderedFeatures(e.point, { layers: ["points", "clusters"] });
          if (hit.length === 0) cb.current.onPickLocation(Math.round(e.lngLat.lat * 1e4) / 1e4, Math.round(e.lngLat.lng * 1e4) / 1e4);
        });
        const popup = new ml.Popup({ closeButton: false, closeOnClick: false, offset: 12, className: "fr-popup" });
        popupRef.current = popup;
        map.on("mouseenter", "points", (e) => {
          map.getCanvas().style.cursor = "pointer";
          const p = e.features?.[0]?.properties;
          if (!p) return;
          const top = JSON.parse(p.top ?? "[]") as string[];
          popup.setLngLat((e.features![0].geometry as GeoJSON.Point).coordinates as [number, number]).setHTML(
            `<div style="font:12px system-ui;color:#0b1726;min-width:180px"><strong>${esc(p.name)}</strong> <span style="color:${p.water === "fresh" ? "#1f7a4f" : "#1f5fae"}">${p.water === "fresh" ? "Freshwater" : "Saltwater"}</span>` +
            `<div>Fishing Score <b>${p.score}</b>${p.activeRun ? " · 🔥 run active" : ""}</div>` +
            `<div>${top.length ? "Running: " + top.map(esc).join(", ") : "No recent reports"}</div>` +
            `<div style="color:#55657a">${p.lastReportAt ? "Last report " + new Date(p.lastReportAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""}</div></div>`,
          ).addTo(map);
        });
        map.on("mouseleave", "points", () => { map.getCanvas().style.cursor = ""; popup.remove(); });
        map.on("mouseenter", "clusters", () => (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", "clusters", () => (map.getCanvas().style.cursor = ""));
        setReady(true);
      });
    })().catch((e) => setError(String(e)));
    return () => { cancelled = true; mapRef.current?.remove(); mapRef.current = null; };
  }, []);

  // filters → data + layers
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    (map.getSource("spots") as GeoJSONSource | undefined)?.setData(toGeo(markersRef.current, filters));
    map.setLayoutProperty("heat", "visibility", filters.heatmap ? "visible" : "none");
    if (filters.heatmap) (map.getSource("heat") as GeoJSONSource).setData(`/api/heatmap?days=${filters.days}`);
    map.setLayoutProperty("ocean", "visibility", filters.basemap === "ocean" ? "visible" : "none");
    map.setLayoutProperty("oceanLabels", "visibility", filters.basemap === "plain" ? "none" : "visible");
    map.setLayoutProperty("satellite", "visibility", filters.basemap === "satellite" ? "visible" : "none");
  }, [filters, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    map.setPaintProperty("points", "circle-stroke-width", ["case", ["==", ["get", "slug"], selected ?? ""], 3.5, 1]);
  }, [selected, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !flyTo) return;
    map.flyTo({ center: [flyTo.lon, flyTo.lat], zoom: flyTo.zoom ?? 7, speed: 1.4 });
  }, [flyTo, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    (async () => {
      const ml = await import("maplibre-gl");
      pinRef.current?.remove();
      if (myLocation) {
        const el = document.createElement("div");
        el.className = "fr-pin";
        el.title = "Your location";
        pinRef.current = new ml.Marker({ element: el }).setLngLat([myLocation.lon, myLocation.lat]).addTo(map);
      }
    })();
  }, [myLocation, ready]);

  return (
    <div className="relative h-full w-full">
      <div ref={ref} className="h-full w-full" data-testid="globe" />
      {!ready && !error && <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-slate-300">Loading globe…</div>}
      {error && <div className="absolute inset-0 flex items-center justify-center text-sm text-danger">{error}</div>}
    </div>
  );
}

function toGeo(markers: SpotMarker[], f: GlobeFilters): GeoJSON.FeatureCollection {
  const cutoff = Date.now() - f.days * 86_400_000;
  return {
    type: "FeatureCollection",
    features: markers
      .filter((m) => f.water === "all" || (f.water === "fresh" ? m.water === "fresh" : m.water !== "fresh"))
      .map((m) => {
        const recent = m.lastReportAt ? new Date(m.lastReportAt).getTime() >= cutoff : false;
        return { type: "Feature", geometry: { type: "Point", coordinates: [m.lon, m.lat] }, properties: { ...m, top: JSON.stringify(m.top), opacity: recent ? 1 : 0.45, activeRun: m.activeRun && recent } };
      }),
  };
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
