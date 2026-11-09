"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, ChevronRight, Crosshair, Flame, Layers, MapPin, Navigation, X } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { InfoLegend } from "@/components/info-legend";
import { ReportKindBadge, RunStatusBadge, WaterBadge } from "@/components/fr/badges";
import { ScoreDial, scoreWord } from "@/components/fr/score";
import { degToCompass } from "@/lib/geo";
import { timeAgo } from "@/lib/format";
import type { RunStatus } from "@/lib/scoring";
import { cn } from "@/lib/utils";
import type { Basemap, GlobeFilters } from "./globe";

const Globe = dynamic(() => import("./globe").then((m) => m.Globe), { ssr: false, loading: () => <div className="flex h-full items-center justify-center text-sm text-slate-300">Loading globe…</div> });

type Summary = {
  spot: { slug: string; name: string; water: string; state: string | null; description: string | null; lat: number; lon: number; accessModes: string[] };
  score: number;
  running: { slug: string; name: string; status: RunStatus; label: string; reportsThisWeek: number; lastReportAt: string | null }[];
  seasonal: { slug: string; name: string }[];
  reports: { id: number; summary: string; publishedAt: string; isDemo: boolean; sourceName: string }[];
};
type Cond = { now: { waterTempF: number | null; windKt: number | null; windDirDeg: number | null; waveFt: number | null; tideStage: string | null; flowCfs: number | null; dangerous: { event: string }[] }; alerts: { event: string; headline: string }[] };
type Near = { slug: string; name: string; water: string; miles: number; state: string | null };

export function GlobeApp() {
  const router = useRouter();
  const params = useSearchParams();
  const [filters, setFilters] = useState<GlobeFilters>({ water: (params.get("water") as GlobeFilters["water"]) ?? "all", days: 14, heatmap: false, basemap: "ocean" });
  const [selected, setSelected] = useState<string | null>(params.get("spot"));
  const [summary, setSummary] = useState<Summary | null>(null);
  const [cond, setCond] = useState<Cond | null>(null);
  const [near, setNear] = useState<Near[] | null>(null);
  const [me, setMe] = useState<{ lat: number; lon: number } | null>(null);
  const [flyTo, setFlyTo] = useState<{ lat: number; lon: number; zoom?: number } | null>(null);
  const [layersOpen, setLayersOpen] = useState(false);
  const [geoMsg, setGeoMsg] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("fr-location");
      if (saved) { const p = JSON.parse(saved); setMe(p); loadNear(p.lat, p.lon); }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!selected) { setSummary(null); setCond(null); return; }
    let live = true;
    setSummary(null); setCond(null);
    fetch(`/api/spots/${selected}/summary`).then((r) => r.json()).then((j) => { if (live && !j.error) { setSummary(j); setFlyTo({ lat: j.spot.lat, lon: j.spot.lon, zoom: 7.5 }); } });
    fetch(`/api/spots/${selected}/conditions`).then((r) => r.json()).then((j) => live && !j.error && setCond(j)).catch(() => {});
    const u = new URL(window.location.href);
    u.searchParams.set("spot", selected);
    window.history.replaceState(null, "", u);
    return () => { live = false; };
  }, [selected]);

  const loadNear = (lat: number, lon: number) => fetch(`/api/nearest?lat=${lat}&lon=${lon}`).then((r) => r.json()).then((j) => setNear(j.spots ?? []));

  const pick = useCallback((lat: number, lon: number) => {
    const p = { lat, lon };
    setMe(p);
    setSelected(null);
    try { localStorage.setItem("fr-location", JSON.stringify(p)); } catch { /* ignore */ }
    loadNear(lat, lon);
    const u = new URL(window.location.href);
    u.searchParams.delete("spot");
    window.history.replaceState(null, "", u);
  }, []);

  const locate = () => {
    if (!navigator.geolocation) return setGeoMsg("Location isn't available in this browser — click the globe to set where you are.");
    setGeoMsg("Finding you…");
    navigator.geolocation.getCurrentPosition(
      (pos) => { setGeoMsg(null); const lat = +pos.coords.latitude.toFixed(4); const lon = +pos.coords.longitude.toFixed(4); pick(lat, lon); setFlyTo({ lat, lon, zoom: 7 }); },
      () => setGeoMsg("Location permission denied — click anywhere on the globe or search for where you are."),
      { timeout: 10_000 },
    );
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col md:h-[calc(100dvh-57px)] md:flex-none md:flex-row">
      <section aria-label="Globe" className="relative h-[58dvh] min-h-[320px] flex-1 md:h-full">
        <Globe filters={filters} selected={selected} onSelectSpot={setSelected} onPickLocation={pick} myLocation={me} flyTo={flyTo} />

        <div className="absolute left-3 top-3 z-10 flex max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-border bg-surface/95 p-0.5 text-xs shadow" role="group" aria-label="Water type filter">
            {(["all", "salt", "fresh"] as const).map((w) => (
              <button key={w} onClick={() => setFilters((f) => ({ ...f, water: w }))} aria-pressed={filters.water === w}
                className={cn("rounded-md px-2.5 py-1 font-medium", filters.water === w ? (w === "fresh" ? "bg-fresh text-white" : w === "salt" ? "bg-salt text-white" : "bg-primary text-primary-foreground") : "text-muted-foreground hover:text-foreground")}>
                {w === "all" ? "All water" : w === "salt" ? "Saltwater" : "Freshwater"}
              </button>
            ))}
          </div>
          <Button size="sm" variant="secondary" className="shadow" onClick={locate}><Crosshair /> Use my location</Button>
          <Button size="sm" variant="secondary" className="shadow" onClick={() => setLayersOpen((v) => !v)} aria-expanded={layersOpen}><Layers /> Layers</Button>
        </div>
        {geoMsg && <p className="absolute left-3 top-14 z-10 max-w-xs rounded-md bg-surface/95 px-3 py-2 text-xs shadow">{geoMsg}</p>}
        {layersOpen && (
          <div className="absolute left-3 top-14 z-20 w-64 space-y-3 rounded-lg border border-border bg-surface/95 p-3 text-sm shadow-xl">
            <fieldset>
              <legend className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Basemap</legend>
              {(["ocean", "satellite", "plain"] as Basemap[]).map((b) => (
                <label key={b} className="flex items-center gap-2 py-0.5"><input type="radio" name="basemap" checked={filters.basemap === b} onChange={() => setFilters((f) => ({ ...f, basemap: b }))} /> {b === "ocean" ? "Ocean depth (bathymetry)" : b === "satellite" ? "Satellite" : "Plain (offline-friendly)"}</label>
              ))}
            </fieldset>
            <label className="flex items-center gap-2"><input type="checkbox" checked={filters.heatmap} onChange={(e) => setFilters((f) => ({ ...f, heatmap: e.target.checked }))} /> Report heatmap</label>
            <p className="text-[11px] text-muted-foreground">Sea-surface temperature, wind and chlorophyll overlays are planned (NOAA CoastWatch); see PROGRESS.md.</p>
          </div>
        )}

        <div className="absolute inset-x-3 bottom-3 z-10 rounded-lg border border-border bg-surface/95 px-3 py-2 text-xs shadow md:right-auto md:w-96">
          <label className="flex items-center gap-3">
            <span className="shrink-0 font-medium">Reports from the last</span>
            <input type="range" min={1} max={30} value={filters.days} onChange={(e) => setFilters((f) => ({ ...f, days: Number(e.target.value) }))} className="flex-1 accent-[var(--primary)]" aria-label="Report freshness in days" />
            <span className="w-14 text-right tabular-nums">{filters.days} days</span>
          </label>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1"><i className="inline-block size-2.5 rounded-full bg-salt" /> Saltwater</span>
            <span className="flex items-center gap-1"><i className="inline-block size-2.5 rounded-full bg-fresh" /> Freshwater</span>
            <span className="flex items-center gap-1"><i className="inline-block size-2.5 rounded-full border-2 border-orange-500" /> Run active</span>
            <span>Bigger = higher score · faded = no recent reports</span>
          </div>
        </div>
      </section>

      <aside aria-label="Spot details" className="relative z-10 max-h-[60dvh] overflow-y-auto border-t border-border bg-surface p-4 md:max-h-none md:w-[400px] md:border-l md:border-t-0">
        {selected ? (
          <SpotPreview s={summary} c={cond} onClose={() => { setSelected(null); const u = new URL(window.location.href); u.searchParams.delete("spot"); window.history.replaceState(null, "", u); }} onOpen={() => router.push(`/spot/${selected}`)} />
        ) : near ? (
          <div>
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 font-semibold"><Navigation className="size-4 text-primary" /> Spots near you</h2>
              <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => { setNear(null); setMe(null); try { localStorage.removeItem("fr-location"); } catch { /* */ } }}>Clear</button>
            </div>
            {me && <p className="text-xs text-muted-foreground">From {me.lat.toFixed(3)}, {me.lon.toFixed(3)} — click the globe to move.</p>}
            <ul className="mt-3 divide-y divide-border">
              {near.map((n) => (
                <li key={n.slug}>
                  <button onClick={() => setSelected(n.slug)} className="flex w-full items-center gap-3 py-2.5 text-left hover:bg-muted/50">
                    <span className={cn("size-2.5 shrink-0 rounded-full", n.water === "fresh" ? "bg-fresh" : "bg-salt")} />
                    <span className="flex-1"><span className="font-medium">{n.name}</span><span className="block text-xs text-muted-foreground">{n.state} · {n.miles} mi away</span></span>
                    <ChevronRight className="size-4 text-muted-foreground" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div>
            <div className="flex items-center gap-2 text-muted-foreground"><MapPin className="size-4" /><span className="text-sm">No spot selected</span></div>
            <h1 className="mt-3 text-xl font-bold">Know where the fish are — before you leave the dock.</h1>
            <p className="mt-2 text-sm text-muted-foreground">Click a spot to see what&apos;s running, live tides and conditions, reports, catches and the lures that are working. Or click anywhere on the globe to set your location.</p>
            <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
              {[["montauk-point-ny", "Montauk Point"], ["cape-cod-canal-ma", "Cape Cod Canal"], ["islamorada-fl", "Islamorada"], ["hampton-harbor-nh", "Hampton Harbor"], ["lake-winnipesaukee-nh", "Lake Winnipesaukee"], ["point-loma-ca", "San Diego"]].map(([slug, name]) => (
                <button key={slug} onClick={() => setSelected(slug)} className="rounded-md border border-border px-2 py-1.5 text-left hover:bg-muted">{name}</button>
              ))}
            </div>
            <h2 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-muted-foreground">How to read FishRadar</h2>
            <InfoLegend />
            <p className="mt-4 text-xs text-muted-foreground">Gray &quot;Demo data&quot; reports are generated samples until real report sources are connected.</p>
          </div>
        )}
      </aside>
    </div>
  );
}

function SpotPreview({ s, c, onClose, onOpen }: { s: Summary | null; c: Cond | null; onClose: () => void; onOpen: () => void }) {
  if (!s) return <div className="animate-pulse space-y-3"><div className="h-6 w-2/3 rounded bg-muted" /><div className="h-20 rounded bg-muted" /><div className="h-32 rounded bg-muted" /></div>;
  const n = c?.now;
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <h2 className="text-lg font-bold leading-tight">{s.spot.name}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground"><WaterBadge water={s.spot.water} /> {s.spot.state} · {s.spot.accessModes.join(" / ")}</div>
        </div>
        <ScoreDial score={s.score} size={56} />
        <button onClick={onClose} aria-label="Close spot" className="text-muted-foreground hover:text-foreground"><X className="size-5" /></button>
      </div>
      <p className="text-xs text-muted-foreground">{scoreWord(s.score)} · quick score from reports + season. Open the spot for the full live-conditions score.</p>
      {c && c.alerts.length > 0 && <p role="alert" className="flex items-center gap-2 rounded-md border border-danger bg-danger/10 px-2 py-1.5 text-xs font-semibold text-danger"><AlertTriangle className="size-4" /> {c.alerts.map((a) => a.event).join(" · ")}</p>}
      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        <div className="rounded-md bg-muted p-2"><div className="text-muted-foreground">Water</div><div className="text-base font-semibold">{n?.waterTempF != null ? `${Math.round(n.waterTempF)}°` : c ? "—" : "…"}</div></div>
        <div className="rounded-md bg-muted p-2"><div className="text-muted-foreground">Wind</div><div className="text-base font-semibold">{n?.windKt != null ? `${degToCompass(n.windDirDeg)} ${Math.round(n.windKt)}` : c ? "—" : "…"}</div></div>
        <div className="rounded-md bg-muted p-2"><div className="text-muted-foreground">{s.spot.water === "fresh" ? "Flow" : "Tide"}</div><div className="text-base font-semibold capitalize">{s.spot.water === "fresh" ? (n?.flowCfs != null ? `${n.flowCfs}` : c ? "—" : "…") : (n?.tideStage ?? (c ? "—" : "…"))}</div></div>
      </div>
      <div>
        <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><Flame className="size-4 text-orange-500" /> What&apos;s running</h3>
        {s.running.length === 0 && <p className="text-sm text-muted-foreground">No reports in the last 14 days.</p>}
        <ul className="space-y-1.5">
          {s.running.map((r) => (
            <li key={r.slug}>
              <Link href={`/spot/${s.spot.slug}/species/${r.slug}`} className="flex items-center gap-2 rounded-md px-1 py-1 text-sm hover:bg-muted">
                <span className="flex-1 font-medium">{r.name}</span><RunStatusBadge status={r.status} /><span className="w-16 text-right text-xs text-muted-foreground">{timeAgo(r.lastReportAt)}</span>
              </Link>
            </li>
          ))}
        </ul>
        {s.seasonal.length > 0 && <p className="mt-2 text-xs text-muted-foreground"><span className="font-semibold text-seasonal">Seasonal expectation:</span> {s.seasonal.map((x) => x.name).join(", ")} are typically around now.</p>}
      </div>
      {s.reports.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold">Latest reports</h3>
          <ul className="space-y-2">
            {s.reports.map((r) => (
              <li key={r.id} className="rounded-md border border-border p-2 text-xs">
                <div className="mb-1 flex items-center gap-2"><ReportKindBadge isDemo={r.isDemo} isVerified /> <span className="text-muted-foreground">{timeAgo(r.publishedAt)}</span></div>
                {r.summary}
              </li>
            ))}
          </ul>
        </div>
      )}
      <Button className="w-full" onClick={onOpen}>Open full spot report <ChevronRight /></Button>
      <Link href={`/assistant?q=${encodeURIComponent(`What should I fish for at ${s.spot.name} this week, and with what?`)}`} className={cn(buttonVariants({ variant: "outline" }), "w-full")}>Ask the AI about this spot</Link>
    </div>
  );
}
