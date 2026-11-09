import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { videos } from "@/db/schema";
import { cached } from "@/lib/cache";
import { env } from "@/lib/env";

/** Recent YouTube videos for a spot/species. Requires YOUTUBE_API_KEY; otherwise returns search links only. */
export async function getVideos(opts: { spotId: number; spotName: string; lat: number; lon: number; speciesId?: number; speciesName?: string }) {
  const q = `${opts.speciesName ?? "fishing"} ${opts.spotName.split(/[(&]/)[0].trim()} fishing`;
  const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&sp=CAI%253D`;
  if (!env.YOUTUBE_API_KEY) return { videos: [] as { youtubeId: string; title: string; channel: string; publishedAt: Date }[], searchUrl, configured: false };
  await cached(`yt:${opts.spotId}:${opts.speciesId ?? 0}`, 6 * 3600, async () => {
    try {
      const { searchYouTube } = await import("@/worker/adapters");
      const found = await searchYouTube(q, opts.lat, opts.lon);
      for (const v of found) await db.insert(videos).values({ ...v, spotId: opts.spotId, speciesId: opts.speciesId ?? null }).onConflictDoNothing();
      return found.length;
    } catch {
      return 0;
    }
  });
  const rows = await db.select().from(videos).where(and(eq(videos.spotId, opts.spotId), eq(videos.blocked, false), ...(opts.speciesId ? [eq(videos.speciesId, opts.speciesId)] : []))).orderBy(desc(videos.pinned), desc(videos.publishedAt)).limit(6);
  return { videos: rows, searchUrl, configured: true };
}
