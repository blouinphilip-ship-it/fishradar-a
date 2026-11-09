/** NOAA CO-OPS: tide predictions (hi/lo + hourly curve) and water temperature. */
import { getJson } from "./http";

const BASE = "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter";
const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");

export type TideEvent = { time: string; ft: number; type: "H" | "L" };
export type TidePoint = { time: string; ft: number };

/** CO-OPS GMT timestamps look like "2026-11-09 05:12". */
export const coopsTimeToIso = (t: string) => new Date(t.replace(" ", "T") + ":00Z").toISOString();

export function parseHiLo(json: { predictions?: { t: string; v: string; type: string }[]; error?: { message: string } }): TideEvent[] {
  if (json.error) throw new Error(json.error.message);
  return (json.predictions ?? []).map((p) => ({ time: coopsTimeToIso(p.t), ft: Number(p.v), type: p.type === "H" ? "H" : "L" }));
}

export function parseSeries(json: { predictions?: { t: string; v: string }[]; error?: { message: string } }): TidePoint[] {
  if (json.error) throw new Error(json.error.message);
  return (json.predictions ?? []).map((p) => ({ time: coopsTimeToIso(p.t), ft: Number(p.v) }));
}

export async function fetchTides(station: string, from: Date, hours = 72) {
  const end = new Date(from.getTime() + hours * 3_600_000);
  const q = `station=${station}&datum=MLLW&units=english&time_zone=gmt&format=json&application=FishRadarAI&begin_date=${ymd(from)}&end_date=${ymd(end)}`;
  const [hilo, curve] = await Promise.all([
    getJson<Parameters<typeof parseHiLo>[0]>(`${BASE}?product=predictions&interval=hilo&${q}`),
    getJson<Parameters<typeof parseSeries>[0]>(`${BASE}?product=predictions&interval=h&${q}`),
  ]);
  return { events: parseHiLo(hilo), curve: parseSeries(curve) };
}

export function parseWaterTemp(json: { data?: { t: string; v: string }[]; error?: { message: string } }): { time: string; f: number } | null {
  if (json.error) throw new Error(json.error.message);
  const last = json.data?.at(-1);
  if (!last || last.v === "") return null;
  return { time: coopsTimeToIso(last.t), f: Number(last.v) };
}

export async function fetchWaterTemp(station: string) {
  return parseWaterTemp(await getJson(`${BASE}?product=water_temperature&date=latest&station=${station}&units=english&time_zone=gmt&format=json&application=FishRadarAI`));
}

/** Tide stage at a time from the hourly curve: rising/falling/slack + how fast. */
export function tideStageAt(curve: TidePoint[], at: Date): { stage: "rising" | "falling" | "slack"; rateFtPerHr: number } | null {
  if (curve.length < 2) return null;
  const t = at.getTime();
  let i = curve.findIndex((p) => new Date(p.time).getTime() > t);
  if (i <= 0) i = i === 0 ? 1 : curve.length - 1;
  const a = curve[i - 1];
  const b = curve[i];
  const hrs = (new Date(b.time).getTime() - new Date(a.time).getTime()) / 3_600_000 || 1;
  const rate = (b.ft - a.ft) / hrs;
  const stage = Math.abs(rate) < 0.15 ? "slack" : rate > 0 ? "rising" : "falling";
  return { stage, rateFtPerHr: Math.round(rate * 100) / 100 };
}
