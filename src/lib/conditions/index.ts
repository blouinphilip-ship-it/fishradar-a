/**
 * Live conditions for a spot: combines NOAA tides/water temp, NDBC buoy, NWS alerts,
 * Open-Meteo weather + marine, USGS river data and local astronomy. Every source is
 * cached separately and fails independently.
 */
import "server-only";
import { cached } from "@/lib/cache";
import type { SpotRow } from "@/lib/data";
import { astroFor, sunAltitudeDeg, type Astro } from "./astro";
import { fetchTides, fetchWaterTemp, tideStageAt, type TideEvent, type TidePoint } from "./coops";
import { safely, type SourceResult } from "./http";
import { fetchBuoy, type BuoyObs } from "./ndbc";
import { fetchAlerts, fetchNwsHourly, isDangerous, type Alert } from "./nws";
import { fetchMarine, fetchWeather, type MarineHour, type WeatherHour } from "./openmeteo";
import { fetchRiver, type RiverObs } from "./usgs";

export type Conditions = {
  spot: { slug: string; lat: number; lon: number; water: string };
  fetchedAt: string;
  tides: SourceResult<{ station: string; events: TideEvent[]; curve: TidePoint[] }> | null;
  waterTemp: SourceResult<{ station: string; time: string; f: number } | null> | null;
  buoy: SourceResult<{ id: string; obs: BuoyObs | null }> | null;
  weather: SourceResult<WeatherHour[]>;
  marine: SourceResult<MarineHour[]> | null;
  alerts: SourceResult<Alert[]>;
  river: SourceResult<{ site: string; obs: RiverObs | null }> | null;
  astro: Astro[];
  now: {
    waterTempF: number | null; waterTempSource: string | null; airTempF: number | null; windKt: number | null; windDirDeg: number | null; gustKt: number | null;
    waveFt: number | null; wavePeriodS: number | null; swellFt: number | null; pressureMb: number | null; pressureChange6hMb: number | null; pressureTrend: "falling" | "steady" | "rising" | null;
    cloudPct: number | null; precipIn: number | null; visibilityMi: number | null; tideStage: "rising" | "falling" | "slack" | null; tideRate: number | null;
    nextTide: TideEvent | null; flowCfs: number | null; gaugeFt: number | null; lakeLevelFt: number | null; dangerous: Alert[];
  };
};

const hourKey = (d: Date) => d.toISOString().slice(0, 13);

export async function getConditions(spot: SpotRow): Promise<Conditions> {
  const now = new Date();
  const { lat, lon } = spot;
  const salt = spot.waterType !== "fresh";
  const k = (s: string) => `cond:${s}:${spot.slug}`;

  const [tides, waterTemp, buoy, weather, marine, alerts, river] = await Promise.all([
    salt && spot.nearestTideStationId
      ? cached(k("tides") + hourKey(now).slice(0, 10), 6 * 3600, () => safely("NOAA CO-OPS", async () => ({ station: spot.nearestTideStationId!, ...(await fetchTides(spot.nearestTideStationId!, new Date(now.getTime() - 12 * 3_600_000), 84)) })))
      : null,
    salt && spot.waterTempStationId
      ? cached(k("wtemp"), 1800, () => safely("NOAA CO-OPS", async () => { const r = await fetchWaterTemp(spot.waterTempStationId!); return r ? { station: spot.waterTempStationId!, ...r } : null; }))
      : null,
    spot.nearestBuoyId ? cached(k("buoy"), 900, () => safely("NOAA NDBC", async () => ({ id: spot.nearestBuoyId!, obs: await fetchBuoy(spot.nearestBuoyId!) }))) : null,
    cached(k("wx"), 1800, async () => {
      const om = await safely("Open-Meteo", () => fetchWeather(lat, lon));
      if (om.ok) return om;
      // Fallback: NWS hourly forecast (US). Keeps wind/temps available when Open-Meteo is rate-limited.
      const nws = await safely("NWS hourly forecast", () => fetchNwsHourly(lat, lon));
      return nws.ok ? nws : om;
    }),
    salt ? cached(k("marine"), 3600, () => safely("Open-Meteo Marine", () => fetchMarine(lat, lon))) : null,
    cached(k("alerts"), 600, () => safely("National Weather Service", () => fetchAlerts(lat, lon))),
    spot.usgsSiteId ? cached(k("usgs"), 900, () => safely("USGS", async () => ({ site: spot.usgsSiteId!, obs: await fetchRiver(spot.usgsSiteId!) }))) : null,
  ]);

  const astro = [0, 1, 2].map((d) => astroFor(new Date(now.getTime() + d * 86_400_000), lat, lon));

  const wxNow = weather.ok ? nearestHour(weather.data, now) : null;
  const wx6 = weather.ok ? nearestHour(weather.data, new Date(now.getTime() - 6 * 3_600_000)) : null;
  const mNow = marine?.ok ? nearestHour(marine.data, now) : null;
  const b = buoy?.ok ? buoy.data.obs : null;
  const tideNow = tides?.ok ? tideStageAt(tides.data.curve, now) : null;
  const pressure = b?.pressureMb ?? wxNow?.pressureMb ?? null;
  const pChange = wxNow?.pressureMb != null && wx6?.pressureMb != null ? Math.round((wxNow.pressureMb - wx6.pressureMb) * 10) / 10 : b?.pressureTendencyMb ?? null;
  const rv = river?.ok ? river.data.obs : null;

  let waterTempF: number | null = null;
  let waterTempSource: string | null = null;
  if (waterTemp?.ok && waterTemp.data) { waterTempF = waterTemp.data.f; waterTempSource = `NOAA station ${waterTemp.data.station}`; }
  else if (b?.waterTempF != null) { waterTempF = b.waterTempF; waterTempSource = `NDBC buoy ${buoy!.ok ? buoy!.data.id : ""}`; }
  else if (rv?.waterTempF != null) { waterTempF = rv.waterTempF; waterTempSource = `USGS ${river!.ok ? river!.data.site : ""}`; }
  else if (mNow?.sstF != null) { waterTempF = mNow.sstF; waterTempSource = "Open-Meteo sea-surface model"; }

  return {
    spot: { slug: spot.slug, lat, lon, water: spot.waterType },
    fetchedAt: now.toISOString(),
    tides, waterTemp, buoy, weather, marine, alerts, river, astro,
    now: {
      waterTempF, waterTempSource,
      airTempF: wxNow?.airTempF ?? b?.airTempF ?? null,
      windKt: b?.windKt ?? wxNow?.windKt ?? null, windDirDeg: b?.windDirDeg ?? wxNow?.windDirDeg ?? null, gustKt: b?.gustKt ?? wxNow?.gustKt ?? null,
      waveFt: b?.waveFt ?? mNow?.waveFt ?? null, wavePeriodS: b?.dominantPeriodS ?? mNow?.wavePeriodS ?? null, swellFt: mNow?.swellFt ?? null,
      pressureMb: pressure, pressureChange6hMb: pChange, pressureTrend: pChange == null ? null : pChange <= -1 ? "falling" : pChange >= 1 ? "rising" : "steady",
      cloudPct: wxNow?.cloudPct ?? null, precipIn: wxNow?.precipIn ?? null, visibilityMi: wxNow?.visibilityMi ?? null,
      tideStage: tideNow?.stage ?? null, tideRate: tideNow?.rateFtPerHr ?? null,
      nextTide: tides?.ok ? tides.data.events.find((e) => new Date(e.time) > now) ?? null : null,
      flowCfs: rv?.flowCfs ?? null, gaugeFt: rv?.gaugeFt ?? null, lakeLevelFt: rv?.lakeLevelFt ?? null,
      dangerous: alerts.ok ? alerts.data.filter(isDangerous) : [],
    },
  };
}

function nearestHour<T extends { time: string }>(rows: T[], at: Date): T | null {
  let best: T | null = null;
  let bestD = Infinity;
  for (const r of rows) {
    const d = Math.abs(new Date(r.time).getTime() - at.getTime());
    if (d < bestD) { bestD = d; best = r; }
  }
  return bestD <= 2 * 3_600_000 ? best : null;
}

/** Hourly inputs for the next N hours (for scoring + the best-times strip). */
export function hourlyInputs(c: Conditions, hours = 72) {
  const start = new Date();
  start.setUTCMinutes(0, 0, 0);
  const out: { time: string; windKt: number | null; waveFt: number | null; waterTempF: number | null; tide: ReturnType<typeof tideStageAt>; sunAltDeg: number; pressureChange6hMb: number | null; solunar: "major" | "minor" | null }[] = [];
  const wx = c.weather.ok ? c.weather.data : [];
  const mar = c.marine?.ok ? c.marine.data : [];
  const periods = c.astro.flatMap((a) => a.periods);
  for (let h = 0; h < hours; h++) {
    const t = new Date(start.getTime() + h * 3_600_000);
    const w = nearestHour(wx, t);
    const w6 = nearestHour(wx, new Date(t.getTime() - 6 * 3_600_000));
    const m = nearestHour(mar, t);
    const p = periods.find((x) => new Date(x.start) <= t && new Date(x.end) >= t);
    out.push({
      time: t.toISOString(),
      windKt: h === 0 ? c.now.windKt : w?.windKt ?? null,
      waveFt: h === 0 ? c.now.waveFt : m?.waveFt ?? null,
      waterTempF: c.now.waterTempF ?? m?.sstF ?? null,
      tide: c.tides?.ok ? tideStageAt(c.tides.data.curve, t) : null,
      sunAltDeg: Math.round(sunAltitudeDeg(t, c.spot.lat, c.spot.lon) * 10) / 10,
      pressureChange6hMb: w?.pressureMb != null && w6?.pressureMb != null ? Math.round((w.pressureMb - w6.pressureMb) * 10) / 10 : null,
      solunar: p ? p.kind : null,
    });
  }
  return out;
}
