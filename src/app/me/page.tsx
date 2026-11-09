import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";
import { Bell, Trash2 } from "lucide-react";
import { auth } from "@/auth";
import { db } from "@/db";
import { createAlert, deleteAlert, markNotificationsRead, updateProfile } from "@/app/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CatchCard } from "@/components/fr/catch-card";
import { getCatches } from "@/lib/data";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "My FishRadar" };

type SP = { tab?: string; spot?: string; spotName?: string; species?: string; speciesName?: string; created?: string; error?: string };
const field = "h-9 w-full rounded-md border border-border bg-background px-2 text-sm";

export default async function MePage({ searchParams }: { searchParams: Promise<SP> }) {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  const sp = await searchParams;
  const tab = sp.tab ?? (sp.spot || sp.species ? "alerts" : "saved");
  const uid = session.user.id;
  const [[me], saved, alerts, notes, catches, lifeList, species, spots] = await Promise.all([
    db.execute<{ name: string | null; handle: string | null; bio: string | null; email: string | null; role: string }>(sql`select name, handle, bio, email, role from "user" where id = ${uid}`),
    db.execute<{ slug: string; name: string; water: string; state: string | null }>(sql`select s.slug, s.name, s.water_type as water, r.state_code as state from saved_spots x join spots s on s.id = x.spot_id left join regions r on r.id = s.region_id where x.user_id = ${uid} order by x.created_at desc`),
    db.execute<{ id: number; name: string; condition: { type: string; value?: number }; radiusMi: number | null; spotName: string | null; speciesName: string | null; lastTriggeredAt: string | null; enabled: boolean }>(sql`select a.id, a.name, a.condition, a.radius_mi as "radiusMi", s.name as "spotName", sp.common_name as "speciesName", a.last_triggered_at as "lastTriggeredAt", a.enabled from alerts a left join spots s on s.id = a.spot_id left join species sp on sp.id = a.species_id where a.user_id = ${uid} order by a.created_at desc`),
    db.execute<{ id: number; title: string; body: string; url: string | null; readAt: string | null; createdAt: string; emailedAt: string | null }>(sql`select id, title, body, url, read_at as "readAt", created_at as "createdAt", emailed_at as "emailedAt" from notifications where user_id = ${uid} order by created_at desc limit 50`),
    getCatches({ userId: uid, limit: 48 }),
    db.execute<{ name: string; n: number; best: number | null }>(sql`select sp.common_name as name, count(*)::int n, max(c.length_in) best from catches c join species sp on sp.id = c.species_id where c.user_id = ${uid} group by sp.id order by n desc`),
    db.execute<{ id: number; name: string }>(sql`select id, common_name as name from species order by common_name`),
    db.execute<{ id: number; name: string; state: string | null }>(sql`select s.id, s.name, r.state_code as state from spots s left join regions r on r.id = s.region_id order by r.state_code, s.name`),
  ]);
  const unread = notes.filter((n) => !n.readAt).length;
  const tabs = [["saved", "Saved spots"], ["alerts", "Alerts"], ["notifications", `Notifications${unread ? ` (${unread})` : ""}`], ["catches", "My catches"], ["profile", "Profile"]];

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6">
      <header><h1 className="text-2xl font-bold">My FishRadar</h1><p className="text-sm text-muted-foreground">{me.name ?? me.email} {me.handle && <>· <Link href={`/u/${me.handle}`} className="text-primary hover:underline">@{me.handle}</Link></>} · <Badge variant="outline">{me.role}</Badge></p></header>
      <nav className="flex flex-wrap gap-1 border-b border-border">{tabs.map(([k, l]) => <Link key={k} href={`/me?tab=${k}`} className={cn("-mb-px border-b-2 px-3 py-2 text-sm font-medium", tab === k ? "border-primary" : "border-transparent text-muted-foreground")}>{l}</Link>)}</nav>

      {tab === "saved" && (
        <ul className="grid gap-2 sm:grid-cols-2">
          {saved.map((s) => <li key={s.slug}><Link href={`/spot/${s.slug}`} className="block rounded-lg border border-border bg-surface p-3 hover:border-primary"><span className="font-medium">{s.name}</span> <span className="text-xs text-muted-foreground">{s.state} · {s.water === "fresh" ? "freshwater" : "saltwater"}</span></Link></li>)}
          {saved.length === 0 && <p className="text-sm text-muted-foreground">No saved spots yet — open a spot and tap “Save spot”.</p>}
        </ul>
      )}

      {tab === "alerts" && (
        <div className="grid gap-6 md:grid-cols-[1fr_320px]">
          <div>
            {sp.created && <p className="mb-3 rounded-md border border-verified bg-verified/10 p-2 text-sm">Alert created. Alerts are checked every 15 minutes by the worker.</p>}
            <ul className="space-y-2">
              {alerts.map((a) => (
                <li key={a.id} className="flex items-start gap-3 rounded-lg border border-border bg-surface p-3 text-sm">
                  <Bell className="mt-0.5 size-4 text-primary" />
                  <div className="flex-1"><p className="font-medium">{a.name}</p><p className="text-xs text-muted-foreground">{a.condition.type === "report" ? `${a.speciesName ?? "Any species"} reported within ${a.radiusMi ?? 25} mi${a.spotName ? ` of ${a.spotName}` : ""}` : a.condition.type === "score_above" ? `Fishing Score above ${a.condition.value} at ${a.spotName}` : `Water temp ${a.condition.type === "water_temp_below" ? "below" : "above"} ${a.condition.value}°F at ${a.spotName}`} · last fired {a.lastTriggeredAt ? timeAgo(a.lastTriggeredAt) : "never"}</p></div>
                  <form action={deleteAlert.bind(null, a.id)}><Button size="icon" variant="ghost" aria-label="Delete alert"><Trash2 /></Button></form>
                </li>
              ))}
              {alerts.length === 0 && <p className="text-sm text-muted-foreground">No alerts yet.</p>}
            </ul>
          </div>
          <form action={createAlert} className="space-y-3 rounded-xl border border-border bg-surface p-4 text-sm">
            <h2 className="font-semibold">New alert</h2>
            <label className="block"><span className="mb-1 block text-xs">Name</span><Input name="name" required defaultValue={sp.speciesName ? `${sp.speciesName} near me` : sp.spotName ? `${sp.spotName} alert` : ""} /></label>
            <label className="block"><span className="mb-1 block text-xs">Notify me when…</span>
              <select name="type" className={field} defaultValue="report"><option value="report">A species is reported nearby</option><option value="score_above">Fishing Score goes above…</option><option value="water_temp_below">Water temp drops below…</option><option value="water_temp_above">Water temp rises above…</option></select></label>
            <label className="block"><span className="mb-1 block text-xs">Value (score or °F)</span><Input name="value" type="number" placeholder="e.g. 80 or 58" /></label>
            <label className="block"><span className="mb-1 block text-xs">Species</span><select name="speciesId" className={field} defaultValue={sp.species ?? ""}><option value="">Any</option>{species.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
            <label className="block"><span className="mb-1 block text-xs">Spot (center)</span><select name="spotId" className={field} defaultValue={sp.spot ?? ""}><option value="">—</option>{spots.map((s) => <option key={s.id} value={s.id}>{s.state} — {s.name}</option>)}</select></label>
            <label className="block"><span className="mb-1 block text-xs">Radius (miles)</span><Input name="radiusMi" type="number" defaultValue={25} min={1} max={200} /></label>
            <p className="text-[11px] text-muted-foreground">Delivered in-app{process.env.AUTH_RESEND_KEY ? " and by email" : " (email needs a Resend key)"}. Web push is planned.</p>
            <Button className="w-full">Create alert</Button>
          </form>
        </div>
      )}

      {tab === "notifications" && (
        <div>
          {unread > 0 && <form action={markNotificationsRead}><Button size="sm" variant="outline">Mark all read</Button></form>}
          <ul className="mt-3 space-y-2">
            {notes.map((n) => <li key={n.id} className={cn("rounded-lg border p-3 text-sm", n.readAt ? "border-border" : "border-primary bg-primary/5")}><p className="font-medium">{n.url ? <Link href={n.url} className="hover:underline">{n.title}</Link> : n.title}</p><p className="text-muted-foreground">{n.body}</p><p className="text-xs text-muted-foreground">{timeAgo(n.createdAt)}{n.emailedAt ? " · emailed" : ""}</p></li>)}
            {notes.length === 0 && <p className="text-sm text-muted-foreground">No notifications yet.</p>}
          </ul>
        </div>
      )}

      {tab === "catches" && (
        <div className="space-y-6">
          <div><h2 className="mb-2 font-semibold">Species life list ({lifeList.length})</h2><div className="flex flex-wrap gap-2">{lifeList.map((l) => <span key={l.name} className="rounded-full border border-border px-3 py-1 text-sm">{l.name} · {l.n}{l.best ? ` · best ${l.best}"` : ""}</span>)}</div></div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{catches.map((c) => <CatchCard key={c.id} c={c} />)}</div>
          {catches.length === 0 && <p className="text-sm text-muted-foreground"><Link href="/catches/new" className="text-primary hover:underline">Log your first catch</Link>.</p>}
        </div>
      )}

      {tab === "profile" && (
        <form action={updateProfile} className="max-w-md space-y-3 text-sm">
          {sp.error === "handle" && <p className="text-danger">That handle is taken.</p>}
          <label className="block"><span className="mb-1 block text-xs">Display name</span><Input name="name" defaultValue={me.name ?? ""} /></label>
          <label className="block"><span className="mb-1 block text-xs">Handle</span><Input name="handle" defaultValue={me.handle ?? ""} pattern="[a-z0-9_-]+" /></label>
          <label className="block"><span className="mb-1 block text-xs">Bio</span><textarea name="bio" defaultValue={me.bio ?? ""} maxLength={300} rows={3} className="w-full rounded-md border border-border bg-background p-2" /></label>
          <Button>Save profile</Button>
        </form>
      )}
    </div>
  );
}
