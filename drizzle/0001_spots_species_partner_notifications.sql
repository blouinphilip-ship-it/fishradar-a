CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"alert_id" integer,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"url" text,
	"read_at" timestamp with time zone,
	"emailed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "raw_submissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_id" integer NOT NULL,
	"submitted_by" text,
	"spot_id" integer,
	"title" text,
	"body" text NOT NULL,
	"url" text,
	"report_date" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'received' NOT NULL,
	"report_id" integer,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "species_tackle" (
	"species_id" integer PRIMARY KEY NOT NULL,
	"rod" text,
	"reel" text,
	"line" text,
	"leader" text,
	"hooks" text,
	"rigs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"structure" text,
	"best_tide" text,
	"best_time" text,
	"depth" text,
	"default_lures" text[] DEFAULT '{}'::text[] NOT NULL,
	"default_baits" text[] DEFAULT '{}'::text[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spot_species" (
	"spot_id" integer NOT NULL,
	"species_id" integer NOT NULL,
	"notes" text,
	"how_to" text,
	CONSTRAINT "spot_species_spot_id_species_id_pk" PRIMARY KEY("spot_id","species_id")
);
--> statement-breakpoint
ALTER TABLE "spots" ADD COLUMN "zone" text DEFAULT 'northeast' NOT NULL;--> statement-breakpoint
ALTER TABLE "spots" ADD COLUMN "access_modes" text[] DEFAULT '{shore,boat}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "spots" ADD COLUMN "aliases" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_alert_id_alerts_id_fk" FOREIGN KEY ("alert_id") REFERENCES "public"."alerts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_submissions" ADD CONSTRAINT "raw_submissions_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_submissions" ADD CONSTRAINT "raw_submissions_submitted_by_user_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_submissions" ADD CONSTRAINT "raw_submissions_spot_id_spots_id_fk" FOREIGN KEY ("spot_id") REFERENCES "public"."spots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_submissions" ADD CONSTRAINT "raw_submissions_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "species_tackle" ADD CONSTRAINT "species_tackle_species_id_species_id_fk" FOREIGN KEY ("species_id") REFERENCES "public"."species"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spot_species" ADD CONSTRAINT "spot_species_spot_id_spots_id_fk" FOREIGN KEY ("spot_id") REFERENCES "public"."spots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spot_species" ADD CONSTRAINT "spot_species_species_id_species_id_fk" FOREIGN KEY ("species_id") REFERENCES "public"."species"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id","created_at");