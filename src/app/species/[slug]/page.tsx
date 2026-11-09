import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { ReportCard } from "@/components/fr/report-card";
import { SeasonBar } from "@/components/fr/season-bar";
import { MiniMap } from "@/components/fr/mini-map";
import { ReportTimeline } from "@/components/fr/charts";
import { SpeciesPhoto } from "@/components/fish/species-photo";
import { getReportTimeline, getReports, getSpecies, getSpeciesSeasons, getSpeciesSpots, getTackle, getTopLures, listRuns, listSpots } from "@/lib/data";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const s = await getSpecies((await params).slug);
  return { title: s ? `${s.commonName} — where & how to catch` : "Species not found", description: s?.description ?? undefined };
}

export default async function SpeciesPage({ params }: Props) {
  const s = await getSpecies((await params).slug);
  if (!s) notFound();
  const [seasons, spots, allSpots, reports, lures, tackle, timeline, runs] = await Promise.all([
    getSpeciesSeasons(s.id), getSpeciesSpots(s.id), listSpots(), getReports({ speciesId: s.id, days: 14, limit: 6 }), getTopLures({ speciesId: s.id, limit: 6 }), getTackle(s.id), getReportTimeline(s.id, undefined, 60), listRuns(),
  ]);
  const myRuns = runs.filter((r) => r.speciesSlug === s.slug);
  const pts = allSpots.filter((x) => spots.some((y) => y.slug === x.slug)).map((x) => ({ lat: x.lat, lon: x.lon, color: x.waterType === "fresh" ? "#2fa36b" : "#2f7fe0", label: x.name, href: `/spot/${x.slug}/species/${s.slug}` }));
  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-6">
      <header className="grid gap-6 md:grid-cols-[380px_1fr]">
        <SpeciesPhoto slug={s.slug} scientificName={s.scientificName} name={s.commonName} className="h-56 w-full rounded-xl" />
        <div>
          <h1 className="text-3xl font-bold">{s.commonName}</h1>
          <p className="text-sm italic text-muted-foreground">{s.scientificName}</p>
          {s.nicknames.length > 0 && <p className="mt-1 text-sm">Also called: {s.nicknames.join(", ")}</p>}
          <p className="mt-3 text-sm">{s.description}</p>
          <p className="mt-3 text-sm"><span className="text-muted-foreground">Preferred water:</span> {s.tempMinF}–{s.tempMaxF}°F (best ~{s.tempOptF}°F)</p>
          {myRuns.length > 0 && <p className="mt-2 text-sm">Runs: {myRuns.map((r) => <Link key={r.slug} href={`/runs/${r.slug}`} className="mr-2 text-primary hover:underline">{r.name}</Link>)}</p>}
        </div>
      </header>
      <section className="grid gap-6 lg:grid-cols-2">
        <div><h2 className="mb-2 text-xl font-semibold">Where to catch them</h2><MiniMap points={pts} className="h-80 w-full rounded-xl" animatePath={false} /></div>
        <div>
          <h2 className="mb-2 text-xl font-semibold">Season by region <Badge variant="seasonal">seasonal</Badge></h2>
          <ul className="space-y-3">{seasons.map((z) => <li key={z.zone}><p className="text-xs text-muted-foreground">{z.name}</p><SeasonBar monthly={z.monthly} /></li>)}</ul>
          <h3 className="mb-1 mt-4 text-sm font-semibold">Reports per day (all spots)</h3><ReportTimeline data={timeline} />
        </div>
      </section>
      <section className="grid gap-6 lg:grid-cols-2">
        <div><h2 className="mb-2 text-xl font-semibold">Top lures now</h2><ul className="space-y-1 text-sm">{lures.map((l) => <li key={l.slug}><Link href={`/lures/${l.slug}`} className="hover:underline">{l.brand} {l.model}</Link> <span className="text-muted-foreground">· {l.mentions14}</span></li>)}</ul>
          {tackle && <p className="mt-3 text-sm"><span className="font-semibold">Tackle:</span> {tackle.rod}; {tackle.line}; {tackle.leader}. {tackle.hooks}.</p>}</div>
        <div><h2 className="mb-2 text-xl font-semibold">Spots ({spots.length})</h2><ul className="columns-2 text-sm">{spots.map((x) => <li key={x.slug}><Link href={`/spot/${x.slug}/species/${s.slug}`} className="hover:underline">{x.name}</Link> <span className="text-xs text-muted-foreground">{x.state}</span></li>)}</ul></div>
      </section>
      <section><h2 className="mb-2 text-xl font-semibold">Latest reports</h2><div className="grid gap-3 md:grid-cols-2">{reports.map((r) => <ReportCard key={r.id} r={r} />)}</div></section>
      <p className="text-[11px] text-muted-foreground">Photo: iNaturalist (Creative Commons; credit shown on hover) or an illustration when no licensed photo is available.</p>
    </div>
  );
}
