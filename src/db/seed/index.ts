/**
 * Seed script: `pnpm db:seed`
 *
 * - Upserts zones/states, species (+ season calendars + tackle), lures, baits, spots, runs,
 *   regulation links, and data sources.
 * - Resolves each spot's nearest NOAA tide station, NOAA water-temp station, NDBC buoy and
 *   USGS gauge (cached in stations.cache.json so later seeds work offline).
 * - Generates DEMO fishing reports (is_demo = true) so the UI has something to show until real
 *   sources are connected. Demo rows are always labeled in the UI.
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as s from "../schema";
import { SPECIES, ZONES, monthly } from "./species";
import { BAITS, LURES, TACKLE } from "./tackle";
import { RUNS, SPOTS, STATES } from "./spots";
import { generateDemoReports } from "./demo-reports";
import { fuzzPoint, haversineKm } from "../../lib/geo";

const client = postgres(process.env.DATABASE_URL ?? "postgres://postgres@localhost:5432/fishradar", { max: 1, onnotice: () => {} });
const db = drizzle(client, { schema: s });

const CACHE = path.join(path.dirname(new URL(import.meta.url).pathname), "stations.cache.json");
type StationCache = Record<string, { tide?: string | null; wtemp?: string | null; buoy?: string | null; usgs?: string | null }>;

async function fetchText(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, { headers: { "User-Agent": "FishRadarAI-seed/0.1" }, signal: AbortSignal.timeout(30_000) });
    return r.ok ? await r.text() : null;
  } catch {
    return null;
  }
}

type Pt = { id: string; lat: number; lon: number };
function nearest(list: Pt[], lat: number, lon: number, maxKm: number): string | null {
  let best: Pt | null = null;
  let bestD = Infinity;
  for (const p of list) {
    const d = haversineKm(lat, lon, p.lat, p.lon);
    if (d < bestD) { bestD = d; best = p; }
  }
  return best && bestD <= maxKm ? best.id : null;
}

async function resolveStations(): Promise<StationCache> {
  const cache: StationCache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, "utf8")) : {};
  const missing = SPOTS.filter((sp) => !cache[sp.slug]);
  if (missing.length === 0) return cache;
  console.log(`Resolving stations for ${missing.length} spots…`);

  const coops = async (type: string): Promise<Pt[]> => {
    const t = await fetchText(`https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json?type=${type}`);
    if (!t) return [];
    return (JSON.parse(t).stations as { id: string; lat: number; lng: number }[]).map((x) => ({ id: x.id, lat: x.lat, lon: x.lng }));
  };
  const tide = await coops("tidepredictions");
  const wtemp = await coops("watertemp");
  const ndbcXml = await fetchText("https://www.ndbc.noaa.gov/activestations.xml");
  const buoys: Pt[] = [];
  if (ndbcXml) {
    for (const m of ndbcXml.matchAll(/<station id="([^"]+)" lat="([-\d.]+)" lon="([-\d.]+)"[^>]*?met="y"[^>]*?>/g)) {
      buoys.push({ id: m[1], lat: Number(m[2]), lon: Number(m[3]) });
    }
  }
  console.log(`  tide stations: ${tide.length}, water-temp stations: ${wtemp.length}, met buoys: ${buoys.length}`);

  for (const sp of missing) {
    const entry: StationCache[string] = {};
    if (sp.water !== "fresh") {
      entry.tide = nearest(tide, sp.lat, sp.lon, 40);
      entry.wtemp = nearest(wtemp, sp.lat, sp.lon, 40);
      entry.buoy = nearest(buoys, sp.lat, sp.lon, sp.type === "offshore" || sp.type === "canyon" ? 200 : 90);
    } else {
      entry.buoy = sp.type === "lake" ? nearest(buoys, sp.lat, sp.lon, 30) : null; // Great Lakes buoys
    }
    if (sp.water !== "salt") {
      const d = 0.25;
      const rdb = await fetchText(
        `https://waterservices.usgs.gov/nwis/site/?format=rdb&bBox=${(sp.lon - d).toFixed(6)},${(sp.lat - d).toFixed(6)},${(sp.lon + d).toFixed(6)},${(sp.lat + d).toFixed(6)}&siteStatus=active&hasDataTypeCd=iv&parameterCd=00060,00065,00010,62614`,
      );
      const sites: Pt[] = [];
      for (const line of (rdb ?? "").split("\n")) {
        const c = line.split("\t");
        if (c[0] === "USGS" && c[4] && c[5]) sites.push({ id: c[1], lat: Number(c[4]), lon: Number(c[5]) });
      }
      entry.usgs = nearest(sites, sp.lat, sp.lon, 30);
    }
    cache[sp.slug] = entry;
  }
  fs.writeFileSync(CACHE, JSON.stringify(cache, null, 1));
  return cache;
}

async function main() {
  const stations = await resolveStations();

  // ── Regions: zones + states ──────────────────────────────────────────────
  const regionId = new Map<string, number>();
  for (const z of ZONES) {
    const [r] = await db.insert(s.regions).values({ slug: `zone-${z.slug}`, name: z.name, level: "zone" })
      .onConflictDoUpdate({ target: s.regions.slug, set: { name: z.name } }).returning({ id: s.regions.id });
    regionId.set(`zone-${z.slug}`, r.id);
  }
  for (const st of STATES) {
    const [r] = await db.insert(s.regions).values({ slug: st.code.toLowerCase(), name: st.name, level: "state", stateCode: st.code })
      .onConflictDoUpdate({ target: s.regions.slug, set: { name: st.name, stateCode: st.code } }).returning({ id: s.regions.id });
    regionId.set(st.code, r.id);
  }

  // ── Species, seasons, tackle ─────────────────────────────────────────────
  const speciesId = new Map<string, number>();
  for (const sp of SPECIES) {
    const values = {
      slug: sp.slug, commonName: sp.common, scientificName: sp.sci, nicknames: sp.nick, waterTypes: sp.water,
      tempMinF: sp.temp[0], tempOptF: sp.temp[1], tempMaxF: sp.temp[2], description: sp.desc,
      scoringProfile: { group: sp.group, ...(sp.profile ?? {}) },
    };
    const [r] = await db.insert(s.species).values(values).onConflictDoUpdate({ target: s.species.slug, set: values }).returning({ id: s.species.id });
    speciesId.set(sp.slug, r.id);
  }
  await db.delete(s.speciesSeasons);
  for (const sp of SPECIES) {
    for (const [zone, cal] of Object.entries(sp.seasons)) {
      await db.insert(s.speciesSeasons).values({ speciesId: speciesId.get(sp.slug)!, regionId: regionId.get(`zone-${zone}`)!, monthly: monthly(cal!) });
    }
  }

  // ── Lures & baits ────────────────────────────────────────────────────────
  const lureId = new Map<string, number>();
  for (const l of LURES) {
    const values = { slug: l.slug, brand: l.brand, model: l.model, type: l.type, sizes: l.sizes ?? [], weights: l.weights ?? [], colors: l.colors ?? [], howToFish: l.howTo };
    const [r] = await db.insert(s.lures).values(values).onConflictDoUpdate({ target: s.lures.slug, set: values }).returning({ id: s.lures.id });
    lureId.set(l.slug, r.id);
  }
  await db.delete(s.lureAliases);
  const lureAliasRows = new Map<string, number>();
  for (const l of LURES) for (const a of [...l.aliases, `${l.brand} ${l.model}`.toLowerCase(), l.model.toLowerCase()]) lureAliasRows.set(a.toLowerCase(), lureId.get(l.slug)!);
  await db.insert(s.lureAliases).values([...lureAliasRows].map(([alias, id]) => ({ alias, lureId: id })));

  const baitId = new Map<string, number>();
  for (const b of BAITS) {
    const values = { slug: b.slug, name: b.name, isLive: b.live, rigging: b.rigging };
    const [r] = await db.insert(s.baits).values(values).onConflictDoUpdate({ target: s.baits.slug, set: values }).returning({ id: s.baits.id });
    baitId.set(b.slug, r.id);
  }
  await db.delete(s.baitAliases);
  const baitAliasRows = new Map<string, number>();
  for (const b of BAITS) for (const a of [...b.aliases, b.name.toLowerCase()]) baitAliasRows.set(a.toLowerCase(), baitId.get(b.slug)!);
  await db.insert(s.baitAliases).values([...baitAliasRows].map(([alias, id]) => ({ alias, baitId: id })));

  await db.delete(s.speciesTackle);
  for (const sp of SPECIES) {
    const t = TACKLE[sp.group];
    await db.insert(s.speciesTackle).values({
      speciesId: speciesId.get(sp.slug)!, rod: t.rod, reel: t.reel, line: t.line, leader: t.leader, hooks: t.hooks, rigs: t.rigs,
      structure: t.structure, bestTide: t.bestTide, bestTime: t.bestTime, depth: t.depth, defaultLures: t.lures, defaultBaits: t.baits,
    });
  }

  // ── Spots ────────────────────────────────────────────────────────────────
  const spotId = new Map<string, number>();
  const stateBySpot = new Map<string, string>();
  for (const sp of SPOTS) {
    const st = STATES.find((x) => x.code === sp.state)!;
    const regs = sp.water === "fresh" ? st.regsUrl : st.saltRegsUrl ?? st.regsUrl;
    const stn = stations[sp.slug] ?? {};
    const values = {
      slug: sp.slug, name: sp.name, regionId: regionId.get(sp.state)!, waterType: sp.water, spotType: sp.type,
      location: { x: sp.lon, y: sp.lat }, description: sp.desc, zone: sp.zone, accessModes: sp.access ?? ["shore", "boat"],
      aliases: sp.aliases ?? [], regulationsUrl: regs, safeWaveFt: sp.safeWaveFt ?? null,
      nearestTideStationId: stn.tide ?? null, waterTempStationId: stn.wtemp ?? null, nearestBuoyId: stn.buoy ?? null, usgsSiteId: stn.usgs ?? null,
      access: { boatRamps: (sp.ramps ?? []).map((name) => ({ name })), tackleShops: (sp.shops ?? []).map((name) => ({ name })) },
      isDemo: false,
    };
    const [r] = await db.insert(s.spots).values(values).onConflictDoUpdate({ target: s.spots.slug, set: values }).returning({ id: s.spots.id });
    spotId.set(sp.slug, r.id);
    stateBySpot.set(sp.slug, sp.state);
  }
  await db.delete(s.spotSpecies);
  for (const sp of SPOTS) {
    const uniq = [...new Set(sp.species)];
    for (const slug of uniq) {
      const sid = speciesId.get(slug);
      if (!sid) throw new Error(`Unknown species ${slug} at ${sp.slug}`);
      await db.insert(s.spotSpecies).values({ spotId: spotId.get(sp.slug)!, speciesId: sid });
    }
  }

  // ── Runs ─────────────────────────────────────────────────────────────────
  for (const r of RUNS) {
    const values = {
      slug: r.slug, speciesId: speciesId.get(r.species)!, name: r.name, waterType: r.water, direction: r.direction, description: r.desc,
      seasonWindows: r.windows.map((w) => ({ regionSlug: w.region.toLowerCase(), startDoy: w.startDoy, peakDoy: w.peakDoy, endDoy: w.endDoy })),
    };
    await db.insert(s.runs).values(values).onConflictDoUpdate({ target: s.runs.slug, set: values });
  }

  // ── Regulations (links only — numbers must be verified by a human) ───────
  for (const sp of SPOTS) {
    const st = STATES.find((x) => x.code === sp.state)!;
    const water = sp.water === "fresh" ? "fresh" : "salt";
    for (const slug of new Set(sp.species)) {
      await db.insert(s.regulations).values({
        stateCode: st.code, speciesId: speciesId.get(slug)!, waterType: water,
        officialUrl: water === "fresh" ? st.regsUrl : st.saltRegsUrl ?? st.regsUrl,
      }).onConflictDoNothing();
    }
  }

  // ── Sources ──────────────────────────────────────────────────────────────
  const SOURCES: (typeof s.sources.$inferInsert)[] = [
    { name: "NOAA CO-OPS (tides & water temp)", type: "government_api", url: "https://api.tidesandcurrents.noaa.gov", allowed: true, enabled: true, trustScore: 1, permissionNotes: "US government public data." },
    { name: "NOAA NDBC buoys", type: "government_api", url: "https://www.ndbc.noaa.gov", allowed: true, enabled: true, trustScore: 1, permissionNotes: "US government public data." },
    { name: "National Weather Service", type: "government_api", url: "https://api.weather.gov", allowed: true, enabled: true, trustScore: 1, permissionNotes: "Public API; requires User-Agent with contact." },
    { name: "Open-Meteo (weather & marine)", type: "government_api", url: "https://open-meteo.com", allowed: true, enabled: true, trustScore: 0.9, permissionNotes: "Free for non-commercial use; commercial use needs a subscription." },
    { name: "USGS Water Services", type: "government_api", url: "https://waterservices.usgs.gov", allowed: true, enabled: true, trustScore: 1, permissionNotes: "US government public data." },
    { name: "FishRadar Partner Portal", type: "partner", url: null, allowed: true, enabled: true, trustScore: 0.8, permissionNotes: "Reports submitted directly by partner shops/captains under the partner agreement." },
    { name: "Community catches", type: "user", url: null, allowed: true, enabled: true, trustScore: 0.5, permissionNotes: "User content licensed under the Terms of Service." },
    { name: "Reddit r/surfcasting", type: "reddit", url: "https://www.reddit.com/r/surfcasting/new.json", allowed: false, enabled: false, trustScore: 0.4, schedule: "0 * * * *", permissionNotes: "Needs Reddit API credentials and terms review before enabling." },
    { name: "YouTube fishing videos", type: "youtube", url: "https://www.googleapis.com/youtube/v3/search", allowed: false, enabled: false, trustScore: 0.5, schedule: "0 */6 * * *", permissionNotes: "Needs YOUTUBE_API_KEY. Embeds via official player only." },
    { name: "FishRadar Demo Reports", type: "partner", url: null, allowed: true, enabled: true, trustScore: 0.5, permissionNotes: "Synthetic demo data generated by the seed script. Always labeled Demo in the UI." },
  ];
  const sourceId = new Map<string, number>();
  for (const src of SOURCES) {
    const [existing] = await db.select({ id: s.sources.id }).from(s.sources).where(eq(s.sources.name, src.name)).limit(1);
    if (existing) {
      sourceId.set(src.name, existing.id);
    } else {
      const [r] = await db.insert(s.sources).values(src).returning({ id: s.sources.id });
      sourceId.set(src.name, r.id);
    }
  }

  // ── Demo reports ─────────────────────────────────────────────────────────
  const demoSource = sourceId.get("FishRadar Demo Reports")!;
  await db.delete(s.reports).where(and(eq(s.reports.isDemo, true), eq(s.reports.sourceId, demoSource)));
  const demo = generateDemoReports({ now: new Date(), days: 50, seed: 42 });
  let inserted = 0;
  for (const rep of demo) {
    const sid = spotId.get(rep.spot)!;
    const [row] = await db.insert(s.reports).values({
      sourceId: demoSource, kind: "verified", title: rep.title, publishedAt: rep.date, summary: rep.summary,
      rawHash: `demo:${rep.key}`, licenseType: "demo", confidence: 0.6, isVerified: true, reviewStatus: "approved", isDemo: true,
      extraction: { demo: true, conditions: rep.conditions },
    }).onConflictDoNothing().returning({ id: s.reports.id });
    if (!row) continue;
    inserted++;
    const mentions: (typeof s.reportMentions.$inferInsert)[] = [];
    for (const sp of rep.species) {
      mentions.push({ reportId: row.id, spotId: sid, speciesId: speciesId.get(sp.slug)!, publishedAt: rep.date, abundance: sp.abundance, sizeNotes: sp.size });
    }
    for (const l of rep.lures) mentions.push({ reportId: row.id, spotId: sid, speciesId: speciesId.get(rep.species[0].slug)!, lureId: lureId.get(l)!, publishedAt: rep.date });
    for (const b of rep.baits) mentions.push({ reportId: row.id, spotId: sid, speciesId: speciesId.get(rep.species[0].slug)!, baitId: baitId.get(b)!, publishedAt: rep.date });
    await db.insert(s.reportMentions).values(mentions);
  }

  // Demo angler + a few demo catches
  const [demoUser] = await db.insert(s.users).values({ email: "demo-angler@fishradar.local", name: "Demo Angler", handle: "demo-angler", bio: "Sample account used for demo catches." })
    .onConflictDoUpdate({ target: s.users.email, set: { name: "Demo Angler" } }).returning({ id: s.users.id });
  await db.delete(s.catches).where(eq(s.catches.isDemo, true));
  const demoCatches = demo.filter((_, i) => i % 9 === 0).slice(0, 40);
  for (const rep of demoCatches) {
    const sp = SPOTS.find((x) => x.slug === rep.spot)!;
    const species0 = rep.species[0].slug;
    const fz = fuzzPoint(sp.lat, sp.lon);
    await db.insert(s.catches).values({
      userId: demoUser.id, speciesId: speciesId.get(species0)!, lureId: rep.lures[0] ? lureId.get(rep.lures[0]) : null,
      baitId: !rep.lures[0] && rep.baits[0] ? baitId.get(rep.baits[0]) : null,
      caughtAt: rep.date, preciseLocation: { x: sp.lon, y: sp.lat }, publicLocation: { x: fz.lon, y: fz.lat },
      privacy: "fuzzed", nearestSpotId: spotId.get(rep.spot)!, notes: rep.catchNote, released: true, isDemo: true,
      lengthIn: rep.catchLength,
    });
  }

  const counts = await db.execute<{ t: string; n: number }>(sql`
    select 'spots' t, count(*)::int n from spots union all select 'species', count(*)::int from species
    union all select 'lures', count(*)::int from lures union all select 'runs', count(*)::int from runs
    union all select 'reports(demo)', count(*)::int from reports where is_demo
    union all select 'spots w/ tide station', count(*)::int from spots where nearest_tide_station_id is not null
    union all select 'spots w/ buoy', count(*)::int from spots where nearest_buoy_id is not null
    union all select 'spots w/ USGS gauge', count(*)::int from spots where usgs_site_id is not null`);
  console.table(counts);
  console.log(`Inserted ${inserted} demo reports.`);
}

main()
  .then(() => client.end())
  .catch(async (e) => {
    console.error(e);
    await client.end();
    process.exit(1);
  });
