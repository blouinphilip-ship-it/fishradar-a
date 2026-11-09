import { describe, expect, it } from "vitest";
import { enabledProviderIds } from "@/lib/auth-providers";

const none = {
  AUTH_RESEND_KEY: undefined,
  AUTH_GOOGLE_ID: undefined,
  AUTH_GOOGLE_SECRET: undefined,
  AUTH_APPLE_ID: undefined,
  AUTH_APPLE_SECRET: undefined,
  ENABLE_DEV_LOGIN: false,
};

describe("enabledProviderIds", () => {
  it("returns nothing when no keys are configured", () => {
    expect(enabledProviderIds(none, "development")).toEqual([]);
  });
  it("needs both id and secret for OAuth providers", () => {
    expect(enabledProviderIds({ ...none, AUTH_GOOGLE_ID: "x" }, "development")).toEqual([]);
    expect(enabledProviderIds({ ...none, AUTH_GOOGLE_ID: "x", AUTH_GOOGLE_SECRET: "y" }, "development")).toEqual(["google"]);
  });
  it("enables email magic links with a Resend key", () => {
    expect(enabledProviderIds({ ...none, AUTH_RESEND_KEY: "re_123" }, "development")).toEqual(["resend"]);
  });
  it("never enables dev login in production", () => {
    expect(enabledProviderIds({ ...none, ENABLE_DEV_LOGIN: true }, "development")).toEqual(["dev"]);
    expect(enabledProviderIds({ ...none, ENABLE_DEV_LOGIN: true }, "production")).toEqual([]);
  });
  it("allows dev login in production only for an explicit demo server", () => {
    expect(enabledProviderIds({ ...none, ENABLE_DEV_LOGIN: true, DEMO_MODE: true }, "production")).toEqual(["dev"]);
    expect(enabledProviderIds({ ...none, ENABLE_DEV_LOGIN: false, DEMO_MODE: true }, "production")).toEqual([]);
  });
});
