import { env } from "@/lib/env";

export type SourceResult<T> =
  | { ok: true; data: T; source: string; fetchedAt: string }
  | { ok: false; error: string; source: string; fetchedAt: string };

/** fetch with timeout + a polite User-Agent. Throws on non-2xx. */
export async function getJson<T>(url: string, timeoutMs = 10_000): Promise<T> {
  const res = await fetch(url, {
    headers: { "User-Agent": env.NWS_USER_AGENT, Accept: "application/json, application/geo+json" },
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

export async function getText(url: string, timeoutMs = 10_000): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": env.NWS_USER_AGENT }, signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

/** Run an adapter and wrap the outcome so one dead source never takes down the page. */
export async function safely<T>(source: string, fn: () => Promise<T>): Promise<SourceResult<T>> {
  const fetchedAt = new Date().toISOString();
  try {
    return { ok: true, data: await fn(), source, fetchedAt };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e), source, fetchedAt };
  }
}
