import { z } from "zod";

/** Server-side environment. Validated once at startup; never import this from client components. */
const schema = z.object({
  DATABASE_URL: z.string().url().default("postgres://postgres@localhost:5432/fishradar"),
  REDIS_URL: z.string().url().default("redis://localhost:6379"),
  AUTH_SECRET: z.string().optional(),
  AUTH_GOOGLE_ID: z.string().optional(),
  AUTH_GOOGLE_SECRET: z.string().optional(),
  AUTH_APPLE_ID: z.string().optional(),
  AUTH_APPLE_SECRET: z.string().optional(),
  AUTH_RESEND_KEY: z.string().optional(),
  AUTH_EMAIL_FROM: z.string().default("FishRadar AI <login@example.com>"),
  ANTHROPIC_API_KEY: z.string().optional(),
  AI_MODEL_EXTRACTION: z.string().default("claude-sonnet-5-5"),
  AI_MODEL_ASSISTANT: z.string().default("claude-sonnet-5-5"),
  AI_MODEL_CLASSIFIER: z.string().default("claude-haiku-5-5"),
  AI_DAILY_BUDGET_USD: z.coerce.number().default(5),
  NEXT_PUBLIC_CESIUM_ION_TOKEN: z.string().optional(),
  YOUTUBE_API_KEY: z.string().optional(),
  REDDIT_CLIENT_ID: z.string().optional(),
  REDDIT_CLIENT_SECRET: z.string().optional(),
  NWS_USER_AGENT: z.string().default("FishRadarAI/0.1 (contact: set-me@example.com)"),
  ENABLE_DEV_LOGIN: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
});

export const env = schema.parse(process.env);
export type Env = z.infer<typeof schema>;
