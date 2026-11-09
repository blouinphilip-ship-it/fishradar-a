/**
 * Runs against a real Postgres+PostGIS+pgvector database (DATABASE_URL), after `pnpm db:migrate`.
 * Skipped automatically when no database is reachable.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, sql } from "drizzle-orm";
import postgres from "postgres";
import * as schema from "@/db/schema";

const url = process.env.DATABASE_URL ?? "postgres://postgres@localhost:5432/fishradar";
const client = postgres(url, { max: 1, connect_timeout: 3, onnotice: () => {} });
const db = drizzle(client, { schema });

let reachable = false;
beforeAll(async () => {
  try {
    await client`select 1`;
    reachable = true;
  } catch {
    reachable = false;
  }
});
afterAll(async () => {
  await client.end();
});

describe("database schema", () => {
  it("has PostGIS and pgvector installed", async (ctx) => {
    if (!reachable) ctx.skip();
    const rows = await client`select extname from pg_extension where extname in ('postgis','vector') order by 1`;
    expect(rows.map((r) => r.extname)).toEqual(["postgis", "vector"]);
  });

  it("stores a spot point and finds it with a radius query", async (ctx) => {
    if (!reachable) ctx.skip();
    const slug = `test-spot-${Date.now()}`;
    await db.insert(schema.spots).values({
      slug,
      name: "Test Point",
      waterType: "salt",
      spotType: "rip",
      location: { x: -71.857, y: 41.071 }, // Montauk Point (lon, lat)
      isDemo: true,
    });
    try {
      // within 10 miles (16,093 m) of a point in Montauk village
      const near = await db
        .select({ slug: schema.spots.slug })
        .from(schema.spots)
        .where(
          sql`${schema.spots.slug} = ${slug} and ST_DWithin(${schema.spots.location}::geography, ST_SetSRID(ST_MakePoint(-71.954, 41.035), 4326)::geography, 16093)`,
        );
      expect(near).toHaveLength(1);
      const far = await db
        .select({ slug: schema.spots.slug })
        .from(schema.spots)
        .where(
          sql`${schema.spots.slug} = ${slug} and ST_DWithin(${schema.spots.location}::geography, ST_SetSRID(ST_MakePoint(-81.78, 24.55), 4326)::geography, 16093)`,
        );
      expect(far).toHaveLength(0);
    } finally {
      await db.delete(schema.spots).where(eq(schema.spots.slug, slug));
    }
  });
});
