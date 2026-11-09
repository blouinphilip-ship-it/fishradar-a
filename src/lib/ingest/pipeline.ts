import "server-only";
import crypto from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { reportMentions, reports, sources, unmatchedMentions } from "@/db/schema";
import { getDictionary } from "./dictionary";
import { classify, extractReport } from "./extract";
import { findMentions } from "./heuristic";

export type IngestInput = {
  sourceId: number; text: string; title?: string | null; url?: string | null; publishedAt: Date;
  spotHintId?: number | null; kind?: "verified" | "user_submitted"; licenseType?: string;
};
export type IngestResult = { status: "stored" | "duplicate" | "not_a_report" | "source_not_allowed"; reportId?: number; reviewStatus?: string; method?: string; unmatched?: string[] };

export const hashText = (t: string) => crypto.createHash("sha256").update(t.toLowerCase().replace(/\s+/g, " ").trim()).digest("hex");

/** fetch → dedupe → classify → extract → normalize → score → store (spec §13.2). */
export async function ingestReport(input: IngestInput): Promise<IngestResult> {
  const [src] = await db.select().from(sources).where(eq(sources.id, input.sourceId)).limit(1);
  if (!src || !src.allowed) return { status: "source_not_allowed" };

  const rawHash = hashText(input.text);
  const [dupe] = await db.select({ id: reports.id }).from(reports).where(eq(reports.rawHash, rawHash)).limit(1);
  if (dupe) return { status: "duplicate", reportId: dupe.id };

  if (src.type === "reddit" || src.type === "rss" || src.type === "web_allowlisted") {
    const c = await classify(input.text);
    if (!c.isReport) return { status: "not_a_report", method: c.method };
  }

  const { extraction: ex, model, method } = await extractReport(input.text, input.publishedAt.toISOString().slice(0, 10));
  if (!ex.is_fishing_report) return { status: "not_a_report", method };

  // normalize to catalog
  const dict = await getDictionary();
  const unmatched: { kind: string; raw: string }[] = [];
  const mapAll = (raws: string[], entries: typeof dict.species, kind: string) => {
    const ids = new Set<number>();
    for (const raw of raws) {
      const hit = findMentions(raw, entries)[0];
      const entry = hit && entries.find((e) => e.slug === hit.slug);
      if (entry) ids.add(entry.id);
      else unmatched.push({ kind, raw });
    }
    return [...ids];
  };
  const speciesIds = mapAll(ex.species.map((s) => s.name), dict.species, "species");
  const lureIds = mapAll(ex.lures.map((l) => l.raw), dict.lures, "lure");
  const baitIds = mapAll(ex.bait.map((b) => b.raw), dict.baits, "bait");
  let spotIds = input.spotHintId ? [input.spotHintId] : mapAll(ex.locations.map((l) => l.name), dict.spots, "location");
  if (!spotIds.length) spotIds = findMentions(input.text, dict.spots).map((m) => dict.spots.find((s) => s.slug === m.slug)!.id).slice(0, 2);

  const confidence = Math.round(Math.min(1, ex.extraction_confidence * (0.5 + src.trustScore / 2)) * 100) / 100;
  const resolved = spotIds.length > 0 && speciesIds.length > 0;
  const reviewStatus = resolved && confidence >= 0.35 ? "approved" : "pending";
  const isVerified = (src.type === "partner" || src.type === "government_api") && reviewStatus === "approved";

  const [row] = await db.insert(reports).values({
    sourceId: src.id, kind: input.kind ?? (src.type === "user" ? "user_submitted" : "verified"), url: input.url ?? null, title: input.title ?? null,
    publishedAt: input.publishedAt, summary: ex.summary || input.text.slice(0, 280), rawHash, licenseType: input.licenseType ?? src.type,
    extraction: { ...ex, conditions: Object.fromEntries(Object.entries(ex.conditions_mentioned).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)])) },
    extractionModel: model, extractionVersion: method === "claude" ? "claude-structured-v1" : "heuristic-v1",
    confidence, isVerified, reviewStatus,
  }).returning({ id: reports.id });

  const abundance = ex.species[0]?.abundance ?? null;
  const size = ex.species[0]?.size_notes ?? null;
  const rows: (typeof reportMentions.$inferInsert)[] = [];
  for (const spotId of spotIds.length ? spotIds : [null]) {
    for (const speciesId of speciesIds) rows.push({ reportId: row.id, spotId, speciesId, publishedAt: input.publishedAt, abundance, sizeNotes: size });
    for (const lureId of lureIds) rows.push({ reportId: row.id, spotId, speciesId: speciesIds[0] ?? null, lureId, publishedAt: input.publishedAt });
    for (const baitId of baitIds) rows.push({ reportId: row.id, spotId, speciesId: speciesIds[0] ?? null, baitId, publishedAt: input.publishedAt });
  }
  if (rows.length) await db.insert(reportMentions).values(rows);
  if (unmatched.length) await db.insert(unmatchedMentions).values(unmatched.map((u) => ({ kind: u.kind, rawText: u.raw, reportId: row.id })));
  await db.update(sources).set({ lastSuccessAt: sql`now()` }).where(eq(sources.id, src.id));
  return { status: "stored", reportId: row.id, reviewStatus, method, unmatched: unmatched.map((u) => `${u.kind}: ${u.raw}`) };
}
