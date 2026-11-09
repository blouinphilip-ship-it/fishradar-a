import { NextResponse } from "next/server";
import { cached } from "@/lib/cache";
import { getSpotMarkers } from "@/lib/data";

export const dynamic = "force-dynamic";

/** Globe markers: every spot with quick score, active-run flag and top species. */
export async function GET() {
  const markers = await cached("api:markers:v1", 300, () => getSpotMarkers());
  return NextResponse.json({ markers, generatedAt: new Date().toISOString() }, { headers: { "Cache-Control": "public, max-age=60" } });
}
