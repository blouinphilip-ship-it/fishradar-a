/**
 * Fishing Score engine (spec §9). Pure functions only — everything here is unit-tested.
 *
 * Each factor returns a value in 0..1 (1 = ideal). The score is the weighted average of the
 * factors we have data for, scaled to 0–100. Missing data is skipped (and reported), never guessed.
 * A safety cap applies when there are dangerous marine alerts or waves above the spot's limit.
 */

export const WEIGHTS = {
  reports: 30,
  seasonal: 20,
  waterTemp: 15,
  tide: 10,
  light: 10,
  wind: 7,
  pressure: 5,
  solunar: 3,
} as const;
export type FactorKey = keyof typeof WEIGHTS;

export type SpeciesProfile = {
  tempMinF?: number | null; tempOptF?: number | null; tempMaxF?: number | null;
  nightBonus?: number; tideWeight?: number; preferredTide?: "incoming" | "outgoing" | "moving"; offshore?: boolean;
};

export type HourInputs = {
  reportsSignal: number | null;
  seasonal: number | null;
  waterTempF: number | null;
  tide: { stage: "rising" | "falling" | "slack"; rateFtPerHr: number } | null;
  sunAltDeg: number | null;
  windKt: number | null;
  pressureChange6hMb: number | null;
  solunar: "major" | "minor" | null;
  /** true when the spot has no tide (freshwater). */
  noTide?: boolean;
  safety?: { dangerousAlert: boolean; waveFt: number | null; safeWaveFt: number | null };
};

export type ScoreResult = {
  score: number;
  factors: { key: FactorKey; value: number; weight: number; points: number; note: string }[];
  missing: FactorKey[];
  safetyCapped: boolean;
  safetyNote: string | null;
};

const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));

/** Recency-weighted report strength. ageDays = days since each report; abundance weights stronger reports. */
export function reportsSignal(reports: { ageDays: number; abundance?: string | null }[]): number {
  const aw = (a?: string | null) => (a === "excellent" ? 1.4 : a === "good" ? 1.1 : a === "fair" ? 0.8 : a === "slow" ? 0.4 : 0.9);
  const sum = reports.filter((r) => r.ageDays >= 0 && r.ageDays <= 14).reduce((acc, r) => acc + Math.exp(-r.ageDays / 4) * aw(r.abundance), 0);
  return clamp(1 - Math.exp(-sum / 1.5));
}

/** Seasonal likelihood for a date from a 12-month calendar, interpolated between month midpoints. */
export function seasonalAt(monthly: number[], date: Date): number {
  if (monthly.length !== 12) return 0;
  const m = date.getUTCMonth();
  const dim = new Date(Date.UTC(date.getUTCFullYear(), m + 1, 0)).getUTCDate();
  const pos = (date.getUTCDate() - 0.5) / dim; // 0..1 through the month
  if (pos < 0.5) {
    const prev = monthly[(m + 11) % 12];
    return clamp(prev + (monthly[m] - prev) * (pos + 0.5));
  }
  const next = monthly[(m + 1) % 12];
  return clamp(monthly[m] + (next - monthly[m]) * (pos - 0.5));
}

export function waterTempFactor(t: number, p: SpeciesProfile): number {
  const opt = p.tempOptF ?? 65;
  const lo = p.tempMinF ?? opt - 15;
  const hi = p.tempMaxF ?? opt + 15;
  const sigma = Math.max(3, (hi - lo) / 4);
  const g = Math.exp(-0.5 * ((t - opt) / sigma) ** 2);
  if (t < lo - 4 || t > hi + 4) return Math.min(g, 0.1);
  return clamp(g);
}

export function tideFactor(tide: NonNullable<HourInputs["tide"]>, p: SpeciesProfile): number {
  let v = tide.stage === "slack" ? 0.35 : 0.6 + Math.min(0.4, (Math.abs(tide.rateFtPerHr) / 1.0) * 0.4);
  if (p.preferredTide === "incoming") v += tide.stage === "rising" ? 0.15 : tide.stage === "falling" ? -0.15 : 0;
  if (p.preferredTide === "outgoing") v += tide.stage === "falling" ? 0.15 : tide.stage === "rising" ? -0.15 : 0;
  return clamp(v);
}

export function lightFactor(sunAltDeg: number, p: SpeciesProfile): number {
  const sightFish = p.preferredTide === "incoming"; // flats species need sun to see fish
  if (sunAltDeg < -6) return sightFish ? 0.15 : clamp(0.45 + ((p.nightBonus ?? 1) - 1) * 1.3);
  if (sunAltDeg < 10) return sightFish ? 0.55 : 1;
  if (sunAltDeg < 40) return sightFish ? 0.85 + ((sunAltDeg - 10) / 30) * 0.15 : 0.85 - ((sunAltDeg - 10) / 30) * 0.3;
  return sightFish ? 1 : 0.55;
}

export function windFactor(kt: number): number {
  if (kt <= 5) return 0.85;
  if (kt <= 12) return 1;
  if (kt >= 30) return 0;
  return clamp(1 - (kt - 12) / 18);
}

export function pressureFactor(change6hMb: number): number {
  if (change6hMb <= -1.5) return 1; // falling ahead of a front
  if (change6hMb >= 2.5) return 0.35; // sharply rising — post-front
  if (change6hMb >= 1) return 0.55;
  return 0.75;
}

export const solunarFactor = (s: HourInputs["solunar"]) => (s === "major" ? 1 : s === "minor" ? 0.8 : 0.5);

const NOTES: Record<FactorKey, (v: number) => string> = {
  reports: (v) => (v > 0.7 ? "Strong recent reports" : v > 0.35 ? "Some recent reports" : v > 0.05 ? "Few recent reports" : "No recent reports"),
  seasonal: (v) => (v > 0.7 ? "Peak season" : v > 0.4 ? "In season" : v > 0.15 ? "Fringe of season" : "Out of season"),
  waterTemp: (v) => (v > 0.8 ? "Ideal water temperature" : v > 0.45 ? "Workable water temperature" : "Water temp outside preferred range"),
  tide: (v) => (v > 0.8 ? "Strong moving water" : v > 0.55 ? "Moving tide" : "Slack tide"),
  light: (v) => (v > 0.9 ? "Prime light" : v > 0.6 ? "Decent light" : "Poor light for this species"),
  wind: (v) => (v > 0.9 ? "Fishable wind" : v > 0.5 ? "Breezy" : "Too windy"),
  pressure: (v) => (v > 0.9 ? "Falling pressure (pre-front)" : v > 0.6 ? "Steady pressure" : "Rising pressure (post-front)"),
  solunar: (v) => (v > 0.9 ? "Solunar major period" : v > 0.7 ? "Solunar minor period" : "Between solunar periods"),
};

export function scoreHour(i: HourInputs, p: SpeciesProfile): ScoreResult {
  const tideW = i.noTide ? 0 : p.offshore ? (p.tideWeight ?? 0.3) : (p.tideWeight ?? 1);
  const raw: [FactorKey, number | null, number][] = [
    ["reports", i.reportsSignal, WEIGHTS.reports],
    ["seasonal", i.seasonal, WEIGHTS.seasonal],
    ["waterTemp", i.waterTempF == null ? null : waterTempFactor(i.waterTempF, p), WEIGHTS.waterTemp],
    ["tide", i.tide ? tideFactor(i.tide, p) : null, WEIGHTS.tide * tideW],
    ["light", i.sunAltDeg == null ? null : lightFactor(i.sunAltDeg, p), WEIGHTS.light],
    ["wind", i.windKt == null ? null : windFactor(i.windKt), WEIGHTS.wind],
    ["pressure", i.pressureChange6hMb == null ? null : pressureFactor(i.pressureChange6hMb), WEIGHTS.pressure],
    ["solunar", i.solunar === undefined ? null : solunarFactor(i.solunar), WEIGHTS.solunar],
  ];
  const present = raw.filter(([, v, w]) => v != null && w > 0) as [FactorKey, number, number][];
  const missing = raw.filter(([k, v, w]) => v == null && !(k === "tide" && w === 0)).map(([k]) => k);
  const totalW = present.reduce((a, [, , w]) => a + w, 0) || 1;
  const factors = present.map(([key, value, weight]) => ({
    key, value: Math.round(value * 100) / 100, weight: Math.round(weight * 10) / 10,
    points: Math.round(((value * weight) / totalW) * 1000) / 10, note: NOTES[key](value),
  }));
  let score = Math.round(factors.reduce((a, f) => a + f.points, 0));

  let safetyCapped = false;
  let safetyNote: string | null = null;
  if (i.safety) {
    const tooRough = i.safety.waveFt != null && i.safety.safeWaveFt != null && i.safety.safeWaveFt > 0 && i.safety.waveFt > i.safety.safeWaveFt;
    if (i.safety.dangerousAlert || tooRough) {
      safetyCapped = true;
      safetyNote = i.safety.dangerousAlert ? "Active marine/weather warning — boating not advised" : `Seas ${i.safety.waveFt} ft exceed this spot's ${i.safety.safeWaveFt} ft limit`;
      score = Math.min(score, 35);
    }
  }
  return { score: clamp(score, 0, 100), factors, missing, safetyCapped, safetyNote };
}

/** Run status label used across the UI (spec §7). */
export type RunStatus = "hot" | "active" | "starting" | "tapering" | "in_season" | "out_of_season";

export function runStatus(signal: number, seasonalNow: number, seasonalNextMonth: number): RunStatus {
  if (signal > 0.75) return "hot";
  if (signal > 0.4) return seasonalNextMonth < seasonalNow - 0.15 ? "tapering" : "active";
  if (signal > 0.12) return seasonalNextMonth >= seasonalNow ? "starting" : "tapering";
  if (seasonalNow >= 0.4) return "in_season";
  return "out_of_season";
}

export const RUN_STATUS_LABEL: Record<RunStatus, string> = {
  hot: "Hot", active: "Active", starting: "Starting", tapering: "Tapering", in_season: "In season (no recent reports)", out_of_season: "Out of season",
};

/** Quick score without live conditions — used for globe markers. */
export function quickScore(signal: number, seasonal: number): number {
  return Math.round(((signal * WEIGHTS.reports + seasonal * WEIGHTS.seasonal) / (WEIGHTS.reports + WEIGHTS.seasonal)) * 100);
}

/** Rank the best fishing windows from hourly scores: contiguous runs of hours ≥ threshold. */
export function bestWindows(hours: { time: string; score: number }[], minScore = 0, maxWindows = 5): { start: string; end: string; peak: number; avg: number }[] {
  if (hours.length === 0) return [];
  const scores = hours.map((h) => h.score);
  let threshold = Math.max(minScore, percentile(scores, 0.75));
  const median = percentile(scores, 0.5);
  if (threshold <= median) threshold = median + 1; // windows must stand out from a typical hour
  if (threshold > Math.max(...scores)) {
    const best = hours.reduce((a, b) => (b.score > a.score ? b : a));
    return [{ start: best.time, end: new Date(new Date(best.time).getTime() + 3_600_000).toISOString(), peak: best.score, avg: best.score }];
  }
  const wins: { start: string; end: string; peak: number; avg: number }[] = [];
  let cur: typeof hours = [];
  const flush = () => {
    if (cur.length) {
      const end = new Date(new Date(cur.at(-1)!.time).getTime() + 3_600_000).toISOString();
      wins.push({ start: cur[0].time, end, peak: Math.max(...cur.map((c) => c.score)), avg: Math.round(cur.reduce((a, c) => a + c.score, 0) / cur.length) });
    }
    cur = [];
  };
  for (const h of hours) {
    if (h.score >= threshold) cur.push(h);
    else flush();
  }
  flush();
  return wins.sort((a, b) => b.peak - a.peak || b.avg - a.avg).slice(0, maxWindows);
}

function percentile(v: number[], p: number) {
  const s = [...v].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
}
