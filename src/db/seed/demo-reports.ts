/**
 * Deterministic DEMO report generator. Produces plausible reports driven by run windows and
 * seasonal calendars so the Run Tracker, lure rankings and spot feeds have shape before real
 * sources are connected. Every generated report is stored with is_demo = true.
 */
import { SPECIES, monthly, type SpeciesSeed } from "./species";
import { TACKLE } from "./tackle";
import { RUNS, SPOTS, type SpotSeed } from "./spots";
import { dayOfYear } from "../../lib/geo";

export type DemoReport = {
  key: string; spot: string; date: Date; title: string; summary: string;
  species: { slug: string; abundance: string; size: string }[];
  lures: string[]; baits: string[]; conditions: Record<string, string>;
  catchNote: string; catchLength: number;
};

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SIZE: Record<string, [number, number, string]> = {
  "striped-bass": [18, 44, '"'], bluefish: [14, 34, '"'], "false-albacore": [6, 14, " lb"], "atlantic-bonito": [3, 9, " lb"],
  "summer-flounder": [14, 26, '"'], "black-sea-bass": [12, 22, '"'], tautog: [14, 24, '"'], "red-drum": [18, 46, '"'],
  "spotted-seatrout": [14, 28, '"'], snook: [20, 40, '"'], tarpon: [40, 150, " lb"], bonefish: [3, 10, " lb"], permit: [10, 30, " lb"],
  "bluefin-tuna": [40, 600, " lb"], "yellowfin-tuna": [25, 120, " lb"], "mahi-mahi": [6, 40, " lb"], sailfish: [30, 70, " lb"],
  "california-yellowtail": [10, 35, " lb"], "pacific-bluefin-tuna": [20, 200, " lb"], walleye: [15, 29, '"'], "smallmouth-bass": [12, 21, '"'],
  "largemouth-bass": [12, 24, '"'], steelhead: [22, 34, '"'], "chinook-salmon": [10, 40, " lb"],
};

const TIDES = ["the start of the outgoing", "the last of the incoming", "the top of the tide", "the first of the flood", "a strong dropping tide", "the bottom of the tide"];
const TIMES = ["at first light", "around sunrise", "mid-morning", "late afternoon", "at dusk", "after dark"];
const WINDS = ["light SW wind", "a NW breeze", "NE wind at 10–15", "flat calm conditions", "a stiff onshore wind", "light and variable winds"];
const ABUND = (x: number) => (x > 0.72 ? "excellent" : x > 0.45 ? "good" : x > 0.2 ? "fair" : "slow");

function pick<T>(r: () => number, arr: T[]): T { return arr[Math.floor(r() * arr.length)]; }

function sizeNote(r: () => number, slug: string, abundance: string): { text: string; len: number } {
  const [lo, hi, unit] = SIZE[slug] ?? [12, 30, '"'];
  const a = lo + Math.round(r() * (hi - lo) * 0.4);
  const b = Math.min(hi, a + Math.round((hi - lo) * (abundance === "excellent" ? 0.6 : 0.35) * r()) + 2);
  return { text: `${a}–${b}${unit}`, len: unit === '"' ? b : 0 };
}

function makeReport(r: () => number, spot: SpotSeed, sp: SpeciesSeed, date: Date, intensity: number, idx: number): DemoReport {
  const tackle = TACKLE[sp.group];
  const lures = [...new Set([tackle.lures[Math.floor(r() * Math.min(3, tackle.lures.length))], r() < 0.5 ? pick(r, tackle.lures) : undefined].filter(Boolean))] as string[];
  const baits = r() < 0.55 && tackle.baits.length ? [tackle.baits[Math.floor(r() * Math.min(2, tackle.baits.length))]] : [];
  const abundance = ABUND(intensity + (r() - 0.5) * 0.2);
  const size = sizeNote(r, sp.slug, abundance);
  const tide = sp.water.includes("salt") && spot.water !== "fresh" ? pick(r, TIDES) : null;
  const time = pick(r, TIMES);
  const wind = pick(r, WINDS);
  const verb = abundance === "excellent" ? "Hot bite" : abundance === "good" ? "Solid action" : abundance === "fair" ? "Pick of fish" : "Tough fishing";
  const lureNames = lures.map((l) => l.replace(/-/g, " ")).join(" and ");
  const baitNames = baits.map((b) => b.replace(/-/g, " ")).join(", ");
  const parts = [
    `${verb} on ${sp.common.toLowerCase()} at ${spot.name} ${time}${tide ? ` on ${tide}` : ""} with ${wind}.`,
    `Fish ran ${size.text}.`,
    lures.length ? `Best producers were ${lureNames}${baits.length ? `, with ${baitNames} working for bait anglers` : ""}.` : baits.length ? `Bait anglers did best on ${baitNames}.` : "",
  ];
  return {
    key: `${spot.slug}:${sp.slug}:${date.toISOString().slice(0, 10)}:${idx}`,
    spot: spot.slug, date,
    title: `${sp.common} — ${spot.name}`,
    summary: parts.filter(Boolean).join(" "),
    species: [{ slug: sp.slug, abundance, size: size.text }],
    lures, baits,
    conditions: { ...(tide ? { tide } : {}), time, wind },
    catchNote: `${sp.common} ${time}${lures[0] ? ` on a ${lures[0].replace(/-/g, " ")}` : baits[0] ? ` on ${baits[0].replace(/-/g, " ")}` : ""}. (Demo catch)`,
    catchLength: size.len || 0,
  };
}

export function generateDemoReports({ now, days, seed }: { now: Date; days: number; seed: number }): DemoReport[] {
  const r = mulberry32(seed);
  const out: DemoReport[] = [];
  const bySlug = new Map(SPECIES.map((s) => [s.slug, s]));
  let idx = 0;

  for (let d = 0; d < days; d++) {
    const date = new Date(now.getTime() - d * 86_400_000);
    date.setUTCHours(11 + Math.floor(r() * 10), Math.floor(r() * 60), 0, 0);
    if (date > now) date.setTime(now.getTime() - 3_600_000);
    const doy = dayOfYear(date);
    const month = date.getUTCMonth();
    const covered = new Set<string>();

    // A) runs move through states along their windows
    for (const run of RUNS) {
      const sp = bySlug.get(run.species)!;
      for (const w of run.windows) {
        const x = doy >= w.startDoy && doy <= w.endDoy ? doy : doy + 365 >= w.startDoy && doy + 365 <= w.endDoy ? doy + 365 : null;
        if (x == null) continue;
        const intensity = x <= w.peakDoy ? (x - w.startDoy) / Math.max(1, w.peakDoy - w.startDoy) : (w.endDoy - x) / Math.max(1, w.endDoy - w.peakDoy);
        for (const spot of SPOTS) {
          if (spot.state !== w.region || !spot.species.includes(run.species)) continue;
          if (run.water === "fresh" && spot.water === "salt") continue;
          covered.add(`${spot.slug}:${run.species}`);
          if (r() < 0.04 + 0.26 * intensity) out.push(makeReport(r, spot, sp, date, intensity, idx++));
        }
      }
    }

    // B) everything else follows the seasonal calendar
    for (const spot of SPOTS) {
      for (const slug of new Set(spot.species)) {
        if (covered.has(`${spot.slug}:${slug}`)) continue;
        const sp = bySlug.get(slug)!;
        const cal = sp.seasons[spot.zone];
        if (!cal) continue;
        const v = monthly(cal)[month];
        if (v < 0.35) continue;
        if (r() < 0.03 * v * v) out.push(makeReport(r, spot, sp, date, v * 0.9, idx++));
      }
    }
  }
  return out;
}
