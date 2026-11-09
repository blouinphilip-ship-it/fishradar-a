import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { cached } from "@/lib/cache";

export const dynamic = "force-dynamic";

/** Report density points for the globe heatmap layer. */
export async function GET(req: Request) {
  const days = Math.min(60, Math.max(1, Number(new URL(req.url).searchParams.get("days") ?? 14)));
  const pts = await cached(`api:heat:${days}`, 300, () => db.execute<{ lat: number; lon: number; n: number }>(sql`
    select ST_Y(s.location) as lat, ST_X(s.location) as lon, count(distinct m.report_id)::int as n
    from report_mentions m join reports r on r.id = m.report_id join spots s on s.id = m.spot_id
    where r.review_status = 'approved' and m.published_at > now() - make_interval(days => ${days}) group by s.id`));
  return NextResponse.json({
    type: "FeatureCollection",
    features: pts.map((p) => ({ type: "Feature", properties: { n: p.n }, geometry: { type: "Point", coordinates: [p.lon, p.lat] } })),
  });
}
