import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";

export type Dictionary = {
  species: { id: number; slug: string; terms: string[] }[];
  lures: { id: number; slug: string; terms: string[] }[];
  baits: { id: number; slug: string; terms: string[] }[];
  spots: { id: number; slug: string; terms: string[] }[];
};

let cache: { at: number; dict: Dictionary } | null = null;

/** Name/alias dictionary for normalization, cached for 10 minutes. */
export async function getDictionary(): Promise<Dictionary> {
  if (cache && Date.now() - cache.at < 600_000) return cache.dict;
  const [species, lures, baits, spots] = await Promise.all([
    db.execute<{ id: number; slug: string; terms: string[] }>(sql`select id, slug, array_append(nicknames, common_name) as terms from species`),
    db.execute<{ id: number; slug: string; terms: string[] }>(sql`select l.id, l.slug, array_agg(a.alias) as terms from lures l join lure_aliases a on a.lure_id = l.id group by l.id`),
    db.execute<{ id: number; slug: string; terms: string[] }>(sql`select b.id, b.slug, array_agg(a.alias) as terms from baits b join bait_aliases a on a.bait_id = b.id group by b.id`),
    db.execute<{ id: number; slug: string; terms: string[] }>(sql`select id, slug, array_append(aliases, name) as terms from spots`),
  ]);
  const lower = (r: { id: number; slug: string; terms: string[] }[]) => r.map((x) => ({ ...x, terms: x.terms.map((t) => t.toLowerCase()) }));
  const dict = { species: lower(species), lures: lower(lures), baits: lower(baits), spots: lower(spots) };
  cache = { at: Date.now(), dict };
  return dict;
}
