/**
 * FishRadar AI — database schema (Drizzle ORM, PostgreSQL + PostGIS + pgvector).
 *
 * Conventions
 * - Geometry is stored in WGS84 (SRID 4326). Points are `geometry(Point,4326)`.
 * - Every user-facing "fact" row carries provenance (source, dates) so the UI can
 *   always say where information came from.
 * - Seed / demo rows set `is_demo = true` and must be shown with a "Demo data" badge.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  customType,
  doublePrecision,
  geometry,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from "drizzle-orm/pg-core";

/** Generic PostGIS geometry for non-point shapes (polygons, lines). Stored/read as GeoJSON text via ST_* helpers. */
const anyGeometry = customType<{ data: string; driverData: string }>({
  dataType() {
    return "geometry(Geometry,4326)";
  },
});

const point = (name: string) => geometry(name, { type: "point", mode: "xy", srid: 4326 });

const createdAt = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).defaultNow().notNull();

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------
export const waterTypeEnum = pgEnum("water_type", ["salt", "fresh", "brackish"]);
export const spotTypeEnum = pgEnum("spot_type", [
  "inlet", "beach", "jetty", "flat", "offshore", "canyon", "bay", "harbor", "rip",
  "lake", "river", "reservoir", "pond", "stream", "pier", "bridge", "marsh", "reef",
]);
export const sourceTypeEnum = pgEnum("source_type", [
  "government_api", "rss", "partner", "reddit", "youtube", "web_allowlisted", "user",
]);
export const reportKindEnum = pgEnum("report_kind", ["verified", "user_submitted", "seasonal"]);
export const runStatusEnum = pgEnum("run_status", ["hot", "active", "starting", "tapering", "out_of_season"]);
export const lureTypeEnum = pgEnum("lure_type", [
  "topwater", "swimmer", "bucktail", "jig", "metal", "soft_plastic", "spoon", "spinner",
  "spinnerbait", "crankbait", "jerkbait", "fly", "teaser", "trolling", "umbrella_rig", "other",
]);
export const privacyEnum = pgEnum("location_privacy", ["precise", "fuzzed", "region"]);
export const verificationEnum = pgEnum("verification_level", [
  "unverified", "photo_verified", "community_confirmed", "trusted_angler",
]);
export const mediaTypeEnum = pgEnum("media_type", ["image", "video"]);
export const userRoleEnum = pgEnum("user_role", ["angler", "partner", "moderator", "admin"]);
export const reviewStatusEnum = pgEnum("review_status", ["pending", "approved", "rejected"]);
export const aiJobStatusEnum = pgEnum("ai_job_status", ["queued", "running", "succeeded", "failed", "needs_review"]);

// ---------------------------------------------------------------------------
// Auth.js tables (names match @auth/drizzle-adapter expectations)
// ---------------------------------------------------------------------------
export const users = pgTable("user", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("emailVerified", { mode: "date", withTimezone: true }),
  image: text("image"),
  role: userRoleEnum("role").default("angler").notNull(),
  handle: text("handle").unique(),
  bio: text("bio"),
  homePoint: point("home_point"),
  reputation: integer("reputation").default(0).notNull(),
  createdAt: createdAt(),
});

export const accounts = pgTable(
  "account",
  {
    userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

export const sessions = pgTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date", withTimezone: true }).notNull(),
});

export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date", withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

// ---------------------------------------------------------------------------
// Geography
// ---------------------------------------------------------------------------
export const regions = pgTable(
  "regions",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    parentId: integer("parent_id"),
    /** e.g. "country", "coast", "state", "area" */
    level: text("level").notNull(),
    stateCode: text("state_code"),
    area: anyGeometry("area"),
    isDemo: boolean("is_demo").default(false).notNull(),
  },
  (t) => [index("regions_area_gix").using("gist", t.area), index("regions_parent_idx").on(t.parentId)],
);

export const spots = pgTable(
  "spots",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    regionId: integer("region_id").references(() => regions.id),
    waterType: waterTypeEnum("water_type").notNull(),
    spotType: spotTypeEnum("spot_type").notNull(),
    location: point("location").notNull(),
    description: text("description"),
    /** Ramps, parking, piers, shore access notes, tackle shops, charters (structured JSON). */
    access: jsonb("access").$type<SpotAccess>().default({}).notNull(),
    nearestTideStationId: text("nearest_tide_station_id"),
    nearestCurrentStationId: text("nearest_current_station_id"),
    nearestBuoyId: text("nearest_buoy_id"),
    usgsSiteId: text("usgs_site_id"),
    nwsMarineZone: text("nws_marine_zone"),
    regulationsUrl: text("regulations_url"),
    /** Max wave height (ft) considered safe for small boats here; used for the safety cap. */
    safeWaveFt: real("safe_wave_ft"),
    isDemo: boolean("is_demo").default(false).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("spots_location_gix").using("gist", t.location),
    index("spots_region_idx").on(t.regionId),
    index("spots_water_type_idx").on(t.waterType),
  ],
);

export type SpotAccess = {
  boatRamps?: { name: string; lat?: number; lon?: number; notes?: string }[];
  shoreAccess?: string[];
  parking?: string;
  piers?: string[];
  tackleShops?: { name: string; url?: string; phone?: string }[];
  charters?: { name: string; url?: string }[];
};

// ---------------------------------------------------------------------------
// Species, seasons, runs
// ---------------------------------------------------------------------------
export const species = pgTable("species", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  commonName: text("common_name").notNull(),
  scientificName: text("scientific_name"),
  nicknames: text("nicknames").array().default(sql`'{}'::text[]`).notNull(),
  waterTypes: waterTypeEnum("water_types").array().notNull(),
  tempMinF: real("temp_min_f"),
  tempOptF: real("temp_opt_f"),
  tempMaxF: real("temp_max_f"),
  description: text("description"),
  imageId: integer("image_id"),
  /** Species-specific scoring overrides, e.g. { nightBonus: 1.3, preferredTide: "falling" } */
  scoringProfile: jsonb("scoring_profile").$type<Record<string, unknown>>().default({}).notNull(),
  isDemo: boolean("is_demo").default(false).notNull(),
});

export const speciesSeasons = pgTable(
  "species_seasons",
  {
    speciesId: integer("species_id").notNull().references(() => species.id, { onDelete: "cascade" }),
    regionId: integer("region_id").notNull().references(() => regions.id, { onDelete: "cascade" }),
    /** 12 values, Jan..Dec, each 0..1 likelihood. */
    monthly: real("monthly").array().notNull(),
    peakNotes: text("peak_notes"),
    isDemo: boolean("is_demo").default(false).notNull(),
  },
  (t) => [primaryKey({ columns: [t.speciesId, t.regionId] })],
);

export const runs = pgTable("runs", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  speciesId: integer("species_id").notNull().references(() => species.id),
  name: text("name").notNull(),
  waterType: waterTypeEnum("water_type").notNull(),
  /** e.g. "north", "south", "inshore", "upriver" */
  direction: text("direction"),
  description: text("description"),
  typicalRoute: anyGeometry("typical_route"),
  /** [{ regionSlug, startDoy, peakDoy, endDoy }] — day-of-year windows per region along the route. */
  seasonWindows: jsonb("season_windows").$type<RunSeasonWindow[]>().default([]).notNull(),
  isDemo: boolean("is_demo").default(false).notNull(),
});

export type RunSeasonWindow = { regionSlug: string; startDoy: number; peakDoy: number; endDoy: number };

// ---------------------------------------------------------------------------
// Sources & reports
// ---------------------------------------------------------------------------
export const sources = pgTable("sources", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: sourceTypeEnum("type").notNull(),
  url: text("url"),
  /** Has permission been confirmed (API terms, RSS, partner agreement, robots/terms review)? */
  allowed: boolean("allowed").default(false).notNull(),
  permissionNotes: text("permission_notes"),
  robotsCheckedAt: timestamp("robots_checked_at", { withTimezone: true }),
  trustScore: real("trust_score").default(0.5).notNull(),
  /** cron expression for the worker */
  schedule: text("schedule"),
  enabled: boolean("enabled").default(false).notNull(),
  partnerUserId: text("partner_user_id").references(() => users.id),
  logoUrl: text("logo_url"),
  lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
  lastErrorAt: timestamp("last_error_at", { withTimezone: true }),
  lastError: text("last_error"),
  createdAt: createdAt(),
});

export const reports = pgTable(
  "reports",
  {
    id: serial("id").primaryKey(),
    sourceId: integer("source_id").notNull().references(() => sources.id),
    kind: reportKindEnum("kind").default("verified").notNull(),
    url: text("url"),
    title: text("title"),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).defaultNow().notNull(),
    /** Our own-words summary — never the copied original article. */
    summary: text("summary").notNull(),
    rawHash: text("raw_hash").notNull(),
    licenseType: text("license_type"),
    extraction: jsonb("extraction").$type<Record<string, unknown>>(),
    extractionModel: text("extraction_model"),
    extractionVersion: text("extraction_version"),
    confidence: real("confidence").default(0).notNull(),
    isVerified: boolean("is_verified").default(false).notNull(),
    reviewStatus: reviewStatusEnum("review_status").default("pending").notNull(),
    embedding: vector("embedding", { dimensions: 1024 }),
    isDemo: boolean("is_demo").default(false).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("reports_raw_hash_uq").on(t.rawHash),
    index("reports_published_idx").on(t.publishedAt),
    index("reports_embedding_hnsw").using("hnsw", t.embedding.op("vector_cosine_ops")),
  ],
);

export const reportMentions = pgTable(
  "report_mentions",
  {
    id: serial("id").primaryKey(),
    reportId: integer("report_id").notNull().references(() => reports.id, { onDelete: "cascade" }),
    spotId: integer("spot_id").references(() => spots.id),
    speciesId: integer("species_id").references(() => species.id),
    lureId: integer("lure_id").references(() => lures.id),
    baitId: integer("bait_id").references(() => baits.id),
    /** Copied from the report for fast spot/species timelines. */
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
    abundance: text("abundance"),
    sizeNotes: text("size_notes"),
    rawText: text("raw_text"),
  },
  (t) => [
    index("mentions_spot_pub_idx").on(t.spotId, t.publishedAt),
    index("mentions_species_pub_idx").on(t.speciesId, t.publishedAt),
    index("mentions_lure_pub_idx").on(t.lureId, t.publishedAt),
  ],
);

// ---------------------------------------------------------------------------
// Lures & bait
// ---------------------------------------------------------------------------
export const lures = pgTable("lures", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  brand: text("brand").notNull(),
  model: text("model").notNull(),
  type: lureTypeEnum("type").notNull(),
  sizes: text("sizes").array().default(sql`'{}'::text[]`).notNull(),
  weights: text("weights").array().default(sql`'{}'::text[]`).notNull(),
  colors: text("colors").array().default(sql`'{}'::text[]`).notNull(),
  howToFish: text("how_to_fish"),
  imageId: integer("image_id"),
  /** [{ retailer, url, priceUsd, isAffiliate }] */
  buyLinks: jsonb("buy_links").$type<{ retailer: string; url: string; priceUsd?: number; isAffiliate: boolean }[]>()
    .default([]).notNull(),
  isDemo: boolean("is_demo").default(false).notNull(),
});

export const lureAliases = pgTable("lure_aliases", {
  alias: text("alias").primaryKey(),
  lureId: integer("lure_id").notNull().references(() => lures.id, { onDelete: "cascade" }),
});

export const baits = pgTable("baits", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  isLive: boolean("is_live").default(false).notNull(),
  rigging: text("rigging"),
  imageId: integer("image_id"),
  isDemo: boolean("is_demo").default(false).notNull(),
});

export const baitAliases = pgTable("bait_aliases", {
  alias: text("alias").primaryKey(),
  baitId: integer("bait_id").notNull().references(() => baits.id, { onDelete: "cascade" }),
});

/** Mentions the normalizer couldn't map — reviewed in /admin. */
export const unmatchedMentions = pgTable("unmatched_mentions", {
  id: serial("id").primaryKey(),
  kind: text("kind").notNull(), // "lure" | "bait" | "species" | "location"
  rawText: text("raw_text").notNull(),
  reportId: integer("report_id").references(() => reports.id, { onDelete: "cascade" }),
  status: reviewStatusEnum("status").default("pending").notNull(),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------------------
// Conditions & scores
// ---------------------------------------------------------------------------
export const conditionsSnapshots = pgTable(
  "conditions_snapshots",
  {
    id: serial("id").primaryKey(),
    spotId: integer("spot_id").notNull().references(() => spots.id, { onDelete: "cascade" }),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    isForecast: boolean("is_forecast").default(false).notNull(),
    tideFt: real("tide_ft"),
    tideStage: text("tide_stage"),
    currentKt: real("current_kt"),
    windKt: real("wind_kt"),
    windDirDeg: real("wind_dir_deg"),
    gustKt: real("gust_kt"),
    waveFt: real("wave_ft"),
    wavePeriodS: real("wave_period_s"),
    waterTempF: real("water_temp_f"),
    airTempF: real("air_temp_f"),
    pressureMb: real("pressure_mb"),
    pressureTrend: text("pressure_trend"),
    cloudPct: real("cloud_pct"),
    precipIn: real("precip_in"),
    flowCfs: real("flow_cfs"),
    gaugeFt: real("gauge_ft"),
    lakeLevelFt: real("lake_level_ft"),
    moonPhase: real("moon_phase"),
    /** Which upstream API each field came from. */
    sources: jsonb("sources").$type<Record<string, string>>().default({}).notNull(),
  },
  (t) => [index("conditions_spot_time_idx").on(t.spotId, t.observedAt)],
);

export const fishingScores = pgTable(
  "fishing_scores",
  {
    spotId: integer("spot_id").notNull().references(() => spots.id, { onDelete: "cascade" }),
    speciesId: integer("species_id").notNull().references(() => species.id, { onDelete: "cascade" }),
    hour: timestamp("hour", { withTimezone: true }).notNull(),
    score: real("score").notNull(),
    breakdown: jsonb("breakdown").$type<Record<string, number>>().notNull(),
    computedAt: timestamp("computed_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.spotId, t.speciesId, t.hour] })],
);

// ---------------------------------------------------------------------------
// Community
// ---------------------------------------------------------------------------
export const catches = pgTable(
  "catches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    speciesId: integer("species_id").references(() => species.id),
    lureId: integer("lure_id").references(() => lures.id),
    baitId: integer("bait_id").references(() => baits.id),
    lureFreeText: text("lure_free_text"),
    lengthIn: real("length_in"),
    weightLb: real("weight_lb"),
    caughtAt: timestamp("caught_at", { withTimezone: true }).notNull(),
    /** NEVER sent to other users' browsers. */
    preciseLocation: point("precise_location"),
    /** Public location: fuzzed (~2 mi) or region centroid depending on privacy. */
    publicLocation: point("public_location"),
    privacy: privacyEnum("privacy").default("fuzzed").notNull(),
    nearestSpotId: integer("nearest_spot_id").references(() => spots.id),
    verification: verificationEnum("verification").default("unverified").notNull(),
    conditionsSnapshotId: integer("conditions_snapshot_id").references(() => conditionsSnapshots.id),
    notes: text("notes"),
    released: boolean("released").default(true).notNull(),
    moderation: reviewStatusEnum("moderation").default("approved").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("catches_public_location_gix").using("gist", t.publicLocation),
    index("catches_species_time_idx").on(t.speciesId, t.caughtAt),
  ],
);

export const media = pgTable("media", {
  id: serial("id").primaryKey(),
  url: text("url").notNull(),
  type: mediaTypeEnum("type").notNull(),
  source: text("source").notNull(),
  sourceUrl: text("source_url"),
  license: text("license").notNull(),
  attribution: text("attribution"),
  ownerUserId: text("owner_user_id").references(() => users.id, { onDelete: "set null" }),
  catchId: uuid("catch_id").references(() => catches.id, { onDelete: "cascade" }),
  width: integer("width"),
  height: integer("height"),
  createdAt: createdAt(),
});

export const videos = pgTable(
  "videos",
  {
    id: serial("id").primaryKey(),
    youtubeId: text("youtube_id").notNull().unique(),
    title: text("title").notNull(),
    channel: text("channel").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
    spotId: integer("spot_id").references(() => spots.id),
    speciesId: integer("species_id").references(() => species.id),
    pinned: boolean("pinned").default(false).notNull(),
    blocked: boolean("blocked").default(false).notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("videos_spot_pub_idx").on(t.spotId, t.publishedAt)],
);

export const regulations = pgTable(
  "regulations",
  {
    id: serial("id").primaryKey(),
    stateCode: text("state_code").notNull(),
    speciesId: integer("species_id").notNull().references(() => species.id),
    waterType: waterTypeEnum("water_type").notNull(),
    sizeLimit: text("size_limit"),
    bagLimit: text("bag_limit"),
    season: text("season"),
    specialRules: text("special_rules"),
    officialUrl: text("official_url").notNull(),
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("regs_state_species_uq").on(t.stateCode, t.speciesId, t.waterType)],
);

export const savedSpots = pgTable(
  "saved_spots",
  {
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    spotId: integer("spot_id").notNull().references(() => spots.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.spotId] })],
);

export const alerts = pgTable("alerts", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  speciesId: integer("species_id").references(() => species.id),
  spotId: integer("spot_id").references(() => spots.id),
  center: point("center"),
  radiusMi: real("radius_mi"),
  /** e.g. { type: "report" } | { type: "score_above", value: 80 } | { type: "water_temp_below", value: 58 } */
  condition: jsonb("condition").$type<Record<string, unknown>>().notNull(),
  channels: text("channels").array().default(sql`'{email}'::text[]`).notNull(),
  enabled: boolean("enabled").default(true).notNull(),
  lastTriggeredAt: timestamp("last_triggered_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const follows = pgTable(
  "follows",
  {
    followerId: text("follower_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    followeeId: text("followee_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.followerId, t.followeeId] })],
);

export const comments = pgTable("comments", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  catchId: uuid("catch_id").references(() => catches.id, { onDelete: "cascade" }),
  reportId: integer("report_id").references(() => reports.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  moderation: reviewStatusEnum("moderation").default("approved").notNull(),
  createdAt: createdAt(),
});

export const likes = pgTable(
  "likes",
  {
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    catchId: uuid("catch_id").notNull().references(() => catches.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.catchId] })],
);

export const moderationFlags = pgTable("moderation_flags", {
  id: serial("id").primaryKey(),
  reporterUserId: text("reporter_user_id").references(() => users.id, { onDelete: "set null" }),
  targetType: text("target_type").notNull(), // "catch" | "comment" | "report" | "media" | "user"
  targetId: text("target_id").notNull(),
  reason: text("reason").notNull(),
  automated: boolean("automated").default(false).notNull(),
  status: reviewStatusEnum("status").default("pending").notNull(),
  createdAt: createdAt(),
});

export const aiJobs = pgTable("ai_jobs", {
  id: serial("id").primaryKey(),
  jobType: text("job_type").notNull(),
  model: text("model").notNull(),
  tokensIn: integer("tokens_in").default(0).notNull(),
  tokensOut: integer("tokens_out").default(0).notNull(),
  costUsd: doublePrecision("cost_usd").default(0).notNull(),
  status: aiJobStatusEnum("status").default("queued").notNull(),
  error: text("error"),
  refType: text("ref_type"),
  refId: text("ref_id"),
  createdAt: createdAt(),
});
