import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Bell, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { PredictionBadge, ReportKindBadge } from "@/components/fr/badges";
import { MiniMap, type MapPoint } from "@/components/fr/mini-map";
import { ReportCard } from "@/components/fr/report-card";
import { SpeciesPhoto } from "@/components/fish/species-photo";
import { getReports, getRun, getRunTracker, getSpecies, getTopLures } from "@/lib/data";
import { fmtDay, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

type Props = { params: Promise<{ run: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const run = await getRun((await params).run);
  return { title: run ? `${run.name} — Run Tracker` : "Run not found" };
}

const doyToDate = (doy: number) => new Date(Date.UTC(new Date().getUTCFullYear(), 0, ((doy - 1) % 365) + 1)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const ageColor = (d: number) => (d <= 2 ? "#ef4444" : d <= 5 ? "#f97316" : d <= 9 ? "#facc15" : d <= 14 ? "#a3a3a3" : "#525252");

export default async function RunPage({ params }: Props) {
  const run = await getRun((await params).run);
  if (!run) notFound();
  const [t, species] = await Promise.all([getRunTracker(run), getSpecies(run.speciesSlug)]);
  const states = run.seasonWindows.map((w) => w.regionSlug.toUpperCase());
  const [reports, lures] = await Promise.all([
    getReports({ speciesId: run.speciesId, stateCodes: states, days: 14, limit: 8 }),
    getTopLures({ speciesId: run.speciesId, days: 14, limit: 6 }),
  ]);
  const points: MapPoint[] = t.points.filter((p) => p.ageDays <= 21).map((p) => ({ lat: p.lat, lon: p.lon, color: ageColor(p.ageDays), radius: 7, opacity: Math.max(0.35, 1 - p.ageDays / 25), label: `${p.spotName} · ${fmtDay(p.publishedAt)}${p.isDemo ? " (demo)" : ""}`, href: `/spot/${p.spotSlug}/species/${run.speciesSlug}` }));
  // run path: centroid of each state's recent reports, in route order
  const path = states.map((st) => {
    const ps = t.points.filter((p) => p.state === st && p.ageDays <= 21);
    return ps.length ? ([ps.reduce((a, p) => a + p.lon, 0) / ps.length, ps.reduce((a, p) => a + p.lat, 0) / ps.length] as [number, number]) : null;
  }).filter(Boolean) as [number, number][];
  const timeline = t.points.slice(0, 40);
  const anyDemo = t.points.some((p) => p.isDemo);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-6">
      <nav className="text-xs text-muted-foreground"><Link href="/runs" className="hover:underline">Run Tracker</Link> / {run.name}</nav>
      <header className="grid gap-6 md:grid-cols-[1fr_280px]">
        <div>
          <h1 className="text-3xl font-bold">{run.name}</h1>
          <p className="mt-2 max-w-3xl text-sm">{run.description}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href={`/me?tab=alerts&species=${run.speciesId}&speciesName=${encodeURIComponent(run.speciesName)}`} className={buttonVariants({ size: "sm" })}><Bell /> Alert me when it&apos;s near me</Link>
            <Link href={`/assistant?q=${encodeURIComponent(`Where is the ${run.name.toLowerCase()} right now and where will it be in 10 days?`)}`} className={buttonVariants({ size: "sm", variant: "outline" })}><Sparkles /> Ask AI</Link>
          </div>
        </div>
        {species && <SpeciesPhoto slug={species.slug} scientificName={species.scientificName} name={species.commonName} className="h-40 w-full rounded-xl" />}
      </header>

      <section className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div>
          <MiniMap points={points} path={path} className="h-[420px] w-full rounded-xl" />
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span>Verified reports by age:</span>
            {[["today–2d", "#ef4444"], ["3–5d", "#f97316"], ["6–9d", "#facc15"], ["10–14d", "#a3a3a3"], ["older", "#525252"]].map(([l, c]) => <span key={l} className="flex items-center gap-1"><i className="inline-block size-2.5 rounded-full" style={{ background: c }} />{l}</span>)}
            <span className="flex items-center gap-1"><i className="inline-block h-0.5 w-5 bg-orange-500" /> run path (animated)</span>
            {anyDemo && <ReportKindBadge isDemo />}
          </div>
        </div>
        <div className="space-y-4">
          <div className="rounded-xl border border-dashed border-prediction bg-prediction/5 p-4 text-sm">
            <h2 className="mb-1 flex flex-wrap items-center gap-2 font-semibold">Where it&apos;s heading next <PredictionBadge confidence={t.prediction.confidence} /></h2>
            <p>{t.prediction.text}</p>
            <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">{t.prediction.reasoning.map((r) => <li key={r}>{r}</li>)}</ul>
            <p className="mt-2 text-[11px] text-muted-foreground">Predictions combine recent report progression with historical seasonal windows. Not a guarantee.</p>
          </div>
          {t.leadingEdge && <p className="rounded-lg border border-border bg-surface p-3 text-sm">{anyDemo ? <Badge variant="demo">Demo data</Badge> : <Badge variant="verified">Verified</Badge>} Leading edge: <b>{t.leadingEdge.state}</b>, last report {timeAgo(t.leadingEdge.date)}.</p>}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">This year vs. a typical year</h2>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs text-muted-foreground"><tr><th className="p-2">State</th><th className="p-2">Typical window <Badge variant="seasonal">seasonal</Badge></th><th className="p-2">Typical peak</th><th className="p-2">Reports (30d)</th><th className="p-2">Last report</th><th className="p-2">Timing</th></tr></thead>
            <tbody>
              {t.byState.map((b) => {
                const w = run.seasonWindows.find((x) => x.regionSlug.toUpperCase() === b.state)!;
                return (
                  <tr key={b.state} className={cn("border-t border-border", b.inWindowNow && "bg-seasonal/5")}>
                    <td className="p-2 font-semibold">{b.state}{b.inWindowNow && <span className="ml-1 text-[10px] text-seasonal">● in window now</span>}</td>
                    <td className="p-2">{doyToDate(w.startDoy)} – {doyToDate(w.endDoy)}</td>
                    <td className="p-2">{doyToDate(w.peakDoy)}</td>
                    <td className="p-2 tabular-nums">{b.reports}</td>
                    <td className="p-2">{b.last ? timeAgo(b.last) : "—"}</td>
                    <td className="p-2">{b.status === "on_time" ? "On schedule" : b.status === "ahead" ? `~${Math.abs(b.offsetDays ?? 0)} days early` : b.status === "behind" ? (b.offsetDays != null ? `~${b.offsetDays} days late` : "Behind") : b.status === "done" ? "Passed" : "Not started"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="mb-3 text-xl font-semibold">Timeline</h2>
          <ol className="relative space-y-2 border-l border-border pl-4">
            {timeline.map((p) => (
              <li key={p.reportId} className="text-sm">
                <span className="absolute -left-1.5 mt-1.5 size-3 rounded-full" style={{ background: ageColor(p.ageDays) }} />
                <Link href={`/spot/${p.spotSlug}/species/${run.speciesSlug}`} className="hover:underline"><b>{fmtDay(p.publishedAt)}</b> · {p.spotName} ({p.state})</Link>
                {p.abundance && <span className="ml-1 text-xs text-muted-foreground">— {p.abundance}</span>}
                {p.isDemo && <span className="ml-1 text-[10px] text-muted-foreground">demo</span>}
              </li>
            ))}
            {timeline.length === 0 && <li className="text-sm text-muted-foreground">No reports in the last 30 days.</li>}
          </ol>
        </div>
        <div>
          <h2 className="mb-3 text-xl font-semibold">Lures working on this run</h2>
          <ul className="space-y-2">{lures.map((l) => <li key={l.slug}><Link href={`/lures/${l.slug}`} className="flex items-center justify-between rounded-lg border border-border bg-surface p-2.5 text-sm hover:border-primary"><span className="font-medium">{l.brand} {l.model}</span><span className="text-xs text-muted-foreground">{l.mentions14} mentions · {l.regions.slice(0, 4).join(", ")}</span></Link></li>)}</ul>
          <h2 className="mb-3 mt-6 text-xl font-semibold">Latest reports</h2>
          <div className="space-y-2">{reports.slice(0, 4).map((r) => <ReportCard key={r.id} r={r} />)}</div>
        </div>
      </section>
    </div>
  );
}
