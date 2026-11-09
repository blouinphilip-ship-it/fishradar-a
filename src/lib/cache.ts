import Redis from "ioredis";

/**
 * Tiny cache: Redis when available, in-process memory otherwise.
 * Never throws — a cache failure must not break a page.
 */
const mem = new Map<string, { v: string; exp: number }>();
let redis: Redis | null | undefined;

function getRedis(): Redis | null {
  if (redis !== undefined) return redis;
  const url = process.env.REDIS_URL;
  if (!url || process.env.NODE_ENV === "test") return (redis = null);
  try {
    redis = new Redis(url, { lazyConnect: false, maxRetriesPerRequest: 1, enableOfflineQueue: false, connectTimeout: 1500 });
    redis.on("error", () => {});
  } catch {
    redis = null;
  }
  return redis;
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const r = getRedis();
  if (r && r.status === "ready") {
    try {
      const v = await r.get(key);
      if (v) return JSON.parse(v) as T;
    } catch {
      /* fall through */
    }
  }
  const m = mem.get(key);
  if (m && m.exp > Date.now()) return JSON.parse(m.v) as T;
  return null;
}

export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  const v = JSON.stringify(value);
  mem.set(key, { v, exp: Date.now() + ttlSeconds * 1000 });
  if (mem.size > 5000) mem.delete(mem.keys().next().value!);
  const r = getRedis();
  if (r && r.status === "ready") {
    try {
      await r.set(key, v, "EX", ttlSeconds);
    } catch {
      /* ignore */
    }
  }
}

/** Get-or-compute with TTL. Failed computations are cached briefly so a dead upstream isn't hammered. */
export async function cached<T>(key: string, ttlSeconds: number, fn: () => Promise<T>): Promise<T> {
  const hit = await cacheGet<T>(key);
  if (hit !== null) return hit;
  const v = await fn();
  await cacheSet(key, v, ttlSeconds);
  return v;
}
