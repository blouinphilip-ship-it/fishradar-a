CREATE EXTENSION IF NOT EXISTS postgis;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE TYPE "public"."ai_job_status" AS ENUM('queued', 'running', 'succeeded', 'failed', 'needs_review');--> statement-breakpoint
CREATE TYPE "public"."lure_type" AS ENUM('topwater', 'swimmer', 'bucktail', 'jig', 'metal', 'soft_plastic', 'spoon', 'spinner', 'spinnerbait', 'crankbait', 'jerkbait', 'fly', 'teaser', 'trolling', 'umbrella_rig', 'other');--> statement-breakpoint
CREATE TYPE "public"."media_type" AS ENUM('image', 'video');--> statement-breakpoint
CREATE TYPE "public"."location_privacy" AS ENUM('precise', 'fuzzed', 'region');--> statement-breakpoint
CREATE TYPE "public"."report_kind" AS ENUM('verified', 'user_submitted', 'seasonal');--> statement-breakpoint
CREATE TYPE "public"."review_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('hot', 'active', 'starting', 'tapering', 'out_of_season');--> statement-breakpoint
CREATE TYPE "public"."source_type" AS ENUM('government_api', 'rss', 'partner', 'reddit', 'youtube', 'web_allowlisted', 'user');--> statement-breakpoint
CREATE TYPE "public"."spot_type" AS ENUM('inlet', 'beach', 'jetty', 'flat', 'offshore', 'canyon', 'bay', 'harbor', 'rip', 'lake', 'river', 'reservoir', 'pond', 'stream', 'pier', 'bridge', 'marsh', 'reef');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('angler', 'partner', 'moderator', 'admin');--> statement-breakpoint
CREATE TYPE "public"."verification_level" AS ENUM('unverified', 'photo_verified', 'community_confirmed', 'trusted_angler');--> statement-breakpoint
CREATE TYPE "public"."water_type" AS ENUM('salt', 'fresh', 'brackish');--> statement-breakpoint
CREATE TABLE "account" (
	"userId" text NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"providerAccountId" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "account_provider_providerAccountId_pk" PRIMARY KEY("provider","providerAccountId")
);
--> statement-breakpoint
CREATE TABLE "ai_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_type" text NOT NULL,
	"model" text NOT NULL,
	"tokens_in" integer DEFAULT 0 NOT NULL,
	"tokens_out" integer DEFAULT 0 NOT NULL,
	"cost_usd" double precision DEFAULT 0 NOT NULL,
	"status" "ai_job_status" DEFAULT 'queued' NOT NULL,
	"error" text,
	"ref_type" text,
	"ref_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alerts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"species_id" integer,
	"spot_id" integer,
	"center" geometry(point),
	"radius_mi" real,
	"condition" jsonb NOT NULL,
	"channels" text[] DEFAULT '{email}'::text[] NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_triggered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bait_aliases" (
	"alias" text PRIMARY KEY NOT NULL,
	"bait_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "baits" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"is_live" boolean DEFAULT false NOT NULL,
	"rigging" text,
	"image_id" integer,
	"is_demo" boolean DEFAULT false NOT NULL,
	CONSTRAINT "baits_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "catches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"species_id" integer,
	"lure_id" integer,
	"bait_id" integer,
	"lure_free_text" text,
	"length_in" real,
	"weight_lb" real,
	"caught_at" timestamp with time zone NOT NULL,
	"precise_location" geometry(point),
	"public_location" geometry(point),
	"privacy" "location_privacy" DEFAULT 'fuzzed' NOT NULL,
	"nearest_spot_id" integer,
	"verification" "verification_level" DEFAULT 'unverified' NOT NULL,
	"conditions_snapshot_id" integer,
	"notes" text,
	"released" boolean DEFAULT true NOT NULL,
	"moderation" "review_status" DEFAULT 'approved' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"catch_id" uuid,
	"report_id" integer,
	"body" text NOT NULL,
	"moderation" "review_status" DEFAULT 'approved' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conditions_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"spot_id" integer NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"is_forecast" boolean DEFAULT false NOT NULL,
	"tide_ft" real,
	"tide_stage" text,
	"current_kt" real,
	"wind_kt" real,
	"wind_dir_deg" real,
	"gust_kt" real,
	"wave_ft" real,
	"wave_period_s" real,
	"water_temp_f" real,
	"air_temp_f" real,
	"pressure_mb" real,
	"pressure_trend" text,
	"cloud_pct" real,
	"precip_in" real,
	"flow_cfs" real,
	"gauge_ft" real,
	"lake_level_ft" real,
	"moon_phase" real,
	"sources" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fishing_scores" (
	"spot_id" integer NOT NULL,
	"species_id" integer NOT NULL,
	"hour" timestamp with time zone NOT NULL,
	"score" real NOT NULL,
	"breakdown" jsonb NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fishing_scores_spot_id_species_id_hour_pk" PRIMARY KEY("spot_id","species_id","hour")
);
--> statement-breakpoint
CREATE TABLE "follows" (
	"follower_id" text NOT NULL,
	"followee_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "follows_follower_id_followee_id_pk" PRIMARY KEY("follower_id","followee_id")
);
--> statement-breakpoint
CREATE TABLE "likes" (
	"user_id" text NOT NULL,
	"catch_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "likes_user_id_catch_id_pk" PRIMARY KEY("user_id","catch_id")
);
--> statement-breakpoint
CREATE TABLE "lure_aliases" (
	"alias" text PRIMARY KEY NOT NULL,
	"lure_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lures" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"brand" text NOT NULL,
	"model" text NOT NULL,
	"type" "lure_type" NOT NULL,
	"sizes" text[] DEFAULT '{}'::text[] NOT NULL,
	"weights" text[] DEFAULT '{}'::text[] NOT NULL,
	"colors" text[] DEFAULT '{}'::text[] NOT NULL,
	"how_to_fish" text,
	"image_id" integer,
	"buy_links" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	CONSTRAINT "lures_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "media" (
	"id" serial PRIMARY KEY NOT NULL,
	"url" text NOT NULL,
	"type" "media_type" NOT NULL,
	"source" text NOT NULL,
	"source_url" text,
	"license" text NOT NULL,
	"attribution" text,
	"owner_user_id" text,
	"catch_id" uuid,
	"width" integer,
	"height" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "moderation_flags" (
	"id" serial PRIMARY KEY NOT NULL,
	"reporter_user_id" text,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"reason" text NOT NULL,
	"automated" boolean DEFAULT false NOT NULL,
	"status" "review_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "regions" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"parent_id" integer,
	"level" text NOT NULL,
	"state_code" text,
	"area" geometry(Geometry,4326),
	"is_demo" boolean DEFAULT false NOT NULL,
	CONSTRAINT "regions_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "regulations" (
	"id" serial PRIMARY KEY NOT NULL,
	"state_code" text NOT NULL,
	"species_id" integer NOT NULL,
	"water_type" "water_type" NOT NULL,
	"size_limit" text,
	"bag_limit" text,
	"season" text,
	"special_rules" text,
	"official_url" text NOT NULL,
	"last_verified_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "report_mentions" (
	"id" serial PRIMARY KEY NOT NULL,
	"report_id" integer NOT NULL,
	"spot_id" integer,
	"species_id" integer,
	"lure_id" integer,
	"bait_id" integer,
	"published_at" timestamp with time zone NOT NULL,
	"abundance" text,
	"size_notes" text,
	"raw_text" text
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_id" integer NOT NULL,
	"kind" "report_kind" DEFAULT 'verified' NOT NULL,
	"url" text,
	"title" text,
	"published_at" timestamp with time zone NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"summary" text NOT NULL,
	"raw_hash" text NOT NULL,
	"license_type" text,
	"extraction" jsonb,
	"extraction_model" text,
	"extraction_version" text,
	"confidence" real DEFAULT 0 NOT NULL,
	"is_verified" boolean DEFAULT false NOT NULL,
	"review_status" "review_status" DEFAULT 'pending' NOT NULL,
	"embedding" vector(1024),
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"species_id" integer NOT NULL,
	"name" text NOT NULL,
	"water_type" "water_type" NOT NULL,
	"direction" text,
	"description" text,
	"typical_route" geometry(Geometry,4326),
	"season_windows" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	CONSTRAINT "runs_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "saved_spots" (
	"user_id" text NOT NULL,
	"spot_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saved_spots_user_id_spot_id_pk" PRIMARY KEY("user_id","spot_id")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"sessionToken" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"expires" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" "source_type" NOT NULL,
	"url" text,
	"allowed" boolean DEFAULT false NOT NULL,
	"permission_notes" text,
	"robots_checked_at" timestamp with time zone,
	"trust_score" real DEFAULT 0.5 NOT NULL,
	"schedule" text,
	"enabled" boolean DEFAULT false NOT NULL,
	"partner_user_id" text,
	"logo_url" text,
	"last_success_at" timestamp with time zone,
	"last_error_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "species" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"common_name" text NOT NULL,
	"scientific_name" text,
	"nicknames" text[] DEFAULT '{}'::text[] NOT NULL,
	"water_types" "water_type"[] NOT NULL,
	"temp_min_f" real,
	"temp_opt_f" real,
	"temp_max_f" real,
	"description" text,
	"image_id" integer,
	"scoring_profile" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	CONSTRAINT "species_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "species_seasons" (
	"species_id" integer NOT NULL,
	"region_id" integer NOT NULL,
	"monthly" real[] NOT NULL,
	"peak_notes" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	CONSTRAINT "species_seasons_species_id_region_id_pk" PRIMARY KEY("species_id","region_id")
);
--> statement-breakpoint
CREATE TABLE "spots" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"region_id" integer,
	"water_type" "water_type" NOT NULL,
	"spot_type" "spot_type" NOT NULL,
	"location" geometry(point) NOT NULL,
	"description" text,
	"access" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"nearest_tide_station_id" text,
	"nearest_current_station_id" text,
	"nearest_buoy_id" text,
	"usgs_site_id" text,
	"nws_marine_zone" text,
	"regulations_url" text,
	"safe_wave_ft" real,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "spots_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "unmatched_mentions" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"raw_text" text NOT NULL,
	"report_id" integer,
	"status" "review_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text,
	"emailVerified" timestamp with time zone,
	"image" text,
	"role" "user_role" DEFAULT 'angler' NOT NULL,
	"handle" text,
	"bio" text,
	"home_point" geometry(point),
	"reputation" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email"),
	CONSTRAINT "user_handle_unique" UNIQUE("handle")
);
--> statement-breakpoint
CREATE TABLE "verificationToken" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp with time zone NOT NULL,
	CONSTRAINT "verificationToken_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
CREATE TABLE "videos" (
	"id" serial PRIMARY KEY NOT NULL,
	"youtube_id" text NOT NULL,
	"title" text NOT NULL,
	"channel" text NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	"spot_id" integer,
	"species_id" integer,
	"pinned" boolean DEFAULT false NOT NULL,
	"blocked" boolean DEFAULT false NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "videos_youtube_id_unique" UNIQUE("youtube_id")
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_species_id_species_id_fk" FOREIGN KEY ("species_id") REFERENCES "public"."species"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_spot_id_spots_id_fk" FOREIGN KEY ("spot_id") REFERENCES "public"."spots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bait_aliases" ADD CONSTRAINT "bait_aliases_bait_id_baits_id_fk" FOREIGN KEY ("bait_id") REFERENCES "public"."baits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catches" ADD CONSTRAINT "catches_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catches" ADD CONSTRAINT "catches_species_id_species_id_fk" FOREIGN KEY ("species_id") REFERENCES "public"."species"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catches" ADD CONSTRAINT "catches_lure_id_lures_id_fk" FOREIGN KEY ("lure_id") REFERENCES "public"."lures"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catches" ADD CONSTRAINT "catches_bait_id_baits_id_fk" FOREIGN KEY ("bait_id") REFERENCES "public"."baits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catches" ADD CONSTRAINT "catches_nearest_spot_id_spots_id_fk" FOREIGN KEY ("nearest_spot_id") REFERENCES "public"."spots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catches" ADD CONSTRAINT "catches_conditions_snapshot_id_conditions_snapshots_id_fk" FOREIGN KEY ("conditions_snapshot_id") REFERENCES "public"."conditions_snapshots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_catch_id_catches_id_fk" FOREIGN KEY ("catch_id") REFERENCES "public"."catches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conditions_snapshots" ADD CONSTRAINT "conditions_snapshots_spot_id_spots_id_fk" FOREIGN KEY ("spot_id") REFERENCES "public"."spots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fishing_scores" ADD CONSTRAINT "fishing_scores_spot_id_spots_id_fk" FOREIGN KEY ("spot_id") REFERENCES "public"."spots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fishing_scores" ADD CONSTRAINT "fishing_scores_species_id_species_id_fk" FOREIGN KEY ("species_id") REFERENCES "public"."species"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_follower_id_user_id_fk" FOREIGN KEY ("follower_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_followee_id_user_id_fk" FOREIGN KEY ("followee_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "likes" ADD CONSTRAINT "likes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "likes" ADD CONSTRAINT "likes_catch_id_catches_id_fk" FOREIGN KEY ("catch_id") REFERENCES "public"."catches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lure_aliases" ADD CONSTRAINT "lure_aliases_lure_id_lures_id_fk" FOREIGN KEY ("lure_id") REFERENCES "public"."lures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_catch_id_catches_id_fk" FOREIGN KEY ("catch_id") REFERENCES "public"."catches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_flags" ADD CONSTRAINT "moderation_flags_reporter_user_id_user_id_fk" FOREIGN KEY ("reporter_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regulations" ADD CONSTRAINT "regulations_species_id_species_id_fk" FOREIGN KEY ("species_id") REFERENCES "public"."species"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_mentions" ADD CONSTRAINT "report_mentions_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_mentions" ADD CONSTRAINT "report_mentions_spot_id_spots_id_fk" FOREIGN KEY ("spot_id") REFERENCES "public"."spots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_mentions" ADD CONSTRAINT "report_mentions_species_id_species_id_fk" FOREIGN KEY ("species_id") REFERENCES "public"."species"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_mentions" ADD CONSTRAINT "report_mentions_lure_id_lures_id_fk" FOREIGN KEY ("lure_id") REFERENCES "public"."lures"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_mentions" ADD CONSTRAINT "report_mentions_bait_id_baits_id_fk" FOREIGN KEY ("bait_id") REFERENCES "public"."baits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_species_id_species_id_fk" FOREIGN KEY ("species_id") REFERENCES "public"."species"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_spots" ADD CONSTRAINT "saved_spots_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_spots" ADD CONSTRAINT "saved_spots_spot_id_spots_id_fk" FOREIGN KEY ("spot_id") REFERENCES "public"."spots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_partner_user_id_user_id_fk" FOREIGN KEY ("partner_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "species_seasons" ADD CONSTRAINT "species_seasons_species_id_species_id_fk" FOREIGN KEY ("species_id") REFERENCES "public"."species"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "species_seasons" ADD CONSTRAINT "species_seasons_region_id_regions_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spots" ADD CONSTRAINT "spots_region_id_regions_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unmatched_mentions" ADD CONSTRAINT "unmatched_mentions_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_spot_id_spots_id_fk" FOREIGN KEY ("spot_id") REFERENCES "public"."spots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_species_id_species_id_fk" FOREIGN KEY ("species_id") REFERENCES "public"."species"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "catches_public_location_gix" ON "catches" USING gist ("public_location");--> statement-breakpoint
CREATE INDEX "catches_species_time_idx" ON "catches" USING btree ("species_id","caught_at");--> statement-breakpoint
CREATE INDEX "conditions_spot_time_idx" ON "conditions_snapshots" USING btree ("spot_id","observed_at");--> statement-breakpoint
CREATE INDEX "regions_area_gix" ON "regions" USING gist ("area");--> statement-breakpoint
CREATE INDEX "regions_parent_idx" ON "regions" USING btree ("parent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "regs_state_species_uq" ON "regulations" USING btree ("state_code","species_id","water_type");--> statement-breakpoint
CREATE INDEX "mentions_spot_pub_idx" ON "report_mentions" USING btree ("spot_id","published_at");--> statement-breakpoint
CREATE INDEX "mentions_species_pub_idx" ON "report_mentions" USING btree ("species_id","published_at");--> statement-breakpoint
CREATE INDEX "mentions_lure_pub_idx" ON "report_mentions" USING btree ("lure_id","published_at");--> statement-breakpoint
CREATE UNIQUE INDEX "reports_raw_hash_uq" ON "reports" USING btree ("raw_hash");--> statement-breakpoint
CREATE INDEX "reports_published_idx" ON "reports" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "reports_embedding_hnsw" ON "reports" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "spots_location_gix" ON "spots" USING gist ("location");--> statement-breakpoint
CREATE INDEX "spots_region_idx" ON "spots" USING btree ("region_id");--> statement-breakpoint
CREATE INDEX "spots_water_type_idx" ON "spots" USING btree ("water_type");--> statement-breakpoint
CREATE INDEX "videos_spot_pub_idx" ON "videos" USING btree ("spot_id","published_at");