import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { alerts, notifications, users } from "@/db/schema";
import { env } from "@/lib/env";
import { getConditions } from "@/lib/conditions";
import { getSpeciesAtSpot, getSpot } from "@/lib/data";

export type AlertCondition =
  | { type: "report" }
  | { type: "score_above"; value: number }
  | { type: "water_temp_below"; value: number }
  | { type: "water_temp_above"; value: number };

/** Evaluate every enabled alert; create in-app notifications (and email when Resend is configured). */
export async function evaluateAlerts(): Promise<{ checked: number; fired: number }> {
  const rows = await db.execute<{ id: number; userId: string; name: string; speciesId: number | null; spotId: number | null; spotSlug: string | null; lat: number | null; lon: number | null; radiusMi: number | null; condition: AlertCondition; lastTriggeredAt: string | null; email: string | null; speciesName: string | null }>(sql`
    select a.id, a.user_id as "userId", a.name, a.species_id as "speciesId", a.spot_id as "spotId", s.slug as "spotSlug",
      coalesce(ST_Y(a.center), ST_Y(s.location)) as lat, coalesce(ST_X(a.center), ST_X(s.location)) as lon, a.radius_mi as "radiusMi", a.condition,
      a.last_triggered_at as "lastTriggeredAt", u.email, sp.common_name as "speciesName"
    from alerts a join "user" u on u.id = a.user_id left join spots s on s.id = a.spot_id left join species sp on sp.id = a.species_id
    where a.enabled`);
  let fired = 0;
  for (const a of rows) {
    const since = a.lastTriggeredAt ? new Date(a.lastTriggeredAt) : new Date(Date.now() - 86_400_000);
    let hit: { title: string; body: string; url: string } | null = null;
    try {
      if (a.condition.type === "report" && a.lat != null && a.lon != null) {
        const r = await db.execute<{ spotName: string; spotSlug: string; summary: string; publishedAt: string }>(sql`
          select s.name as "spotName", s.slug as "spotSlug", r.summary, r.published_at as "publishedAt"
          from report_mentions m join reports r on r.id = m.report_id join spots s on s.id = m.spot_id
          where r.review_status = 'approved' and r.created_at > ${since.toISOString()} and r.is_demo = false
            ${a.speciesId ? sql`and m.species_id = ${a.speciesId}` : sql``}
            and ST_DWithin(s.location::geography, ST_SetSRID(ST_MakePoint(${a.lon}, ${a.lat}), 4326)::geography, ${(a.radiusMi ?? 25) * 1609.344})
          order by r.published_at desc limit 1`);
        if (r[0]) hit = { title: `${a.speciesName ?? "Fish"} reported near you`, body: `${r[0].spotName}: ${r[0].summary}`, url: `/spot/${r[0].spotSlug}` };
      } else if (a.spotSlug) {
        const spot = await getSpot(a.spotSlug);
        if (spot && a.condition.type === "score_above") {
          const sp = (await getSpeciesAtSpot(spot)).filter((x) => !a.speciesId || x.speciesId === a.speciesId)[0];
          const score = sp ? Math.round((sp.signal * 30 + sp.seasonalNow * 20) / 50 * 100) : 0;
          if (score >= a.condition.value) hit = { title: `${spot.name}: Fishing Score ${score}`, body: `${sp?.commonName ?? "Fishing"} looks good right now.`, url: `/spot/${spot.slug}` };
        } else if (spot && (a.condition.type === "water_temp_below" || a.condition.type === "water_temp_above")) {
          const t = (await getConditions(spot)).now.waterTempF;
          const v = a.condition.value;
          if (t != null && (a.condition.type === "water_temp_below" ? t < v : t > v)) hit = { title: `${spot.name}: water ${t}°F`, body: `Water temperature is ${a.condition.type === "water_temp_below" ? "below" : "above"} your ${v}°F threshold.`, url: `/spot/${spot.slug}` };
        }
      }
    } catch {
      continue;
    }
    if (!hit) continue;
    // don't re-fire a non-report alert more than once every 12 hours
    if (a.condition.type !== "report" && a.lastTriggeredAt && Date.now() - +new Date(a.lastTriggeredAt) < 12 * 3_600_000) continue;
    const [n] = await db.insert(notifications).values({ userId: a.userId, alertId: a.id, ...hit }).returning({ id: notifications.id });
    await db.update(alerts).set({ lastTriggeredAt: new Date() }).where(eq(alerts.id, a.id));
    if (env.AUTH_RESEND_KEY && a.email) {
      const ok = await sendEmail(a.email, `FishRadar: ${hit.title}`, `${hit.body}\n\nOpen: ${process.env.AUTH_URL ?? "http://localhost:3000"}${hit.url}`);
      if (ok) await db.update(notifications).set({ emailedAt: new Date() }).where(and(eq(notifications.id, n.id)));
    }
    fired++;
  }
  void users;
  return { checked: rows.length, fired };
}

async function sendEmail(to: string, subject: string, text: string) {
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST", headers: { Authorization: `Bearer ${env.AUTH_RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env.AUTH_EMAIL_FROM, to, subject, text }),
    });
    return r.ok;
  } catch {
    return false;
  }
}
