import type { Metadata } from "next";
import Link from "next/link";
import { sql } from "drizzle-orm";
import { TrendingDown, TrendingUp } from "lucide-react";
import { db } from "@/db";
import { Badge } from "@/components/ui/badge";
import { LureIllustration } from "@/components/fish/lure-illustration";
import { getTopBaits, getTopLures } from "@/lib/data";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Top Lures Working Now" };
export const dynamic = "force-dynamic";

type SP = { water?: "salt" | "fresh"; species?: string; zone?: string; tab?: "lures" | "baits" };
const ZONES: Record<string, string> = { northeast: "New England & NY", midatl: "NJ–Outer Banks", southeast: "Southeast", keys: "Florida Keys", gulf: "Gulf", socal: "SoCal", norcal: "NorCal", pnw: "Pacific NW", alaska: "Alaska", "fw-northeast": "NE freshwater", "fw-great-lakes": "Great Lakes", "fw-south": "South freshwater", "fw-west": "West freshwater" };

export default async function LuresPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const speciesRow = sp.species ? (await db.execute<{ id: number; name: string }>(sql`select id, common_name as name from species where slug = ${sp.species}`))[0] : null;
  const [lures, baits, speciesOpts] = await Promise.all([
    getTopLures({ water: sp.water, zone: sp.zone, speciesId: speciesRow?.id, days: 14, limit: 24 }),
    getTopBaits({ water: sp.water, speciesId: speciesRow?.id, days: 14, limit: 16 }),
    db.execute<{ slug: string; name: string }>(sql`select slug, common_name as name from species order by common_name`),
  ]);
  const q = (patch: Partial<SP>) => "?" + new URLSearchParams(Object.entries({ ...sp, ...patch }).filter(([, v]) => v) as [string, string][]).toString();
  const tab = sp.tab ?? "lures";
  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6">
      <header>
        <h1 className="text-3xl font-bold">Top lures working now</h1>
        <p className="mt-1 text-sm text-muted-foreground">Ranked by mentions in verified reports and logged catches over the last 14 days, weighted toward the most recent.</p>
      </header>
      <form className="flex flex-wrap items-end gap-3 text-sm" action="/lures">
        <label className="flex flex-col gap-1"><span className="text-xs text-muted-foreground">Water</span>
          <select name="water" defaultValue={sp.water ?? ""} className="h-9 rounded-md border border-border bg-background px-2"><option value="">All</option><option value="salt">Saltwater</option><option value="fresh">Freshwater</option></select></label>
        <label className="flex flex-col gap-1"><span className="text-xs text-muted-foreground">Species</span>
          <select name="species" defaultValue={sp.species ?? ""} className="h-9 rounded-md border border-border bg-background px-2"><option value="">All species</option>{speciesOpts.map((s) => <option key={s.slug} value={s.slug}>{s.name}</option>)}</select></label>
        <label className="flex flex-col gap-1"><span className="text-xs text-muted-foreground">Region</span>
          <select name="zone" defaultValue={sp.zone ?? ""} className="h-9 rounded-md border border-border bg-background px-2"><option value="">Everywhere</option>{Object.entries(ZONES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <input type="hidden" name="tab" value={tab} />
        <button className="h-9 rounded-md bg-primary px-4 font-medium text-primary-foreground">Filter</button>
      </form>
      <div className="flex gap-2 border-b border-border">
        {(["lures", "baits"] as const).map((t) => <Link key={t} href={q({ tab: t })} className={cn("-mb-px border-b-2 px-3 py-2 text-sm font-medium", tab === t ? "border-primary text-foreground" : "border-transparent text-muted-foreground")}>{t === "lures" ? "Top lures" : "Top baits"}</Link>)}
      </div>
      {tab === "lures" ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {lures.map((l, i) => {
            const trend = l.mentions14 - l.prev14;
            return (
              <Link key={l.slug} href={`/lures/${l.slug}`} className="rounded-xl border border-border bg-surface p-4 hover:border-primary">
                <div className="flex items-start gap-3">
                  <span className="text-2xl font-bold text-muted-foreground">#{i + 1}</span>
                  <div className="flex h-20 flex-1 items-center justify-center rounded-lg bg-muted"><LureIllustration type={l.type} seed={l.id} className="h-16" /></div>
                </div>
                <p className="mt-3 font-semibold">{l.brand} {l.model}</p>
                <p className="text-xs capitalize text-muted-foreground">{l.type.replace("_", " ")}{l.sizes.length ? ` · ${l.sizes.slice(0, 3).join(", ")}` : ""}{l.colors.length ? ` · ${l.colors.slice(0, 2).join(", ")}` : ""}</p>
                <p className="mt-2 flex items-center gap-2 text-sm"><b>{l.mentions14}</b> mentions · {l.mentions7} this week
                  {trend !== 0 && <span className={cn("inline-flex items-center gap-0.5 text-xs", trend > 0 ? "text-verified" : "text-danger")}>{trend > 0 ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}{Math.abs(trend)}</span>}
                  {l.demoOnly && <Badge variant="demo">Demo</Badge>}</p>
                <p className="mt-1 text-xs text-muted-foreground">Working on: {l.species.slice(0, 4).join(", ")}</p>
                <p className="text-xs text-muted-foreground">Hot in: {l.regions.slice(0, 6).join(", ")}</p>
                <p className="mt-2 line-clamp-2 text-xs">{l.howToFish}</p>
              </Link>
            );
          })}
          {lures.length === 0 && <p className="text-sm text-muted-foreground">No lure mentions match these filters in the last 14 days.</p>}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {baits.map((b) => (
            <div key={b.slug} className="rounded-xl border border-border bg-surface p-4 text-sm">
              <p className="font-semibold">{b.name} {b.isLive && <Badge variant="outline">live</Badge>} {b.demoOnly && <Badge variant="demo">Demo</Badge>}</p>
              <p className="text-xs text-muted-foreground">{b.mentions} mentions · {b.species.filter(Boolean).slice(0, 4).join(", ")}</p>
              <p className="mt-2 text-xs">{b.rigging}</p>
            </div>
          ))}
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">Product photos: FishRadar only shows images it is licensed to use (manufacturer media kits or affiliate product feeds). Until those are connected, lures are shown as illustrations. Buy links may be affiliate links — we may earn a commission.</p>
    </div>
  );
}
