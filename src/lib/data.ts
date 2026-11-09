/**
 * Server-side data access. All user-facing queries live here so pages stay thin.
 * Precise catch coordinates are NEVER selected by functions that feed public pages.
 */
import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { dayOfYear, haversineMi } from "@/lib/geo";
import { quickScore, reportsSignal, runStatus, seasonalAt, type RunStatus, type SpeciesProfile } from "@/lib/scoring";

export type SpotRow = {
  id: number; slug: string; name: string; waterType: "salt" | "fresh" | "brackish"; spotType: string; lat: number; lon: number;
  description: string | null; zone: string; stateCode: string | null; stateName: string | null; regulationsUrl: string | null;
  nearestTideStationId: string | null; waterTempStationId: string | null; nearestBuoyId: string | null; usgsSiteId: string | null;
  safeWaveFt: number | null; accessModes: string[]; access: { boatRamps?: { name: string }[]; tackleShops?: { name: string }[]; charters?: { name: string }[] };
  isDemo: boolean; aliases: string[];
};

const SPOT_COLS = sql`s.id, s.slug, s.name, s.water_type as "waterType", s.spot_type as "spotType", ST_Y(s.location) as lat, ST_X(s.location) as lon,
  s.description, s.zone, r.state_code as "stateCode", r.name as "stateName", s.regulations_url as "regulationsUrl",
  s.nearest_tide_station_id as "nearestTideStationId", s.water_temp_station_id as "waterTempStationId", s.nearest_buoy_id as "nearestBuoyId",
  s.usgs_site_id as "usgsSiteId", s.safe_wave_ft as "safeWaveFt", s.access_modes as "accessModes", s.access, s.is_demo as "isDemo", s.aliases`;

export async function getSpot(slug: string): Promise<SpotRow | null> {
  const rows = await db.execute<SpotRow>(sql`select ${SPOT_COLS} from spots s left join regions r on r.id = s.region_id where s.slug = ${slug} limit 1`);
  return rows[0] ?? null;
}

export async function listSpots(filter?: { water?: "salt" | "fresh"; state?: string }): Promise<SpotRow[]> {
  const w = filter?.water === "fresh" ? sql`s.water_type = 'fresh'` : filter?.water === "salt" ? sql`s.water_type <> 'fresh'` : sql`true`;
  const st = filter?.state ? sql`r.state_code = ${filter.state.toUpperCase()}` : sql`true`;
  return db.execute<SpotRow>(sql`select ${SPOT_COLS} from spots s left join regions r on r.id = s.region_id where ${w} and ${st} order by s.name`);
}

// ── Species at a spot ──────────────────────────────────────────────────────

export type SpeciesAtSpot = {
  speciesId: number; slug: string; commonName: string; scientificName: string | null; nicknames: string[];
  monthly: number[]; seasonalNow: number; signal: number; status: RunStatus; reportsThisWeek: number; reports14: number;
  lastReportAt: string | null; lastReportDemo: boolean; profile: SpeciesProfile & { group?: string };
};

type SeasonRow = { speciesId: number; slug: string; commonName: string; scientificName: string | null; nicknames: string[]; monthly: number[] | null;
  tempMinF: number | null; tempOptF: number | null; tempMaxF: number | null; scoringProfile: Record<string, unknown> };

export async function getSpeciesAtSpot(spot: Pick<SpotRow, "id" | "zone">, now = new Date()): Promise<SpeciesAtSpot[]> {
  const rows = await db.execute<SeasonRow>(sql`
    select sp.id as "speciesId", sp.slug, sp.common_name as "commonName", sp.scientific_name as "scientificName", sp.nicknames,
      ss.monthly, sp.temp_min_f as "tempMinF", sp.temp_opt_f as "tempOptF", sp.temp_max_f as "tempMaxF", sp.scoring_profile as "scoringProfile"
    from spot_species x join species sp on sp.id = x.species_id
    left join regions z on z.slug = 'zone-' || ${spot.zone}
    left join species_seasons ss on ss.species_id = sp.id and ss.region_id = z.id
    where x.spot_id = ${spot.id}`);
  const mentions = await db.execute<{ speciesId: number; publishedAt: string; abundance: string | null; isDemo: boolean }>(sql`
    select distinct on (m.report_id, m.species_id) m.species_id as "speciesId", m.published_at as "publishedAt", m.abundance, r.is_demo as "isDemo"
    from report_mentions m join reports r on r.id = m.report_id
    where m.spot_id = ${spot.id} and m.species_id is not null and m.lure_id is null and m.bait_id is null
      and m.published_at > now() - interval '30 days' and r.review_status = 'approved'`);
  return rows.map((r) => {
    const monthly = r.monthly ?? new Array(12).fill(0.3);
    const mine = mentions.filter((m) => m.speciesId === r.speciesId);
    const ages = mine.map((m) => ({ ageDays: (now.getTime() - new Date(m.publishedAt).getTime()) / 86_400_000, abundance: m.abundance }));
    const signal = reportsSignal(ages);
    const seasonalNow = seasonalAt(monthly, now);
    const next = seasonalAt(monthly, new Date(now.getTime() + 30 * 86_400_000));
    const last = mine.sort((a, b) => +new Date(b.publishedAt) - +new Date(a.publishedAt))[0];
    return {
      speciesId: r.speciesId, slug: r.slug, commonName: r.commonName, scientificName: r.scientificName, nicknames: r.nicknames,
      monthly, seasonalNow, signal, status: runStatus(signal, seasonalNow, next),
      reportsThisWeek: ages.filter((a) => a.ageDays <= 7).length, reports14: ages.filter((a) => a.ageDays <= 14).length,
      lastReportAt: last ? new Date(last.publishedAt).toISOString() : null, lastReportDemo: last?.isDemo ?? false,
      profile: { tempMinF: r.tempMinF, tempOptF: r.tempOptF, tempMaxF: r.tempMaxF, ...(r.scoringProfile as SpeciesProfile) },
    };
  }).sort((a, b) => b.signal - a.signal || b.seasonalNow - a.seasonalNow);
}

// ── Globe markers ──────────────────────────────────────────────────────────

export type SpotMarker = {
  slug: string; name: string; water: "salt" | "fresh" | "brackish"; lat: number; lon: number; score: number; activeRun: boolean;
  top: string[]; lastReportAt: string | null; state: string | null;
};

export async function getSpotMarkers(now = new Date()): Promise<SpotMarker[]> {
  const spots = await db.execute<{ id: number; slug: string; name: string; water: SpotMarker["water"]; lat: number; lon: number; zone: string; state: string | null }>(sql`
    select s.id, s.slug, s.name, s.water_type as water, ST_Y(s.location) as lat, ST_X(s.location) as lon, s.zone, r.state_code as state
    from spots s left join regions r on r.id = s.region_id`);
  const seasons = await db.execute<{ spotId: number; speciesId: number; name: string; monthly: number[] | null }>(sql`
    select x.spot_id as "spotId", x.species_id as "speciesId", sp.common_name as name, ss.monthly
    from spot_species x join spots s on s.id = x.spot_id join species sp on sp.id = x.species_id
    left join regions z on z.slug = 'zone-' || s.zone left join species_seasons ss on ss.species_id = sp.id and ss.region_id = z.id`);
  const mentions = await db.execute<{ spotId: number; speciesId: number; publishedAt: string; abundance: string | null }>(sql`
    select distinct on (m.report_id, m.species_id) m.spot_id as "spotId", m.species_id as "speciesId", m.published_at as "publishedAt", m.abundance
    from report_mentions m join reports r on r.id = m.report_id
    where m.spot_id is not null and m.species_id is not null and m.lure_id is null and m.bait_id is null
      and m.published_at > now() - interval '14 days' and r.review_status = 'approved'`);
  const byKey = new Map<string, { ageDays: number; abundance: string | null }[]>();
  const lastBySpot = new Map<number, number>();
  for (const m of mentions) {
    const k = `${m.spotId}:${m.speciesId}`;
    const t = new Date(m.publishedAt).getTime();
    (byKey.get(k) ?? byKey.set(k, []).get(k)!).push({ ageDays: (now.getTime() - t) / 86_400_000, abundance: m.abundance });
    lastBySpot.set(m.spotId, Math.max(lastBySpot.get(m.spotId) ?? 0, t));
  }
  return spots.map((s) => {
    const sp = seasons.filter((x) => x.spotId === s.id).map((x) => {
      const signal = reportsSignal(byKey.get(`${s.id}:${x.speciesId}`) ?? []);
      const seas = x.monthly ? seasonalAt(x.monthly, now) : 0.2;
      return { name: x.name, signal, score: quickScore(signal, seas) };
    }).sort((a, b) => b.score - a.score);
    const last = lastBySpot.get(s.id);
    return {
      slug: s.slug, name: s.name, water: s.water, lat: s.lat, lon: s.lon, state: s.state,
      score: sp[0]?.score ?? 0, activeRun: sp.some((x) => x.signal > 0.4),
      top: sp.filter((x) => x.signal > 0.12).slice(0, 3).map((x) => x.name), lastReportAt: last ? new Date(last).toISOString() : null,
    };
  });
}

export async function nearestSpots(lat: number, lon: number, limit = 8, water?: "salt" | "fresh") {
  const w = water === "fresh" ? sql`s.water_type = 'fresh'` : water === "salt" ? sql`s.water_type <> 'fresh'` : sql`true`;
  return db.execute<{ slug: string; name: string; water: string; miles: number; state: string | null }>(sql`
    select s.slug, s.name, s.water_type as water, r.state_code as state,
      round((ST_Distance(s.location::geography, ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography) / 1609.344)::numeric, 1)::float as miles
    from spots s left join regions r on r.id = s.region_id where ${w}
    order by s.location <-> ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326) limit ${limit}`);
}

// ── Reports ────────────────────────────────────────────────────────────────

export type ReportItem = {
  id: number; title: string | null; summary: string; publishedAt: string; url: string | null; kind: string; isDemo: boolean; isVerified: boolean;
  sourceName: string; sourceType: string; spotSlug: string | null; spotName: string | null; species: { slug: string; name: string; abundance: string | null; size: string | null }[];
  lures: { slug: string; name: string }[]; baits: { slug: string; name: string }[]; conditions: Record<string, string> | null; distanceMi?: number;
};

export async function getReports(opts: { ids?: number[]; spotId?: number; speciesId?: number; nearSpotId?: number; radiusMi?: number; speciesSlugs?: string[]; stateCodes?: string[]; days?: number; limit?: number; includePending?: boolean }): Promise<ReportItem[]> {
  const days = opts.days ?? 30;
  const conds = [sql`r.published_at > now() - make_interval(days => ${days})`];
  if (!opts.includePending) conds.push(sql`r.review_status = 'approved'`);
  if (opts.ids) conds.push(opts.ids.length ? sql`r.id in ${opts.ids}` : sql`false`);
  if (opts.spotId) conds.push(sql`exists (select 1 from report_mentions m where m.report_id = r.id and m.spot_id = ${opts.spotId})`);
  if (opts.nearSpotId) {
    const radiusM = (opts.radiusMi ?? 25) * 1609.344;
    conds.push(sql`exists (select 1 from report_mentions m join spots s2 on s2.id = m.spot_id, spots c where c.id = ${opts.nearSpotId} and m.report_id = r.id and ST_DWithin(s2.location::geography, c.location::geography, ${radiusM}))`);
  }
  if (opts.speciesId) conds.push(sql`exists (select 1 from report_mentions m where m.report_id = r.id and m.species_id = ${opts.speciesId})`);
  if (opts.speciesSlugs?.length) conds.push(sql`exists (select 1 from report_mentions m join species x on x.id = m.species_id where m.report_id = r.id and x.slug in ${opts.speciesSlugs})`);
  if (opts.stateCodes?.length) conds.push(sql`exists (select 1 from report_mentions m join spots s3 on s3.id = m.spot_id join regions g on g.id = s3.region_id where m.report_id = r.id and g.state_code in ${opts.stateCodes})`);
  const where = sql.join(conds, sql` and `);
  const rows = await db.execute<Omit<ReportItem, "species" | "lures" | "baits"> & { conditions: Record<string, string> | null }>(sql`
    select r.id, r.title, r.summary, r.published_at as "publishedAt", r.url, r.kind, r.is_demo as "isDemo", r.is_verified as "isVerified",
      src.name as "sourceName", src.type as "sourceType", r.extraction -> 'conditions' as conditions,
      (select s.slug from report_mentions m join spots s on s.id = m.spot_id where m.report_id = r.id limit 1) as "spotSlug",
      (select s.name from report_mentions m join spots s on s.id = m.spot_id where m.report_id = r.id limit 1) as "spotName"
    from reports r join sources src on src.id = r.source_id
    where ${where} order by r.published_at desc limit ${opts.limit ?? 20}`);
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const ms = await db.execute<{ reportId: number; sSlug: string | null; sName: string | null; abundance: string | null; sizeNotes: string | null; lSlug: string | null; lName: string | null; bSlug: string | null; bName: string | null }>(sql`
    select m.report_id as "reportId", sp.slug as "sSlug", sp.common_name as "sName", m.abundance, m.size_notes as "sizeNotes",
      l.slug as "lSlug", l.brand || ' ' || l.model as "lName", b.slug as "bSlug", b.name as "bName"
    from report_mentions m left join species sp on sp.id = m.species_id left join lures l on l.id = m.lure_id left join baits b on b.id = m.bait_id
    where m.report_id in ${ids}`);
  return rows.map((r) => {
    const mine = ms.filter((m) => m.reportId === r.id);
    const uniq = <T extends { slug: string }>(a: T[]) => [...new Map(a.map((x) => [x.slug, x])).values()];
    return {
      ...r, publishedAt: new Date(r.publishedAt).toISOString(),
      species: uniq(mine.filter((m) => m.sSlug && !m.lSlug && !m.bSlug).map((m) => ({ slug: m.sSlug!, name: m.sName!, abundance: m.abundance, size: m.sizeNotes }))),
      lures: uniq(mine.filter((m) => m.lSlug).map((m) => ({ slug: m.lSlug!, name: m.lName! }))),
      baits: uniq(mine.filter((m) => m.bSlug).map((m) => ({ slug: m.bSlug!, name: m.bName! }))),
    };
  });
}

// ── Lures & baits ranking ──────────────────────────────────────────────────

export type LureRank = { id: number; slug: string; brand: string; model: string; type: string; howToFish: string | null; colors: string[]; sizes: string[];
  mentions7: number; mentions14: number; prev14: number; score: number; species: string[]; regions: string[]; demoOnly: boolean };

export async function getTopLures(opts: { speciesId?: number; spotId?: number; water?: "salt" | "fresh"; zone?: string; days?: number; limit?: number } = {}): Promise<LureRank[]> {
  const days = opts.days ?? 14;
  const c = [sql`m.lure_id is not null`, sql`r.review_status = 'approved'`, sql`m.published_at > now() - make_interval(days => ${days * 2})`];
  if (opts.speciesId) c.push(sql`m.species_id = ${opts.speciesId}`);
  if (opts.spotId) c.push(sql`m.spot_id = ${opts.spotId}`);
  if (opts.water === "fresh") c.push(sql`s.water_type = 'fresh'`);
  if (opts.water === "salt") c.push(sql`s.water_type <> 'fresh'`);
  if (opts.zone) c.push(sql`s.zone = ${opts.zone}`);
  const rows = await db.execute<LureRank & { recency: number }>(sql`
    select l.id, l.slug, l.brand, l.model, l.type, l.how_to_fish as "howToFish", l.colors, l.sizes,
      count(*) filter (where m.published_at > now() - interval '7 days')::int as "mentions7",
      count(*) filter (where m.published_at > now() - make_interval(days => ${days}))::int as "mentions14",
      count(*) filter (where m.published_at <= now() - make_interval(days => ${days}))::int as "prev14",
      sum(case when m.published_at > now() - make_interval(days => ${days}) then exp(-extract(epoch from now() - m.published_at) / 86400 / 5) else 0 end)::float as score,
      array_agg(distinct sp.common_name) filter (where m.published_at > now() - make_interval(days => ${days})) as species,
      array_agg(distinct g.state_code) filter (where m.published_at > now() - make_interval(days => ${days})) as regions,
      bool_and(r.is_demo) as "demoOnly"
    from report_mentions m join reports r on r.id = m.report_id join lures l on l.id = m.lure_id
    left join spots s on s.id = m.spot_id left join regions g on g.id = s.region_id left join species sp on sp.id = m.species_id
    where ${sql.join(c, sql` and `)}
    group by l.id having count(*) filter (where m.published_at > now() - make_interval(days => ${days})) > 0
    order by score desc limit ${opts.limit ?? 12}`);
  return rows.map((r) => ({ ...r, species: (r.species ?? []).filter(Boolean), regions: (r.regions ?? []).filter(Boolean) }));
}

export async function getTopBaits(opts: { speciesId?: number; spotId?: number; water?: "salt" | "fresh"; days?: number; limit?: number } = {}) {
  const days = opts.days ?? 14;
  const c = [sql`m.bait_id is not null`, sql`r.review_status = 'approved'`, sql`m.published_at > now() - make_interval(days => ${days})`];
  if (opts.speciesId) c.push(sql`m.species_id = ${opts.speciesId}`);
  if (opts.spotId) c.push(sql`m.spot_id = ${opts.spotId}`);
  if (opts.water === "fresh") c.push(sql`s.water_type = 'fresh'`);
  if (opts.water === "salt") c.push(sql`s.water_type <> 'fresh'`);
  return db.execute<{ slug: string; name: string; rigging: string | null; isLive: boolean; mentions: number; species: string[]; demoOnly: boolean }>(sql`
    select b.slug, b.name, b.rigging, b.is_live as "isLive", count(*)::int as mentions, array_agg(distinct sp.common_name) as species, bool_and(r.is_demo) as "demoOnly"
    from report_mentions m join reports r on r.id = m.report_id join baits b on b.id = m.bait_id
    left join spots s on s.id = m.spot_id left join species sp on sp.id = m.species_id
    where ${sql.join(c, sql` and `)} group by b.id order by mentions desc limit ${opts.limit ?? 8}`);
}

export async function getLure(slug: string) {
  const rows = await db.execute<{ id: number; slug: string; brand: string; model: string; type: string; howToFish: string | null; colors: string[]; sizes: string[]; weights: string[]; buyLinks: { retailer: string; url: string; priceUsd?: number; isAffiliate: boolean }[] }>(sql`
    select id, slug, brand, model, type, how_to_fish as "howToFish", colors, sizes, weights, buy_links as "buyLinks" from lures where slug = ${slug}`);
  return rows[0] ?? null;
}

export async function getBaitsBySlugs(slugs: string[]) {
  if (!slugs.length) return [];
  return db.execute<{ slug: string; name: string; rigging: string | null; isLive: boolean }>(sql`select slug, name, rigging, is_live as "isLive" from baits where slug in ${slugs}`);
}

export async function getLuresBySlugs(slugs: string[]) {
  if (!slugs.length) return [];
  return db.execute<{ slug: string; brand: string; model: string; type: string; howToFish: string | null; colors: string[]; sizes: string[] }>(sql`
    select slug, brand, model, type, how_to_fish as "howToFish", colors, sizes from lures where slug in ${slugs}`);
}

// ── Species ────────────────────────────────────────────────────────────────

export async function getSpecies(slug: string) {
  const rows = await db.execute<{ id: number; slug: string; commonName: string; scientificName: string | null; nicknames: string[]; waterTypes: string[]; description: string | null; tempMinF: number | null; tempOptF: number | null; tempMaxF: number | null; scoringProfile: Record<string, unknown> }>(sql`
    select id, slug, common_name as "commonName", scientific_name as "scientificName", nicknames, water_types as "waterTypes", description,
      temp_min_f as "tempMinF", temp_opt_f as "tempOptF", temp_max_f as "tempMaxF", scoring_profile as "scoringProfile" from species where slug = ${slug}`);
  return rows[0] ?? null;
}

export async function getTackle(speciesId: number) {
  const rows = await db.execute<{ rod: string; reel: string; line: string; leader: string; hooks: string; rigs: { name: string; description: string }[]; structure: string; bestTide: string; bestTime: string; depth: string; defaultLures: string[]; defaultBaits: string[] }>(sql`
    select rod, reel, line, leader, hooks, rigs, structure, best_tide as "bestTide", best_time as "bestTime", depth, default_lures as "defaultLures", default_baits as "defaultBaits"
    from species_tackle where species_id = ${speciesId}`);
  return rows[0] ?? null;
}

export async function getRegulation(stateCode: string | null, speciesId: number, water: "salt" | "fresh") {
  if (!stateCode) return null;
  const rows = await db.execute<{ sizeLimit: string | null; bagLimit: string | null; season: string | null; specialRules: string | null; officialUrl: string; lastVerifiedAt: string | null }>(sql`
    select size_limit as "sizeLimit", bag_limit as "bagLimit", season, special_rules as "specialRules", official_url as "officialUrl", last_verified_at as "lastVerifiedAt"
    from regulations where state_code = ${stateCode} and species_id = ${speciesId} and water_type = ${water} limit 1`);
  return rows[0] ?? null;
}

export async function getSpeciesSpots(speciesId: number) {
  return db.execute<{ slug: string; name: string; state: string | null; water: string }>(sql`
    select s.slug, s.name, r.state_code as state, s.water_type as water from spot_species x join spots s on s.id = x.spot_id left join regions r on r.id = s.region_id
    where x.species_id = ${speciesId} order by r.state_code, s.name`);
}

export async function getSpeciesSeasons(speciesId: number) {
  return db.execute<{ zone: string; name: string; monthly: number[] }>(sql`
    select replace(z.slug, 'zone-', '') as zone, z.name, ss.monthly from species_seasons ss join regions z on z.id = ss.region_id where ss.species_id = ${speciesId}`);
}

/** Daily report counts for a species at a spot (or overall) over N days — for timelines. */
export async function getReportTimeline(speciesId: number, spotId?: number, days = 60) {
  const spot = spotId ? sql`and m.spot_id = ${spotId}` : sql``;
  return db.execute<{ day: string; n: number }>(sql`
    select to_char(d, 'YYYY-MM-DD') as day, coalesce(c.n, 0)::int as n
    from generate_series((now() - make_interval(days => ${days - 1}))::date, now()::date, interval '1 day') d
    left join (
      select date_trunc('day', m.published_at)::date as day, count(distinct m.report_id) as n from report_mentions m join reports r on r.id = m.report_id
      where m.species_id = ${speciesId} and m.lure_id is null and m.bait_id is null and r.review_status = 'approved' ${spot} group by 1
    ) c on c.day = d::date order by d`);
}

// ── Runs ───────────────────────────────────────────────────────────────────

export type RunRow = { id: number; slug: string; name: string; waterType: string; direction: string | null; description: string | null; speciesId: number; speciesSlug: string; speciesName: string;
  seasonWindows: { regionSlug: string; startDoy: number; peakDoy: number; endDoy: number }[] };

export async function listRuns(water?: "salt" | "fresh"): Promise<RunRow[]> {
  const w = water ? sql`where r.water_type = ${water}` : sql``;
  return db.execute<RunRow>(sql`
    select r.id, r.slug, r.name, r.water_type as "waterType", r.direction, r.description, r.season_windows as "seasonWindows",
      sp.id as "speciesId", sp.slug as "speciesSlug", sp.common_name as "speciesName"
    from runs r join species sp on sp.id = r.species_id ${w} order by r.name`);
}

export async function getRun(slug: string) {
  return (await db.execute<RunRow>(sql`
    select r.id, r.slug, r.name, r.water_type as "waterType", r.direction, r.description, r.season_windows as "seasonWindows",
      sp.id as "speciesId", sp.slug as "speciesSlug", sp.common_name as "speciesName"
    from runs r join species sp on sp.id = r.species_id where r.slug = ${slug}`))[0] ?? null;
}

const inWin = (doy: number, w: { startDoy: number; endDoy: number }) =>
  (doy >= w.startDoy && doy <= w.endDoy) || (doy + 365 >= w.startDoy && doy + 365 <= w.endDoy);
const unwrap = (doy: number, w: { startDoy: number; endDoy: number }) => (doy + 365 >= w.startDoy && doy + 365 <= w.endDoy && !(doy >= w.startDoy && doy <= w.endDoy) ? doy + 365 : doy);

export type RunTracker = {
  run: RunRow;
  points: { spotSlug: string; spotName: string; state: string | null; lat: number; lon: number; publishedAt: string; ageDays: number; abundance: string | null; isDemo: boolean; reportId: number }[];
  byState: { state: string; reports: number; last: string | null; typicalPeakDoy: number; status: "ahead" | "behind" | "on_time" | "not_started" | "done"; inWindowNow: boolean; offsetDays: number | null }[];
  leadingEdge: { state: string; date: string } | null;
  prediction: { text: string; confidence: "low" | "medium" | "high"; nextStates: string[]; reasoning: string[] };
};

export async function getRunTracker(run: RunRow, now = new Date(), days = 30): Promise<RunTracker> {
  const states = run.seasonWindows.map((w) => w.regionSlug.toUpperCase());
  const pts = await db.execute<RunTracker["points"][number]>(sql`
    select distinct on (m.report_id) s.slug as "spotSlug", s.name as "spotName", g.state_code as state, ST_Y(s.location) as lat, ST_X(s.location) as lon,
      m.published_at as "publishedAt", m.abundance, r.is_demo as "isDemo", r.id as "reportId", 0::float as "ageDays"
    from report_mentions m join reports r on r.id = m.report_id join spots s on s.id = m.spot_id join regions g on g.id = s.region_id
    where m.species_id = ${run.speciesId} and m.lure_id is null and m.bait_id is null and r.review_status = 'approved'
      and m.published_at > now() - make_interval(days => ${days}) and g.state_code in ${states}
      ${run.waterType === "fresh" ? sql`and s.water_type <> 'salt'` : sql`and s.water_type <> 'fresh'`}
    order by m.report_id`);
  const points = pts.map((p) => ({ ...p, publishedAt: new Date(p.publishedAt).toISOString(), ageDays: Math.round(((now.getTime() - new Date(p.publishedAt).getTime()) / 86_400_000) * 10) / 10 }))
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  const today = dayOfYear(now);

  const byState = run.seasonWindows.map((w) => {
    const st = w.regionSlug.toUpperCase();
    const mine = points.filter((p) => p.state === st);
    const recent = mine.filter((p) => p.ageDays <= 10);
    const last = mine[0]?.publishedAt ?? null;
    const t = unwrap(today, w);
    let status: RunTracker["byState"][number]["status"] = "not_started";
    let offsetDays: number | null = null;
    if (mine.length) {
      // weighted center of recent activity vs the typical peak
      const centerDoy = mine.reduce((a, p) => a + unwrap(dayOfYear(new Date(p.publishedAt)), w), 0) / mine.length;
      // Expected center of activity over the same lookback, from the typical (triangular) window shape.
      let wsum = 0;
      let dsum = 0;
      for (let d = t - days; d <= t; d++) {
        const inten = d < w.startDoy || d > w.endDoy ? 0 : d <= w.peakDoy ? (d - w.startDoy) / Math.max(1, w.peakDoy - w.startDoy) : (w.endDoy - d) / Math.max(1, w.endDoy - w.peakDoy);
        wsum += inten;
        dsum += inten * d;
      }
      offsetDays = wsum > 0 ? Math.round(centerDoy - dsum / wsum) : null;
      status = recent.length === 0 && t > w.peakDoy ? "done" : offsetDays == null ? "behind" : Math.abs(offsetDays) <= 3 ? "on_time" : offsetDays > 0 ? "behind" : "ahead";
    } else if (t > w.endDoy) status = "done";
    return { state: st, reports: mine.length, last, typicalPeakDoy: w.peakDoy, status, inWindowNow: inWin(today, w), offsetDays };
  });

  // Leading edge = furthest state along the route with at least 2 reports in the last 7 days,
  // counting only states in (or within 10 days of) their season window so a stray report doesn't count.
  let leadingEdge: RunTracker["leadingEdge"] = null;
  let leadIdx = -1;
  for (let i = run.seasonWindows.length - 1; i >= 0; i--) {
    const w = run.seasonWindows[i];
    const st = w.regionSlug.toUpperCase();
    const near = inWin(today, w) || inWin(today + 10, w);
    const recent = points.filter((x) => x.state === st && x.ageDays <= 7);
    if (near && recent.length >= 2) { leadingEdge = { state: st, date: recent[0].publishedAt }; leadIdx = i; break; }
  }

  // Prediction (rule-based, labeled as a prediction): states further along the route whose
  // window opens or peaks in the next 14 days.
  const ahead = run.seasonWindows.filter((_, i) => i > leadIdx);
  const upcoming = ahead.filter((w) => {
    const t = unwrap(today, w);
    return (w.startDoy > t && w.startDoy <= t + 14) || (inWin(today, w) && w.peakDoy >= t && w.peakDoy <= t + 14) || inWin(today + 7, w);
  }).map((w) => w.regionSlug.toUpperCase());
  const nextStates = upcoming.slice(0, 3);
  const reasoning: string[] = [];
  if (leadingEdge) reasoning.push(`Leading edge of recent activity: ${leadingEdge.state} (latest ${new Date(leadingEdge.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}).`);
  for (const s of byState.filter((b) => b.offsetDays != null && b.reports >= 3 && b.status !== "done")) reasoning.push(`${s.state}: activity is ${s.status === "on_time" ? "on schedule" : `${Math.abs(s.offsetDays!)} days ${s.status === "behind" ? "later" : "earlier"} than typical`}.`);
  if (upcoming.length) reasoning.push(`Historical windows further along the route open or peak in the next two weeks: ${upcoming.join(", ")}.`);
  const recentCount = points.filter((p) => p.ageDays <= 7).length;
  const confidence = recentCount >= 15 && nextStates.length ? "high" : recentCount >= 5 ? "medium" : "low";
  const text = nextStates.length
    ? `Expect the ${run.speciesName.toLowerCase()} action to push ${run.direction ?? "along the route"}${leadingEdge ? ` from ${leadingEdge.state}` : ""} into ${nextStates.join(" → ")} over the next 7–14 days.`
    : leadingEdge ? `The run is concentrated around ${leadingEdge.state}; no new areas along the route are expected to open in the next two weeks.` : `No strong signal — the run is outside its typical window or reports are too sparse to predict movement.`;
  return { run, points, byState, leadingEdge, prediction: { text, confidence, nextStates, reasoning } };
}

// ── Catches (public-safe) ──────────────────────────────────────────────────

export type PublicCatch = { id: string; caughtAt: string; lengthIn: number | null; weightLb: number | null; notes: string | null; released: boolean; isDemo: boolean; verification: string;
  speciesSlug: string | null; speciesName: string | null; lureSlug: string | null; lureName: string | null; baitName: string | null; spotSlug: string | null; spotName: string | null;
  userHandle: string | null; userName: string | null; photoUrl: string | null; likes: number; comments: number; lat: number | null; lon: number | null; privacy: string };

export async function getCatches(opts: { id?: string; spotId?: number; speciesId?: number; userId?: string; limit?: number; includeHidden?: boolean } = {}): Promise<PublicCatch[]> {
  const c = [opts.includeHidden ? sql`true` : sql`c.moderation = 'approved'`];
  if (opts.id) c.push(sql`c.id = ${opts.id}`);
  if (opts.spotId) c.push(sql`c.nearest_spot_id = ${opts.spotId}`);
  if (opts.speciesId) c.push(sql`c.species_id = ${opts.speciesId}`);
  if (opts.userId) c.push(sql`c.user_id = ${opts.userId}`);
  // NOTE: only public_location is ever selected here.
  return db.execute<PublicCatch>(sql`
    select c.id, c.caught_at as "caughtAt", c.length_in as "lengthIn", c.weight_lb as "weightLb", c.notes, c.released, c.is_demo as "isDemo", c.verification, c.privacy,
      sp.slug as "speciesSlug", sp.common_name as "speciesName", l.slug as "lureSlug", coalesce(l.brand || ' ' || l.model, c.lure_free_text) as "lureName", b.name as "baitName",
      s.slug as "spotSlug", s.name as "spotName", u.handle as "userHandle", u.name as "userName",
      (select m.url from media m where m.catch_id = c.id order by m.id limit 1) as "photoUrl",
      (select count(*)::int from likes k where k.catch_id = c.id) as likes, (select count(*)::int from comments k where k.catch_id = c.id and k.moderation = 'approved') as comments,
      case when c.privacy = 'region' then null else ST_Y(c.public_location) end as lat, case when c.privacy = 'region' then null else ST_X(c.public_location) end as lon
    from catches c join "user" u on u.id = c.user_id left join species sp on sp.id = c.species_id left join lures l on l.id = c.lure_id
    left join baits b on b.id = c.bait_id left join spots s on s.id = c.nearest_spot_id
    where ${sql.join(c, sql` and `)} order by c.caught_at desc limit ${opts.limit ?? 24}`);
}

// ── Search ─────────────────────────────────────────────────────────────────

export async function search(q: string) {
  const like = `%${q.trim().toLowerCase()}%`;
  const [spots, species, lures, runs, states] = await Promise.all([
    db.execute<{ slug: string; name: string; water: string; state: string | null }>(sql`
      select s.slug, s.name, s.water_type as water, r.state_code as state from spots s left join regions r on r.id = s.region_id
      where lower(s.name) like ${like} or exists (select 1 from unnest(s.aliases) a where a like ${like}) or lower(r.name) like ${like} or lower(r.state_code) = ${q.trim().toLowerCase()}
      order by s.name limit 20`),
    db.execute<{ slug: string; name: string; nicknames: string[] }>(sql`
      select slug, common_name as name, nicknames from species where lower(common_name) like ${like} or lower(coalesce(scientific_name,'')) like ${like}
      or exists (select 1 from unnest(nicknames) n where lower(n) like ${like}) order by common_name limit 10`),
    db.execute<{ slug: string; name: string }>(sql`
      select distinct l.slug, l.brand || ' ' || l.model as name from lures l left join lure_aliases a on a.lure_id = l.id
      where lower(l.brand || ' ' || l.model) like ${like} or a.alias like ${like} limit 10`),
    db.execute<{ slug: string; name: string }>(sql`select slug, name from runs where lower(name) like ${like} limit 10`),
    db.execute<{ code: string; name: string }>(sql`select state_code as code, name from regions where level = 'state' and (lower(name) like ${like} or lower(state_code) = ${q.trim().toLowerCase()}) limit 5`),
  ]);
  return { spots, species, lures, runs, states };
}

export function distanceMi(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  return Math.round(haversineMi(a.lat, a.lon, b.lat, b.lon) * 10) / 10;
}
