"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
import type { Map as MlMap } from "maplibre-gl";
import { useRouter } from "next/navigation";

export type MapPoint = { lat: number; lon: number; color: string; radius?: number; label?: string; href?: string; opacity?: number };

/** Lightweight MapLibre map for run tracks, species ranges and catch pins. */
export function MiniMap({ points, path, className, animatePath = true }: { points: MapPoint[]; path?: [number, number][]; className?: string; animatePath?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const mapRef = useRef<MlMap | null>(null);

  useEffect(() => {
    let raf = 0;
    let cancelled = false;
    (async () => {
      const ml = await import("maplibre-gl");
      if (cancelled || !ref.current) return;
      ml.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
      const map = new ml.Map({
        container: ref.current, attributionControl: { compact: true },
        style: {
          version: 8,
          sources: {
            land: { type: "geojson", data: "/geo/land-50m.json" },
            ocean: { type: "raster", tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}"], tileSize: 256, maxzoom: 13, attribution: "Esri, GEBCO, NOAA" },
          },
          layers: [
            { id: "bg", type: "background", paint: { "background-color": "#0b2a45" } },
            { id: "land", type: "fill", source: "land", paint: { "fill-color": "#24384d", "fill-outline-color": "#4a6a86" } },
            { id: "ocean", type: "raster", source: "ocean", paint: { "raster-opacity": 0.9 } },
          ],
        },
        bounds: bounds(points, path), fitBoundsOptions: { padding: 40, maxZoom: 9 },
      });
      mapRef.current = map;
      map.on("load", () => {
        if (path && path.length > 1) {
          map.addSource("path", { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: path } } });
          map.addLayer({ id: "path-bg", type: "line", source: "path", paint: { "line-color": "#f97316", "line-width": 5, "line-opacity": 0.25 } });
          map.addLayer({ id: "path", type: "line", source: "path", layout: { "line-cap": "round" }, paint: { "line-color": "#f97316", "line-width": 3, "line-dasharray": [0, 4, 3] } });
          if (animatePath) {
            const seq = [[0, 4, 3], [0.5, 4, 2.5], [1, 4, 2], [1.5, 4, 1.5], [2, 4, 1], [2.5, 4, 0.5], [3, 4, 0], [0, 0.5, 3, 3.5], [0, 1, 3, 3], [0, 1.5, 3, 2.5], [0, 2, 3, 2], [0, 2.5, 3, 1.5], [0, 3, 3, 1], [0, 3.5, 3, 0.5]];
            let step = -1;
            let last = 0;
            const tick = (t: number) => {
              if (t - last > 60) { step = (step + 1) % seq.length; map.setPaintProperty("path", "line-dasharray", seq[step]); last = t; }
              raf = requestAnimationFrame(tick);
            };
            raf = requestAnimationFrame(tick);
          }
        }
        map.addSource("pts", { type: "geojson", data: { type: "FeatureCollection", features: points.map((p, i) => ({ type: "Feature", id: i, properties: { color: p.color, r: p.radius ?? 6, href: p.href ?? "", label: p.label ?? "", o: p.opacity ?? 1 }, geometry: { type: "Point", coordinates: [p.lon, p.lat] } })) } });
        map.addLayer({ id: "pts", type: "circle", source: "pts", paint: { "circle-color": ["get", "color"], "circle-radius": ["get", "r"], "circle-opacity": ["get", "o"], "circle-stroke-color": "#fff", "circle-stroke-width": 1 } });
        const popup = new ml.Popup({ closeButton: false, offset: 10 });
        map.on("mouseenter", "pts", (e) => { map.getCanvas().style.cursor = "pointer"; const p = e.features?.[0]; if (p?.properties.label) popup.setLngLat((p.geometry as GeoJSON.Point).coordinates as [number, number]).setHTML(`<div style="font:12px system-ui;color:#0b1726">${String(p.properties.label).replace(/</g, "&lt;")}</div>`).addTo(map); });
        map.on("mouseleave", "pts", () => { map.getCanvas().style.cursor = ""; popup.remove(); });
        map.on("click", "pts", (e) => { const href = e.features?.[0]?.properties.href; if (href) router.push(href); });
      });
    })();
    return () => { cancelled = true; cancelAnimationFrame(raf); mapRef.current?.remove(); mapRef.current = null; };
  }, [points, path, router, animatePath]);

  return <div ref={ref} className={className ?? "h-80 w-full rounded-xl"} />;
}

function bounds(points: MapPoint[], path?: [number, number][]): [[number, number], [number, number]] {
  const all = [...points.map((p) => [p.lon, p.lat] as [number, number]), ...(path ?? [])];
  if (all.length === 0) return [[-125, 24], [-66, 50]];
  const lons = all.map((p) => p[0]);
  const lats = all.map((p) => p[1]);
  const pad = 0.5;
  return [[Math.min(...lons) - pad, Math.min(...lats) - pad], [Math.max(...lons) + pad, Math.max(...lats) + pad]];
}
