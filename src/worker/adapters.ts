/** Source adapters: each returns raw items; the pipeline does the rest. */
import { XMLParser } from "fast-xml-parser";

export type RawItem = { text: string; title?: string; url?: string; publishedAt: Date; externalId?: string };

async function get(url: string, headers: Record<string, string> = {}) {
  const r = await fetch(url, { headers: { "User-Agent": "FishRadarAI/0.1 (+https://fishradar.example)", ...headers }, signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new Error(`HTTP ${r.status} from ${new URL(url).host}`);
  return r;
}

/** RSS 2.0 / Atom feeds (publishers, tackle shops, captains). */
export async function fetchRss(url: string): Promise<RawItem[]> {
  const xml = await (await get(url)).text();
  return parseFeed(xml);
}

export function parseFeed(xml: string): RawItem[] {
  const p = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@" });
  const doc = p.parse(xml);
  const strip = (h: unknown) => String(h ?? "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
  const items = doc?.rss?.channel?.item ?? doc?.feed?.entry ?? [];
  return (Array.isArray(items) ? items : [items]).map((it: Record<string, unknown>) => {
    const link = typeof it.link === "string" ? it.link : (it.link as { "@href"?: string })?.["@href"];
    const content = strip(it["content:encoded"] ?? it.description ?? it.content ?? it.summary);
    return { title: strip(it.title), url: link, text: `${strip(it.title)}. ${content}`, publishedAt: new Date(String(it.pubDate ?? it.published ?? it.updated ?? Date.now())), externalId: String(it.guid ?? it.id ?? link) };
  }).filter((i) => i.text.length > 40);
}

/** Reddit via the official OAuth API (needs REDDIT_CLIENT_ID/SECRET). */
export async function fetchReddit(subredditUrl: string): Promise<RawItem[]> {
  const id = process.env.REDDIT_CLIENT_ID;
  const secret = process.env.REDDIT_CLIENT_SECRET;
  if (!id || !secret) throw new Error("Reddit credentials not configured");
  const tok = await (await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST", body: "grant_type=client_credentials",
    headers: { Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "FishRadarAI/0.1" },
  })).json();
  const path = new URL(subredditUrl).pathname;
  const json = await (await get(`https://oauth.reddit.com${path}?limit=50`, { Authorization: `Bearer ${tok.access_token}` })).json();
  return (json.data?.children ?? []).map((c: { data: { title: string; selftext: string; permalink: string; created_utc: number; name: string } }) => ({
    title: c.data.title, text: `${c.data.title}. ${c.data.selftext}`, url: `https://www.reddit.com${c.data.permalink}`,
    publishedAt: new Date(c.data.created_utc * 1000), externalId: c.data.name,
  }));
}

/** YouTube Data API v3 search (official; videos are embedded with the official player). */
export async function searchYouTube(query: string, lat?: number, lon?: number): Promise<{ youtubeId: string; title: string; channel: string; publishedAt: Date }[]> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new Error("YOUTUBE_API_KEY not configured");
  const geo = lat != null && lon != null ? `&location=${lat},${lon}&locationRadius=80km` : "";
  const after = new Date(Date.now() - 45 * 86_400_000).toISOString();
  const json = await (await get(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&order=date&maxResults=12&q=${encodeURIComponent(query)}&publishedAfter=${after}${geo}&key=${key}`)).json();
  return (json.items ?? []).map((i: { id: { videoId: string }; snippet: { title: string; channelTitle: string; publishedAt: string } }) => ({
    youtubeId: i.id.videoId, title: i.snippet.title, channel: i.snippet.channelTitle, publishedAt: new Date(i.snippet.publishedAt),
  }));
}
