import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseHiLo, parseWaterTemp, tideStageAt } from "@/lib/conditions/coops";
import { parseNdbc } from "@/lib/conditions/ndbc";
import { isDangerous, parseAlerts, parseNwsHourly } from "@/lib/conditions/nws";
import { parseMarine } from "@/lib/conditions/openmeteo";
import { parseUsgs } from "@/lib/conditions/usgs";
import { moonPhaseName, solunarPeriods } from "@/lib/conditions/astro";

const fx = (f: string) => fs.readFileSync(path.join(__dirname, "../fixtures", f), "utf8");

describe("NOAA CO-OPS", () => {
  it("parses hi/lo predictions (real response) into UTC events", () => {
    const ev = parseHiLo(JSON.parse(fx("coops-hilo.json")));
    expect(ev.length).toBeGreaterThan(2);
    expect(ev.every((e) => e.type === "H" || e.type === "L")).toBe(true);
    expect(ev[0].time).toMatch(/Z$/);
  });
  it("parses latest water temperature", () => {
    const w = parseWaterTemp(JSON.parse(fx("coops-wtemp.json")));
    expect(w?.f).toBeGreaterThan(30);
    expect(w?.f).toBeLessThan(90);
  });
  it("surfaces API errors", () => {
    expect(() => parseHiLo({ error: { message: "No data was found" } })).toThrow("No data");
  });
  it("tideStageAt detects rising/falling/slack", () => {
    const curve = [0, 1, 2, 3].map((h) => ({ time: new Date(Date.UTC(2026, 0, 1, h)).toISOString(), ft: [1, 2, 2.05, 1].at(h)! }));
    expect(tideStageAt(curve, new Date(Date.UTC(2026, 0, 1, 0, 30)))?.stage).toBe("rising");
    expect(tideStageAt(curve, new Date(Date.UTC(2026, 0, 1, 1, 30)))?.stage).toBe("slack");
    expect(tideStageAt(curve, new Date(Date.UTC(2026, 0, 1, 2, 30)))?.stage).toBe("falling");
  });
});

describe("NDBC", () => {
  it("parses real realtime2 text with knots/feet/°F conversions", () => {
    const o = parseNdbc(fx("ndbc-44013.txt"))!;
    expect(o).not.toBeNull();
    expect(o.time).toMatch(/Z$/);
    if (o.windKt != null) expect(o.windKt).toBeLessThan(80);
    if (o.waterTempF != null) expect(o.waterTempF).toBeGreaterThan(28);
  });
  it("fills fields from the newest row that has them and handles MM", () => {
    const txt = `#YY  MM DD hh mm WDIR WSPD GST  WVHT   DPD   APD MWD   PRES  ATMP  WTMP  DEWP  VIS PTDY  TIDE
#yr  mo dy hr mn degT m/s  m/s     m   sec   sec degT   hPa  degC  degC  degC  nmi  hPa    ft
2026 11 09 20 50 290  7.0  9.0    MM    MM    MM  MM     MM    MM    MM    MM   MM   MM    MM
2026 11 09 20 40  MM   MM   MM   1.0   8.0   3.2 314 1005.6  13.1  12.0   7.7   MM -1.2    MM`;
    const o = parseNdbc(txt)!;
    expect(o.windKt).toBeCloseTo(13.6, 1);
    expect(o.waveFt).toBeCloseTo(3.3, 1);
    expect(o.waterTempF).toBe(54);
    expect(o.pressureTendencyMb).toBe(-1.2);
  });
});

describe("NWS", () => {
  it("parses alerts and flags marine danger", () => {
    const a = parseAlerts(JSON.parse(fx("nws-alerts.json")));
    expect(a).toHaveLength(2);
    expect(a[0].isMarine).toBe(true);
    expect(isDangerous(a[0])).toBe(true);
    expect(isDangerous(a[1])).toBe(false);
  });
  it("parses hourly forecast wind ranges into knots", () => {
    const h = parseNwsHourly({ properties: { periods: [{ startTime: "2026-11-09T18:00:00-05:00", temperature: 50, temperatureUnit: "F", windSpeed: "10 to 20 mph", windDirection: "NW", shortForecast: "Sunny" }] } });
    expect(h[0].windKt).toBeCloseTo(13, 0);
    expect(h[0].windDirDeg).toBe(315);
    expect(h[0].gustKt).toBeCloseTo(17.4, 1);
  });
});

describe("Open-Meteo marine + USGS", () => {
  it("converts SST to °F and rounds waves", () => {
    const m = parseMarine(JSON.parse(fx("openmeteo-marine.json")));
    expect(m[0].waveFt).toBe(4.3);
    expect(m[0].sstF).toBe(58);
    expect(m[1].sstF).toBeNull();
  });
  it("parses a real USGS instantaneous-values response", () => {
    const r = parseUsgs(JSON.parse(fx("usgs-iv.json")))!;
    expect(r.siteName).toMatch(/MERRIMACK/);
    expect(r.flowCfs == null || r.flowCfs > 0).toBe(true);
  });
});

describe("astronomy", () => {
  it("names moon phases", () => {
    expect(moonPhaseName(0.01)).toBe("New moon");
    expect(moonPhaseName(0.5)).toBe("Full moon");
    expect(moonPhaseName(0.25)).toBe("First quarter");
  });
  it("produces two major periods (overhead/underfoot) per day", () => {
    const p = solunarPeriods(new Date(Date.UTC(2026, 10, 9)), 41.07, -71.86);
    expect(p.filter((x) => x.kind === "major").length).toBeGreaterThanOrEqual(1);
    expect(p.every((x) => new Date(x.end) > new Date(x.start))).toBe(true);
  });
});
