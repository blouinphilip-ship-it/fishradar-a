import type { Env } from "@/lib/env";

export type ProviderId = "resend" | "google" | "apple" | "dev";

/** Which sign-in providers are usable, based on which keys are configured. Pure + unit-tested. */
export function enabledProviderIds(
  env: Pick<
    Env,
    | "AUTH_RESEND_KEY"
    | "AUTH_GOOGLE_ID"
    | "AUTH_GOOGLE_SECRET"
    | "AUTH_APPLE_ID"
    | "AUTH_APPLE_SECRET"
    | "ENABLE_DEV_LOGIN"
  >,
  nodeEnv: string | undefined = process.env.NODE_ENV,
): ProviderId[] {
  const ids: ProviderId[] = [];
  if (env.AUTH_RESEND_KEY) ids.push("resend");
  if (env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET) ids.push("google");
  if (env.AUTH_APPLE_ID && env.AUTH_APPLE_SECRET) ids.push("apple");
  if (env.ENABLE_DEV_LOGIN && nodeEnv !== "production") ids.push("dev");
  return ids;
}
