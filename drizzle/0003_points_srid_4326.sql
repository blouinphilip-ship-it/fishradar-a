ALTER TABLE "alerts" ALTER COLUMN "center" SET DATA TYPE geometry(Point,4326) USING ST_SetSRID("center", 4326);--> statement-breakpoint
ALTER TABLE "catches" ALTER COLUMN "precise_location" SET DATA TYPE geometry(Point,4326) USING ST_SetSRID("precise_location", 4326);--> statement-breakpoint
ALTER TABLE "catches" ALTER COLUMN "public_location" SET DATA TYPE geometry(Point,4326) USING ST_SetSRID("public_location", 4326);--> statement-breakpoint
ALTER TABLE "spots" ALTER COLUMN "location" SET DATA TYPE geometry(Point,4326) USING ST_SetSRID("location", 4326);--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "home_point" SET DATA TYPE geometry(Point,4326) USING ST_SetSRID("home_point", 4326);