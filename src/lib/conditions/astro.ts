/** Sun, moon and solunar periods (pure, computed locally with suncalc). */
import * as SunCalc from "suncalc";

export type SolunarPeriod = { kind: "major" | "minor"; start: string; end: string; label: string };
export type Astro = {
  sunrise: string | null; sunset: string | null; dawn: string | null; dusk: string | null;
  moonPhase: number; moonPhaseName: string; moonIllumination: number; periods: SolunarPeriod[];
};

export function moonPhaseName(p: number): string {
  if (p < 0.03 || p > 0.97) return "New moon";
  if (p < 0.22) return "Waxing crescent";
  if (p < 0.28) return "First quarter";
  if (p < 0.47) return "Waxing gibbous";
  if (p < 0.53) return "Full moon";
  if (p < 0.72) return "Waning gibbous";
  if (p < 0.78) return "Last quarter";
  return "Waning crescent";
}

const isoOrNull = (d: Date | null | undefined) => (d && !Number.isNaN(d.getTime()) ? d.toISOString() : null);

/** Solunar: major = moon overhead / underfoot (±1h), minor = moonrise / moonset (±30m). */
export function solunarPeriods(day: Date, lat: number, lon: number): SolunarPeriod[] {
  const start = new Date(day);
  start.setUTCHours(0, 0, 0, 0);
  const out: SolunarPeriod[] = [];
  let prevAlt = SunCalc.getMoonPosition(start, lat, lon).altitude;
  let prevSlope = 0;
  for (let m = 10; m <= 24 * 60 + 10; m += 10) {
    const t = new Date(start.getTime() + m * 60_000);
    const alt = SunCalc.getMoonPosition(t, lat, lon).altitude;
    const slope = alt - prevAlt;
    if (prevSlope > 0 && slope <= 0) out.push(window(t, 60, "major", "Moon overhead"));
    if (prevSlope < 0 && slope >= 0) out.push(window(t, 60, "major", "Moon underfoot"));
    prevSlope = slope;
    prevAlt = alt;
  }
  const mt = SunCalc.getMoonTimes(start, lat, lon);
  if (mt.rise) out.push(window(mt.rise, 30, "minor", "Moonrise"));
  if (mt.set) out.push(window(mt.set, 30, "minor", "Moonset"));
  return out.sort((a, b) => a.start.localeCompare(b.start));

  function window(center: Date, halfMin: number, kind: "major" | "minor", label: string): SolunarPeriod {
    return { kind, label, start: new Date(center.getTime() - halfMin * 60_000).toISOString(), end: new Date(center.getTime() + halfMin * 60_000).toISOString() };
  }
}

export function astroFor(day: Date, lat: number, lon: number): Astro {
  const t = SunCalc.getTimes(day, lat, lon);
  const ill = SunCalc.getMoonIllumination(day);
  return {
    sunrise: isoOrNull(t.sunrise), sunset: isoOrNull(t.sunset), dawn: isoOrNull(t.dawn), dusk: isoOrNull(t.dusk),
    moonPhase: ill.phase, moonPhaseName: moonPhaseName(ill.phase), moonIllumination: Math.round(ill.fraction * 100),
    periods: solunarPeriods(day, lat, lon),
  };
}

/** Sun altitude in degrees at a time (for light scoring). suncalc 2.x already returns degrees. */
export const sunAltitudeDeg = (at: Date, lat: number, lon: number) => SunCalc.getPosition(at, lat, lon).altitude;
