import { describe, expect, it } from "vitest";
import { dayOfYear, degToCompass, fuzzPoint, haversineMi } from "@/lib/geo";

describe("geo", () => {
  it("haversine distance Montauk → Block Island is ~16 mi", () => {
    expect(haversineMi(41.071, -71.857, 41.17, -71.56)).toBeGreaterThan(15);
    expect(haversineMi(41.071, -71.857, 41.17, -71.56)).toBeLessThan(18);
  });
  it("fuzzPoint snaps to a ~2 mile grid, is deterministic, and stays close", () => {
    const a = fuzzPoint(41.07123, -71.85789);
    expect(fuzzPoint(41.07123, -71.85789)).toEqual(a);
    expect(fuzzPoint(41.0713, -71.8579)).toEqual(a); // nearby points collapse to the same cell
    expect(haversineMi(41.07123, -71.85789, a.lat, a.lon)).toBeLessThan(2);
    expect(a.lat).not.toBe(41.07123);
  });
  it("compass + day of year", () => {
    expect(degToCompass(0)).toBe("N");
    expect(degToCompass(315)).toBe("NW");
    expect(degToCompass(null)).toBe("—");
    expect(dayOfYear(new Date(Date.UTC(2026, 0, 1)))).toBe(1);
    expect(dayOfYear(new Date(Date.UTC(2026, 10, 9)))).toBe(313);
  });
});
