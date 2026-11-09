/** NOAA NDBC realtime buoy observations (text format). */
import { getText } from "./http";

export type BuoyObs = {
  time: string; windDirDeg: number | null; windKt: number | null; gustKt: number | null;
  waveFt: number | null; dominantPeriodS: number | null; pressureMb: number | null;
  airTempF: number | null; waterTempF: number | null; pressureTendencyMb: number | null;
};

const num = (v: string | undefined) => (v === undefined || v === "MM" ? null : Number(v));
const msToKt = (v: number | null) => (v == null ? null : Math.round(v * 1.943844 * 10) / 10);
const mToFt = (v: number | null) => (v == null ? null : Math.round(v * 3.28084 * 10) / 10);
const cToF = (v: number | null) => (v == null ? null : Math.round((v * 9) / 5 + 32));

/**
 * Parse the realtime2 .txt file. Stations report different fields on different rows, so each
 * field takes the newest non-missing value from the last 3 hours of observations.
 */
export function parseNdbc(text: string): BuoyObs | null {
  const rows = text.split("\n").filter((l) => l && !l.startsWith("#")).map((l) => l.trim().split(/\s+/)).filter((c) => c.length >= 15);
  if (rows.length === 0) return null;
  const t = (c: string[]) => Date.UTC(+c[0], +c[1] - 1, +c[2], +c[3], +c[4]);
  const newest = t(rows[0]);
  const recent = rows.filter((c) => newest - t(c) <= 3 * 3_600_000);
  const first = (idx: number) => {
    for (const c of recent) {
      const v = num(c[idx]);
      if (v != null) return v;
    }
    return null;
  };
  const obs: BuoyObs = {
    time: new Date(newest).toISOString(),
    windDirDeg: first(5), windKt: msToKt(first(6)), gustKt: msToKt(first(7)), waveFt: mToFt(first(8)), dominantPeriodS: first(9),
    pressureMb: first(12), airTempF: cToF(first(13)), waterTempF: cToF(first(14)), pressureTendencyMb: first(17),
  };
  return Object.values(obs).some((v, i) => i > 0 && v != null) ? obs : null;
}

export async function fetchBuoy(id: string) {
  return parseNdbc(await getText(`https://www.ndbc.noaa.gov/data/realtime2/${id.toUpperCase()}.txt`));
}
