import { NextResponse } from "next/server";
import { getConditions } from "@/lib/conditions";
import { getSpot } from "@/lib/data";

export const dynamic = "force-dynamic";

/** Compact live conditions for the side panel. */
export async function GET(_: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const spot = await getSpot(slug);
  if (!spot) return NextResponse.json({ error: "not found" }, { status: 404 });
  const c = await getConditions(spot);
  return NextResponse.json({ now: c.now, astro: c.astro[0], alerts: c.alerts.ok ? c.alerts.data.slice(0, 3) : [] });
}
