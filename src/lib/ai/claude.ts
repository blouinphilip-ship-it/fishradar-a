import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { aiJobs } from "@/db/schema";
import { env } from "@/lib/env";

/** USD per million tokens (input, output). Keep in sync with Anthropic pricing. */
const PRICES: Record<string, [number, number]> = {
  "claude-sonnet-5-5": [2, 10],
  "claude-haiku-5-5": [0.1, 0.5],
  "claude-opus-5-5": [4, 20],
};

let client: Anthropic | null | undefined;

/** Returns null when no API key is configured — callers must fall back to rule-based logic. */
export function getClaude(): Anthropic | null {
  if (client !== undefined) return client;
  client = env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }) : null;
  return client;
}

export const aiEnabled = () => Boolean(env.ANTHROPIC_API_KEY);

export function costUsd(model: string, tokensIn: number, tokensOut: number) {
  const [i, o] = PRICES[model] ?? [4, 20];
  return (tokensIn * i + tokensOut * o) / 1_000_000;
}

export async function spentTodayUsd(): Promise<number> {
  const [r] = await db.execute<{ total: number }>(sql`select coalesce(sum(cost_usd), 0)::float as total from ai_jobs where created_at > date_trunc('day', now())`);
  return r?.total ?? 0;
}

/** Enforce the daily AI budget from config before making a call. */
export async function withinBudget(): Promise<boolean> {
  return (await spentTodayUsd()) < env.AI_DAILY_BUDGET_USD;
}

export async function logAiJob(job: { jobType: string; model: string; tokensIn: number; tokensOut: number; status: "succeeded" | "failed" | "needs_review"; error?: string; refType?: string; refId?: string }) {
  await db.insert(aiJobs).values({ ...job, costUsd: costUsd(job.model, job.tokensIn, job.tokensOut) });
}
