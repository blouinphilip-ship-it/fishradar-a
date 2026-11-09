import { describe, expect, it } from "vitest";
import { bestWindows, lightFactor, pressureFactor, quickScore, reportsSignal, runStatus, scoreHour, seasonalAt, tideFactor, waterTempFactor, windFactor } from "@/lib/scoring";

const striper = { tempMinF: 45, tempOptF: 58, tempMaxF: 72, nightBonus: 1.35 };

describe("factor functions", () => {
  it("reportsSignal grows with recent, strong reports and ignores stale ones", () => {
    expect(reportsSignal([])).toBe(0);
    const one = reportsSignal([{ ageDays: 1, abundance: "good" }]);
    const many = reportsSignal([0, 1, 2, 3].map((d) => ({ ageDays: d, abundance: "excellent" })));
    expect(one).toBeGreaterThan(0.3);
    expect(many).toBeGreaterThan(one);
    expect(many).toBeLessThanOrEqual(1);
    expect(reportsSignal([{ ageDays: 20, abundance: "excellent" }])).toBe(0);
  });
  it("seasonalAt interpolates between months", () => {
    const cal = [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1];
    expect(seasonalAt(cal, new Date(Date.UTC(2026, 2, 15)))).toBeCloseTo(0, 1);
    expect(seasonalAt(cal, new Date(Date.UTC(2026, 7, 15)))).toBeCloseTo(1, 1);
    const edge = seasonalAt(cal, new Date(Date.UTC(2026, 6, 1)));
    expect(edge).toBeGreaterThan(0.3);
    expect(edge).toBeLessThan(0.8);
  });
  it("waterTempFactor peaks at the optimum and collapses far outside the range", () => {
    expect(waterTempFactor(58, striper)).toBeCloseTo(1, 2);
    expect(waterTempFactor(50, striper)).toBeLessThan(waterTempFactor(56, striper));
    expect(waterTempFactor(85, striper)).toBeLessThanOrEqual(0.1);
  });
  it("tideFactor prefers moving water and honors preferred tide", () => {
    expect(tideFactor({ stage: "slack", rateFtPerHr: 0 }, {})).toBeLessThan(tideFactor({ stage: "falling", rateFtPerHr: -0.8 }, {}));
    const flats = { preferredTide: "incoming" as const };
    expect(tideFactor({ stage: "rising", rateFtPerHr: 0.5 }, flats)).toBeGreaterThan(tideFactor({ stage: "falling", rateFtPerHr: -0.5 }, flats));
  });
  it("lightFactor: low light is best for stripers; sun is best for sight-fished flats species", () => {
    expect(lightFactor(0, striper)).toBe(1);
    expect(lightFactor(-20, striper)).toBeGreaterThan(lightFactor(60, striper));
    expect(lightFactor(60, { preferredTide: "incoming" })).toBe(1);
    expect(lightFactor(-20, { preferredTide: "incoming" })).toBeLessThan(0.3);
  });
  it("windFactor and pressureFactor", () => {
    expect(windFactor(10)).toBe(1);
    expect(windFactor(30)).toBe(0);
    expect(windFactor(20)).toBeLessThan(windFactor(14));
    expect(pressureFactor(-2)).toBe(1);
    expect(pressureFactor(3)).toBeLessThan(pressureFactor(0));
  });
});

describe("scoreHour", () => {
  const base = { reportsSignal: 0.8, seasonal: 0.9, waterTempF: 58, tide: { stage: "falling" as const, rateFtPerHr: -0.9 }, sunAltDeg: 2, windKt: 10, pressureChange6hMb: -2, solunar: "major" as const };
  it("gives a high score in ideal conditions with a breakdown that sums to the score", () => {
    const r = scoreHour(base, striper);
    expect(r.score).toBeGreaterThan(85);
    expect(Math.round(r.factors.reduce((a, f) => a + f.points, 0))).toBe(r.score);
    expect(r.missing).toEqual([]);
  });
  it("skips missing data instead of guessing", () => {
    const r = scoreHour({ ...base, waterTempF: null, windKt: null }, striper);
    expect(r.missing).toEqual(expect.arrayContaining(["waterTemp", "wind"]));
    expect(r.factors.find((f) => f.key === "waterTemp")).toBeUndefined();
  });
  it("drops tide entirely for freshwater", () => {
    const r = scoreHour({ ...base, tide: null, noTide: true }, striper);
    expect(r.missing).not.toContain("tide");
  });
  it("caps the score for dangerous conditions", () => {
    const warned = scoreHour({ ...base, safety: { dangerousAlert: true, waveFt: 2, safeWaveFt: 4 } }, striper);
    expect(warned.safetyCapped).toBe(true);
    expect(warned.score).toBeLessThanOrEqual(35);
    const rough = scoreHour({ ...base, safety: { dangerousAlert: false, waveFt: 7, safeWaveFt: 4 } }, striper);
    expect(rough.safetyNote).toMatch(/7 ft/);
    const fine = scoreHour({ ...base, safety: { dangerousAlert: false, waveFt: 2, safeWaveFt: 4 } }, striper);
    expect(fine.safetyCapped).toBe(false);
  });
});

describe("status, quick score and windows", () => {
  it("runStatus labels", () => {
    expect(runStatus(0.9, 0.9, 0.9)).toBe("hot");
    expect(runStatus(0.5, 0.9, 0.3)).toBe("tapering");
    expect(runStatus(0.2, 0.3, 0.8)).toBe("starting");
    expect(runStatus(0, 0.8, 0.8)).toBe("in_season");
    expect(runStatus(0, 0.1, 0.1)).toBe("out_of_season");
  });
  it("quickScore is bounded", () => {
    expect(quickScore(0, 0)).toBe(0);
    expect(quickScore(1, 1)).toBe(100);
  });
  it("bestWindows finds contiguous high-score runs, best first", () => {
    const hours = Array.from({ length: 24 }, (_, i) => ({ time: new Date(Date.UTC(2026, 10, 9, i)).toISOString(), score: i >= 5 && i <= 7 ? 80 : i >= 18 && i <= 19 ? 90 : 30 }));
    const w = bestWindows(hours);
    expect(w[0].peak).toBe(90);
    expect(w[0].start).toBe(hours[18].time);
    expect(w[1].start).toBe(hours[5].time);
    expect(new Date(w[1].end).getUTCHours()).toBe(8);
  });
});
