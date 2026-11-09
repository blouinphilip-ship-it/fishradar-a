import { describe, expect, it } from "vitest";
import { modeFromPath } from "@/lib/nav";

describe("modeFromPath", () => {
  it("detects saltwater and freshwater hubs", () => {
    expect(modeFromPath("/saltwater")).toBe("saltwater");
    expect(modeFromPath("/freshwater/nh")).toBe("freshwater");
  });
  it("treats saltwater run pages and /runs as Runs", () => {
    expect(modeFromPath("/saltwater/runs/striper-fall")).toBe("runs");
    expect(modeFromPath("/runs")).toBe("runs");
  });
  it("prefers an explicit ?mode= value", () => {
    expect(modeFromPath("/", "freshwater")).toBe("freshwater");
  });
  it("ignores bogus ?mode= values and unrelated paths", () => {
    expect(modeFromPath("/lures", "deepsea")).toBeNull();
    expect(modeFromPath("/")).toBeNull();
  });
});
