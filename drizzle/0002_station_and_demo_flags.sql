ALTER TABLE "catches" ADD COLUMN "is_demo" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "spots" ADD COLUMN "water_temp_station_id" text;