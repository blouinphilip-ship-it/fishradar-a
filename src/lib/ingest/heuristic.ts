/**
 * Rule-based report extractor — used when no Anthropic key is configured, and as the
 * normalization step that maps free text to catalog entries. Pure + unit-tested.
 */
import type { Extraction } from "./schema";

export type DictLike = {
  species: { slug: string; terms: string[] }[];
  lures: { slug: string; terms: string[] }[];
  baits: { slug: string; terms: string[] }[];
  spots: { slug: string; terms: string[] }[];
};

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Find which catalog entries are mentioned. Longest terms win so "sp minnow" beats "minnow". */
export function findMentions(text: string, entries: { slug: string; terms: string[] }[]): { slug: string; term: string; index: number }[] {
  const t = ` ${text.toLowerCase().replace(/[’']/g, "'")} `;
  const all = entries.flatMap((e) => e.terms.filter((x) => x.length >= 3).map((term) => ({ slug: e.slug, term })))
    .sort((a, b) => b.term.length - a.term.length);
  const taken: [number, number][] = [];
  const found = new Map<string, { slug: string; term: string; index: number }>();
  for (const { slug, term } of all) {
    const re = new RegExp(`(?<![a-z0-9])${escape(term)}s?(?![a-z0-9])`, "g");
    for (const m of t.matchAll(re)) {
      const start = m.index!;
      const end = start + m[0].length;
      if (taken.some(([a, b]) => start < b && end > a)) continue;
      taken.push([start, end]);
      if (!found.has(slug)) found.set(slug, { slug, term, index: start });
    }
  }
  return [...found.values()].sort((a, b) => a.index - b.index);
}

export function abundanceFrom(text: string): "excellent" | "good" | "fair" | "slow" | null {
  const t = text.toLowerCase();
  if (/(blitz|on fire|lights out|epic|insane|wide open|hot bite|best day|banner)/.test(t)) return "excellent";
  if (/(good|solid|steady|plenty|lots of|consistent|nice)/.test(t)) return "good";
  if (/(slow|tough|scratch|dead|skunk|nothing|quiet)/.test(t)) return "slow";
  if (/(some|few|pick|scattered|spotty)/.test(t)) return "fair";
  return null;
}

export function sizeFrom(text: string): string | null {
  const m = text.match(/(\d{1,3}\s?(?:-|–|to)\s?\d{1,3}\s?(?:"|inches|in\b|lb|lbs|pounds))|(up to \d{1,3}\s?(?:"|inches|in\b|lb|lbs|pounds))|(\d{1,3}\s?(?:"|lb|lbs)\b)/i);
  return m ? m[0].trim() : null;
}

export function waterTempFrom(text: string): number | null {
  const m = text.match(/(\d{2})\s?(?:°|degrees?|deg)\s?f?\b/i) ?? text.match(/water(?:\s+temp(?:erature)?)?\s+(?:is|was|at|around|of)?\s*(\d{2})/i);
  return m ? Number(m[1]) : null;
}

export function heuristicExtract(text: string, dict: DictLike, reportDate: string | null): Extraction {
  const species = findMentions(text, dict.species);
  const lures = findMentions(text, dict.lures);
  const baits = findMentions(text, dict.baits);
  const spots = findMentions(text, dict.spots);
  const abundance = abundanceFrom(text);
  const tide = text.match(/(incoming|outgoing|falling|rising|dropping|flood|ebb|slack)\s+(?:tide|water)?/i)?.[1]?.toLowerCase() ?? null;
  const wind = text.match(/\b(N|S|E|W|NE|NW|SE|SW|NNE|NNW|SSE|SSW|ENE|ESE|WNW|WSW)\s?(?:wind)?\s?(?:at\s)?\d{1,2}(?:\s?-\s?\d{1,2})?\s?(?:kt|knots|mph)?/)?.[0] ?? null;
  const isReport = species.length > 0 && /(caught|catch|landed|hooked|bite|biting|fish(ed|ing)|blitz|keeper|limit|report|action|boated|released|working)/i.test(text);
  return {
    is_fishing_report: isReport,
    report_date: reportDate,
    locations: spots.map((s) => ({ name: s.term, confidence: 0.7 })),
    species: species.map((s) => ({ name: s.term, abundance, size_notes: sizeFrom(text) })),
    lures: lures.map((l) => ({ raw: l.term, type: null, color: null })),
    bait: baits.map((b) => ({ raw: b.term })),
    techniques: [],
    conditions_mentioned: { water_temp_f: waterTempFrom(text), wind, tide },
    summary: summarize(text),
    extraction_confidence: isReport ? Math.min(0.75, 0.35 + 0.1 * (species.length + lures.length + baits.length + spots.length)) : 0.1,
  };
}

/** Short neutral summary: first two sentences, trimmed. (Claude writes real own-words summaries.) */
function summarize(text: string): string {
  const s = text.replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s+/).slice(0, 2).join(" ");
  return s.length > 280 ? s.slice(0, 277) + "…" : s;
}
