import { describe, expect, it } from "vitest";
import { abundanceFrom, findMentions, heuristicExtract, sizeFrom, waterTempFrom } from "@/lib/ingest/heuristic";
import { ExtractionSchema } from "@/lib/ingest/schema";
import { parseFeed } from "@/worker/adapters";

const dict = {
  species: [{ slug: "striped-bass", terms: ["striped bass", "striper", "schoolie", "bass"] }, { slug: "bluefish", terms: ["bluefish", "blues"] }, { slug: "false-albacore", terms: ["false albacore", "albie"] }],
  lures: [{ slug: "daiwa-sp-minnow", terms: ["sp minnow", "daiwa sp", "sp"] }, { slug: "spro-bucktail", terms: ["bucktail", "white bucktail"] }, { slug: "rapala-original-floater", terms: ["minnow"] }],
  baits: [{ slug: "live-eels", terms: ["eel", "eels", "live eels"] }],
  spots: [{ slug: "montauk-point-ny", terms: ["montauk", "the point"] }, { slug: "hampton-harbor-nh", terms: ["hampton"] }],
};

describe("findMentions", () => {
  it("prefers the longest alias and doesn't double-count overlapping terms", () => {
    const m = findMentions("Good bass on the SP Minnow and white bucktails", dict.lures);
    expect(m.map((x) => x.slug)).toEqual(["daiwa-sp-minnow", "spro-bucktail"]);
  });
  it("matches whole words and simple plurals only", () => {
    expect(findMentions("albies everywhere", dict.species).map((x) => x.slug)).toEqual(["false-albacore"]);
    expect(findMentions("bassoon practice", dict.species)).toEqual([]);
  });
});

describe("heuristicExtract", () => {
  const text = "Blitz at Montauk this morning! Stripers 24-30 inches on white bucktails and SP Minnows, eels after dark. Water 56 degrees, NW 15 on the dropping tide.";
  it("pulls species, lures, bait, location, size and conditions", () => {
    const ex = heuristicExtract(text, dict, "2026-11-07");
    expect(ExtractionSchema.safeParse(ex).success).toBe(true);
    expect(ex.is_fishing_report).toBe(true);
    expect(ex.species.map((s) => s.name)).toContain("striper");
    expect(ex.species[0].abundance).toBe("excellent");
    expect(ex.lures.map((l) => l.raw)).toEqual(expect.arrayContaining(["white bucktail", "sp minnow"]));
    expect(ex.bait[0].raw).toBe("eels");
    expect(ex.locations[0].name).toBe("montauk");
    expect(ex.conditions_mentioned.water_temp_f).toBe(56);
    expect(ex.conditions_mentioned.tide).toBe("dropping");
  });
  it("rejects non-reports", () => {
    expect(heuristicExtract("Selling my used reel, $50, DM me", dict, null).is_fishing_report).toBe(false);
  });
  it("helpers", () => {
    expect(abundanceFrom("slow day, scratched out one")).toBe("slow");
    expect(sizeFrom("fish to 34 inches")).toBeNull();
    expect(sizeFrom("keepers 28-34 inches")).toBe("28-34 inches");
    expect(waterTempFrom("water temp is 61")).toBe(61);
  });
});

describe("RSS adapter", () => {
  it("parses RSS 2.0 items and strips HTML", () => {
    const xml = `<?xml version="1.0"?><rss version="2.0"><channel><title>Shop</title>
      <item><title>Weekly Report</title><link>https://shop.example/r/1</link><pubDate>Fri, 07 Nov 2026 12:00:00 GMT</pubDate><description><![CDATA[<p>Stripers at <b>Montauk</b> on bucktails &amp; eels.</p>]]></description><guid>r1</guid></item>
    </channel></rss>`;
    const items = parseFeed(xml);
    expect(items).toHaveLength(1);
    expect(items[0].text).toBe("Weekly Report. Stripers at Montauk on bucktails & eels.");
    expect(items[0].publishedAt.toISOString()).toBe("2026-11-07T12:00:00.000Z");
  });
});
