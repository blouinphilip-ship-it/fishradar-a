import "server-only";
import { getConditions, hourlyInputs, type Conditions } from "@/lib/conditions";
import type { SpeciesAtSpot, SpotRow } from "@/lib/data";
import { bestWindows, scoreHour, seasonalAt, type ScoreResult } from "@/lib/scoring";

export type SpotForecast = {
  conditions: Conditions;
  species: SpeciesAtSpot | null;
  now: ScoreResult;
  hours: { time: string; score: number; capped: boolean }[];
  windows: { start: string; end: string; peak: number; avg: number }[];
};

/** Score the next 72 hours for one species at a spot (defaults to the top species). */
export async function getSpotForecast(spot: SpotRow, speciesList: SpeciesAtSpot[], speciesSlug?: string, conditions?: Conditions): Promise<SpotForecast> {
  const c = conditions ?? (await getConditions(spot));
  const sp = (speciesSlug ? speciesList.find((s) => s.slug === speciesSlug) : speciesList[0]) ?? null;
  const profile = sp?.profile ?? {};
  const noTide = spot.waterType === "fresh";
  const dangerous = c.now.dangerous.length > 0;
  const hours = hourlyInputs(c, 72).map((h) => {
    const t = new Date(h.time);
    const r = scoreHour({
      reportsSignal: sp ? sp.signal * Math.exp(-(t.getTime() - Date.now()) / (86_400_000 * 6)) : null,
      seasonal: sp ? seasonalAt(sp.monthly, t) : null,
      waterTempF: h.waterTempF, tide: noTide ? null : h.tide, noTide, sunAltDeg: h.sunAltDeg, windKt: h.windKt,
      pressureChange6hMb: h.pressureChange6hMb, solunar: h.solunar,
      safety: { dangerousAlert: dangerous && t.getTime() - Date.now() < 12 * 3_600_000, waveFt: h.waveFt, safeWaveFt: spot.safeWaveFt },
    }, profile);
    return { time: h.time, score: r.score, capped: r.safetyCapped, result: r };
  });
  return {
    conditions: c, species: sp,
    now: hours[0]?.result ?? scoreHour({ reportsSignal: sp?.signal ?? null, seasonal: sp?.seasonalNow ?? null, waterTempF: null, tide: null, sunAltDeg: null, windKt: null, pressureChange6hMb: null, solunar: null }, profile),
    hours: hours.map(({ time, score, capped }) => ({ time, score, capped })),
    windows: bestWindows(hours.map(({ time, score }) => ({ time, score }))),
  };
}
