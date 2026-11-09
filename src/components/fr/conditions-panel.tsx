import { AlertTriangle, ArrowUp, Droplets, Gauge, Moon, Sunrise, Thermometer, Waves, Wind } from "lucide-react";
import type { Conditions } from "@/lib/conditions";
import { degToCompass } from "@/lib/geo";
import { TideChart } from "./charts";

const tz = "America/New_York";
const t = (iso: string | null | undefined, zone = tz) => (iso ? new Date(iso).toLocaleString("en-US", { hour: "numeric", minute: "2-digit", timeZone: zone }) : "—");

export function tzForLon(lon: number) {
  return lon < -150 ? "Pacific/Honolulu" : lon < -130 ? "America/Anchorage" : lon < -114 ? "America/Los_Angeles" : lon < -102 ? "America/Denver" : lon < -87.5 ? "America/Chicago" : "America/New_York";
}

export function SafetyBanner({ c }: { c: Conditions }) {
  const alerts = c.alerts.ok ? c.alerts.data : [];
  const danger = alerts.filter((a) => /(warning|small craft|hazardous|gale|storm|hurricane|rip current|advisory)/i.test(a.event));
  if (!danger.length) return null;
  return (
    <div role="alert" className="rounded-lg border-2 border-danger bg-danger/10 p-3 text-sm">
      <p className="flex items-center gap-2 font-bold text-danger"><AlertTriangle className="size-5" /> {danger.map((a) => a.event).join(" · ")}</p>
      <p className="mt-1">{danger[0].headline}</p>
      <details className="mt-1"><summary className="cursor-pointer text-xs text-muted-foreground">Details from the National Weather Service</summary><p className="mt-1 whitespace-pre-line text-xs">{danger[0].description}</p></details>
    </div>
  );
}

function Stat({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-2.5">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">{icon}{label}</div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

export function ConditionsPanel({ c }: { c: Conditions }) {
  const n = c.now;
  const zone = tzForLon(c.spot.lon);
  const a = c.astro[0];
  const fresh = c.spot.water === "fresh";
  const sources = [c.tides, c.waterTemp, c.buoy, c.weather, c.marine, c.alerts, c.river].filter(Boolean) as { ok: boolean; source: string; fetchedAt: string }[];
  const down = sources.filter((s) => !s.ok);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat icon={<Thermometer className="size-3.5" />} label="Water temp" value={n.waterTempF != null ? `${Math.round(n.waterTempF)}°F` : "—"} sub={n.waterTempSource ?? "unavailable"} />
        <Stat icon={<Wind className="size-3.5" />} label="Wind" value={n.windKt != null ? <span className="inline-flex items-center gap-1">{degToCompass(n.windDirDeg)} {Math.round(n.windKt)} kt {n.windDirDeg != null && <ArrowUp className="size-4" style={{ transform: `rotate(${(n.windDirDeg + 180) % 360}deg)` }} />}</span> : "—"} sub={n.gustKt != null ? `gusts ${Math.round(n.gustKt)} kt` : undefined} />
        {!fresh && <Stat icon={<Waves className="size-3.5" />} label="Seas" value={n.waveFt != null ? `${n.waveFt} ft` : "—"} sub={n.wavePeriodS != null ? `${n.wavePeriodS}s period${n.swellFt != null ? ` · swell ${n.swellFt} ft` : ""}` : undefined} />}
        {fresh && <Stat icon={<Droplets className="size-3.5" />} label="Streamflow" value={n.flowCfs != null ? `${n.flowCfs.toLocaleString()} cfs` : "—"} sub={n.gaugeFt != null ? `gauge ${n.gaugeFt} ft` : n.lakeLevelFt != null ? `lake level ${n.lakeLevelFt} ft` : "no USGS gauge nearby"} />}
        <Stat icon={<Gauge className="size-3.5" />} label="Pressure" value={n.pressureMb != null ? `${Math.round(n.pressureMb)} mb` : "—"} sub={n.pressureTrend ? `${n.pressureTrend}${n.pressureChange6hMb != null ? ` (${n.pressureChange6hMb > 0 ? "+" : ""}${n.pressureChange6hMb} / 6h)` : ""}` : undefined} />
        <Stat icon={<Thermometer className="size-3.5" />} label="Air" value={n.airTempF != null ? `${Math.round(n.airTempF)}°F` : "—"} sub={n.cloudPct != null ? `${n.cloudPct}% cloud` : undefined} />
        {!fresh && <Stat icon={<Waves className="size-3.5" />} label="Tide" value={n.tideStage ? n.tideStage[0].toUpperCase() + n.tideStage.slice(1) : "—"} sub={n.nextTide ? `${n.nextTide.type === "H" ? "High" : "Low"} ${n.nextTide.ft.toFixed(1)} ft at ${t(n.nextTide.time, zone)}` : "no tide station"} />}
        <Stat icon={<Sunrise className="size-3.5" />} label="Sun" value={`${t(a?.sunrise, zone)}`} sub={`sets ${t(a?.sunset, zone)}`} />
        <Stat icon={<Moon className="size-3.5" />} label="Moon" value={a?.moonPhaseName ?? "—"} sub={a ? `${a.moonIllumination}% lit` : undefined} />
      </div>

      {c.tides?.ok && <div className="rounded-lg border border-border bg-surface p-2"><p className="px-1 text-xs text-muted-foreground">Tide prediction — NOAA station {c.tides.data.station} (MLLW)</p><TideChart curve={c.tides.data.curve} events={c.tides.data.events} /></div>}

      {a && a.periods.length > 0 && (
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Solunar today:</span>{" "}
          {a.periods.filter((p) => new Date(p.end) > new Date(Date.now() - 86_400_000)).map((p) => `${p.kind === "major" ? "Major" : "Minor"} ${t(p.start, zone)}–${t(p.end, zone)}`).join(" · ")}
        </p>
      )}

      <p className="text-[11px] text-muted-foreground">
        Sources: {sources.filter((s) => s.ok).map((s) => s.source).filter((v, i, arr) => arr.indexOf(v) === i).join(", ") || "none"}.
        {down.length > 0 && <> Unavailable right now: {down.map((d) => d.source).join(", ")} (showing what we have).</>}
        {" "}Times shown in {zone.split("/")[1].replace("_", " ")} time.
      </p>
    </div>
  );
}
