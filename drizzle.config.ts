import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL ?? "postgres://postgres@localhost:5432/fishradar" },
  // PostGIS creates its own tables/views; keep drizzle-kit away from them.
  extensionsFilters: ["postgis"],
  strict: true,
  verbose: true,
});
