import { NextResponse } from "next/server";
import { z } from "zod";
import { nearestSpots } from "@/lib/data";

export const dynamic = "force-dynamic";

const Q = z.object({ lat: z.coerce.number().min(-90).max(90), lon: z.coerce.number().min(-180).max(180), water: z.enum(["salt", "fresh"]).optional() });

export async function GET(req: Request) {
  const p = Q.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!p.success) return NextResponse.json({ error: "lat and lon required" }, { status: 400 });
  return NextResponse.json({ spots: await nearestSpots(p.data.lat, p.data.lon, 8, p.data.water) });
}
