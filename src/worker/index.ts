/**
 * Background worker (BullMQ + Redis): scheduled source ingestion and alert evaluation.
 *   pnpm worker
 */
import { Queue, Worker } from "bullmq";
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { sources } from "@/db/schema";
import { evaluateAlerts } from "@/lib/alerts";
import { ingestReport } from "@/lib/ingest/pipeline";
import { fetchReddit, fetchRss } from "./adapters";

const connection = { url: process.env.REDIS_URL ?? "redis://localhost:6379" };
const queue = new Queue("fishradar", { connection });

async function ingestSource(sourceId: number) {
  const [src] = await db.select().from(sources).where(eq(sources.id, sourceId)).limit(1);
  if (!src || !src.enabled || !src.allowed || !src.url) return { skipped: true };
  try {
    const items = src.type === "rss" || src.type === "web_allowlisted" ? await fetchRss(src.url) : src.type === "reddit" ? await fetchReddit(src.url) : [];
    const results = { stored: 0, duplicate: 0, not_a_report: 0 } as Record<string, number>;
    for (const it of items.slice(0, 50)) {
      const r = await ingestReport({ sourceId: src.id, text: it.text, title: it.title, url: it.url, publishedAt: it.publishedAt });
      results[r.status] = (results[r.status] ?? 0) + 1;
    }
    await db.update(sources).set({ lastSuccessAt: new Date(), lastError: null }).where(eq(sources.id, src.id));
    return results;
  } catch (e) {
    await db.update(sources).set({ lastErrorAt: new Date(), lastError: e instanceof Error ? e.message : String(e) }).where(eq(sources.id, src.id));
    throw e;
  }
}

async function schedule() {
  await queue.upsertJobScheduler("alerts", { pattern: "*/15 * * * *" }, { name: "evaluate-alerts" });
  const scheduled = await db.select().from(sources).where(and(eq(sources.enabled, true), eq(sources.allowed, true), isNotNull(sources.schedule), isNotNull(sources.url)));
  for (const s of scheduled) {
    if (s.type !== "rss" && s.type !== "reddit" && s.type !== "web_allowlisted") continue;
    await queue.upsertJobScheduler(`source-${s.id}`, { pattern: s.schedule! }, { name: "ingest-source", data: { sourceId: s.id } });
  }
  console.log(`[worker] scheduled alerts + ${scheduled.length} sources`);
}

new Worker(
  "fishradar",
  async (job) => {
    if (job.name === "evaluate-alerts") return evaluateAlerts();
    if (job.name === "ingest-source") return ingestSource(job.data.sourceId);
    if (job.name === "reschedule") return schedule();
  },
  { connection, concurrency: 2 },
).on("completed", (job, res) => console.log(`[worker] ${job.name} done`, res))
  .on("failed", (job, err) => console.error(`[worker] ${job?.name} failed: ${err.message}`));

schedule().catch((e) => console.error("[worker] schedule failed", e));
console.log("[worker] FishRadar worker started");
