import { NextResponse } from "next/server";
import { getReports, getSpeciesAtSpot, getSpot } from "@/lib/data";
import { quickScore, RUN_STATUS_LABEL } from "@/lib/scoring";

export const dynamic = "force-dynamic";

/** Lightweight spot preview for the globe side panel (no live API calls). */
export async function GET(_: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const spot = await getSpot(slug);
  if (!spot) return NextResponse.json({ error: "not found" }, { status: 404 });
  const species = await getSpeciesAtSpot(spot);
  const reports = await getReports({ spotId: spot.id, days: 14, limit: 3 });
  return NextResponse.json({
    spot: { slug: spot.slug, name: spot.name, water: spot.waterType, state: spot.stateName, description: spot.description, lat: spot.lat, lon: spot.lon, accessModes: spot.accessModes },
    score: species[0] ? quickScore(species[0].signal, species[0].seasonalNow) : 0,
    running: species.filter((s) => s.signal > 0.12).slice(0, 5).map((s) => ({ slug: s.slug, name: s.commonName, status: s.status, label: RUN_STATUS_LABEL[s.status], reportsThisWeek: s.reportsThisWeek, lastReportAt: s.lastReportAt })),
    seasonal: species.filter((s) => s.signal <= 0.12 && s.seasonalNow >= 0.4).slice(0, 5).map((s) => ({ slug: s.slug, name: s.commonName })),
    reports: reports.map((r) => ({ id: r.id, summary: r.summary, publishedAt: r.publishedAt, isDemo: r.isDemo, sourceName: r.sourceName })),
  });
}
