import type { Metadata } from "next";
import { Img } from "@/components/ui/img";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, Fish, Sparkles, Thermometer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { PredictionBadge, RunStatusBadge, WaterBadge } from "@/components/fr/badges";
import { ReportCard } from "@/components/fr/report-card";
import { ReportTimeline, ScoreStrip } from "@/components/fr/charts";
import { ScoreBreakdown, ScoreDial } from "@/components/fr/score";
import { SeasonBar } from "@/components/fr/season-bar";
import { YouTubeEmbed } from "@/components/fr/client-bits";
import { SafetyBanner, tzForLon } from "@/components/fr/conditions-panel";
import { SpeciesPhoto } from "@/components/fish/species-photo";
import { LureIllustration } from "@/components/fish/lure-illustration";
import { getBaitsBySlugs, getCatches, getLuresBySlugs, getRegulation, getReportTimeline, getReports, getSpeciesAtSpot, getSpot, getTackle, getTopBaits, getTopLures } from "@/lib/data";
import { getSpotForecast } from "@/lib/forecast";
import { RUN_STATUS_LABEL, waterTempFactor } from "@/lib/scoring";
import { timeAgo } from "@/lib/format";
import { getVideos } from "@/lib/videos";

type Props = { params: Promise<{ slug: string; sp: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, sp } = await params;
  const spot = await getSpot(slug);
  return { title: spot ? `${sp.replace(/-/g, " ")} at ${spot.name}` : "Not found" };
}

export default async function SpeciesAtSpotPage({ params }: Props) {
  const { slug, sp } = await params;
  const spot = await getSpot(slug);
  if (!spot) notFound();
  const list = await getSpeciesAtSpot(spot);
  const s = list.find((x) => x.slug === sp);
  if (!s) notFound();

  const [forecast, reports, timeline, lures, baits, tackle, catches, reg] = await Promise.all([
    getSpotForecast(spot, list, s.slug),
    getReports({ nearSpotId: spot.id, radiusMi: 20, speciesId: s.speciesId, days: 30, limit: 8 }),
    getReportTimeline(s.speciesId, spot.id, 60),
    getTopLures({ spotId: spot.id, speciesId: s.speciesId, days: 30, limit: 6 }),
    getTopBaits({ spotId: spot.id, speciesId: s.speciesId, days: 30, limit: 5 }),
    getTackle(s.speciesId),
    getCatches({ spotId: spot.id, speciesId: s.speciesId, limit: 6 }),
    getRegulation(spot.stateCode, s.speciesId, spot.waterType === "fresh" ? "fresh" : "salt"),
  ]);
  const regionalLures = lures.length < 3 ? await getTopLures({ speciesId: s.speciesId, days: 21, limit: 6 }) : [];
  const seasonalLures = await getLuresBySlugs(tackle?.defaultLures ?? []);
  const seasonalBaits = await getBaitsBySlugs(tackle?.defaultBaits ?? []);
  const videos = await getVideos({ spotId: spot.id, spotName: spot.name, lat: spot.lat, lon: spot.lon, speciesId: s.speciesId, speciesName: s.commonName });
  const n = forecast.conditions.now;
  const zone = tzForLon(spot.lon);
  const tempFit = n.waterTempF != null ? waterTempFactor(n.waterTempF, s.profile) : null;
  const regFresh = reg?.lastVerifiedAt && Date.now() - +new Date(reg.lastVerifiedAt) < 30 * 86_400_000;
  const shownLures = lures.length >= 3 ? lures : [...lures, ...regionalLures.filter((r) => !lures.some((l) => l.slug === r.slug))].slice(0, 6);
  const tip = shownLures.length
    ? `Based on ${reports.length} report${reports.length === 1 ? "" : "s"} in the last 30 days near ${spot.name}, ${shownLures.slice(0, 2).map((l) => `${l.brand} ${l.model}`).join(" and ")} ${shownLures.length > 1 ? "are" : "is"} producing${baits[0] ? `, and ${baits[0].name.toLowerCase()} is the top bait` : ""}. ${tackle?.bestTide ? `Target ${tackle.bestTide.toLowerCase()}` : ""}${tackle?.bestTime ? `, ${tackle.bestTime.toLowerCase()}` : ""}.`
    : null;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-6">
      <nav className="text-xs text-muted-foreground"><Link href="/" className="hover:underline">Globe</Link> / <Link href={`/spot/${spot.slug}`} className="hover:underline">{spot.name}</Link> / {s.commonName}</nav>

      <header className="grid gap-6 md:grid-cols-[380px_1fr]">
        <SpeciesPhoto slug={s.slug} scientificName={s.scientificName} name={s.commonName} className="h-56 w-full rounded-xl" />
        <div>
          <h1 className="text-3xl font-bold">{s.commonName} <span className="text-lg font-normal text-muted-foreground">at {spot.name}</span></h1>
          <p className="mt-1 text-sm italic text-muted-foreground">{s.scientificName}{s.nicknames.length ? <span className="not-italic"> · aka {s.nicknames.slice(0, 5).map((x) => `“${x}”`).join(", ")}</span> : null}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2"><RunStatusBadge status={s.status} /><span className="text-sm text-muted-foreground">{RUN_STATUS_LABEL[s.status]} · last report {timeAgo(s.lastReportAt)}{s.lastReportDemo ? " (demo)" : ""} · {s.reportsThisWeek} this week</span><WaterBadge water={spot.waterType} /></div>
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <ScoreDial score={forecast.now.score} size={72} />
            <div className="text-sm"><p className="font-semibold">Fishing Score right now</p><ScoreBreakdown result={forecast.now} /></div>
          </div>
          <div className="mt-4"><p className="mb-1 text-xs text-muted-foreground"><Badge variant="seasonal">Seasonal expectation</Badge> typical likelihood by month in this region</p><SeasonBar monthly={s.monthly} className="max-w-md" /></div>
        </div>
      </header>

      <SafetyBanner c={forecast.conditions} />

      {tip && (
        <section className="rounded-xl border border-prediction/40 bg-prediction/5 p-4 text-sm">
          <h2 className="mb-1 flex items-center gap-2 font-semibold"><Sparkles className="size-4 text-prediction" /> AI tip <PredictionBadge /></h2>
          <p>{tip}</p>
        </section>
      )}

      <section className="grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="mb-2 text-xl font-semibold">Is it running here?</h2>
          <div className="rounded-xl border border-border bg-surface p-3">
            <p className="text-xs text-muted-foreground"><Badge variant="verified">Verified reports</Badge> per day, last 60 days (within this spot)</p>
            <ReportTimeline data={timeline} />
          </div>
        </div>
        <div>
          <h2 className="mb-2 text-xl font-semibold">Best times — next 72 hours</h2>
          <div className="rounded-xl border border-border bg-surface p-3">
            <ScoreStrip hours={forecast.hours} />
            <p className="mt-1 text-sm">{forecast.windows.slice(0, 3).map((w) => `${new Date(w.start).toLocaleString("en-US", { weekday: "short", hour: "numeric", timeZone: zone })}–${new Date(w.end).toLocaleString("en-US", { hour: "numeric", timeZone: zone })}`).join(" · ")}</p>
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">Best lures for {s.commonName.toLowerCase()} here</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shownLures.map((l, i) => (
            <Link key={l.slug} href={`/lures/${l.slug}`} className="flex gap-3 rounded-xl border border-border bg-surface p-3 hover:border-primary">
              <div className="flex h-20 w-28 shrink-0 items-center justify-center rounded-lg bg-muted"><LureIllustration type={l.type} seed={l.id + i} className="h-14" /></div>
              <div className="min-w-0 text-sm">
                <p className="font-semibold">{l.brand} {l.model}</p>
                <p className="text-xs text-muted-foreground">{lures.includes(l) ? `${l.mentions14} mention(s) at this spot` : `${l.mentions14} mention(s) regionally`}{l.demoOnly ? " · demo data" : ""}</p>
                {l.colors.length > 0 && <p className="text-xs">Colors: {l.colors.slice(0, 3).join(", ")}{l.sizes.length ? ` · ${l.sizes.slice(0, 2).join(", ")}` : ""}</p>}
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{l.howToFish}</p>
              </div>
            </Link>
          ))}
        </div>
        {seasonalLures.length > 0 && (
          <div className="mt-4">
            <h3 className="mb-2 text-sm font-semibold"><Badge variant="seasonal">Seasonal knowledge</Badge> proven {s.commonName.toLowerCase()} lures</h3>
            <div className="flex flex-wrap gap-2">{seasonalLures.map((l) => <Link key={l.slug} href={`/lures/${l.slug}`} className="rounded-full border border-border px-3 py-1 text-sm hover:border-primary">{l.brand} {l.model}</Link>)}</div>
          </div>
        )}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="mb-3 text-xl font-semibold">Best bait</h2>
          <ul className="space-y-2">
            {(baits.length ? baits : seasonalBaits.map((b) => ({ ...b, mentions: 0, species: [], demoOnly: false }))).map((b) => (
              <li key={b.slug} className="rounded-lg border border-border bg-surface p-3 text-sm">
                <p className="font-semibold">{b.name} {b.isLive && <Badge variant="outline">live</Badge>} {b.mentions > 0 ? <span className="text-xs font-normal text-muted-foreground">· {b.mentions} recent mention(s)</span> : <Badge variant="seasonal">seasonal pick</Badge>}</p>
                <p className="mt-1 text-xs text-muted-foreground">Rigging: {b.rigging}</p>
              </li>
            ))}
          </ul>
        </div>
        {tackle && (
          <div>
            <h2 className="mb-3 text-xl font-semibold">Rigs &amp; tackle</h2>
            <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1.5 rounded-xl border border-border bg-surface p-4 text-sm">
              <dt className="text-muted-foreground">Rod</dt><dd>{tackle.rod}</dd>
              <dt className="text-muted-foreground">Reel</dt><dd>{tackle.reel}</dd>
              <dt className="text-muted-foreground">Line</dt><dd>{tackle.line}</dd>
              <dt className="text-muted-foreground">Leader</dt><dd>{tackle.leader}</dd>
              <dt className="text-muted-foreground">Hooks</dt><dd>{tackle.hooks}</dd>
            </dl>
            <ul className="mt-3 space-y-1.5 text-sm">{tackle.rigs.map((r) => <li key={r.name}><span className="font-semibold">{r.name}:</span> {r.description}</li>)}</ul>
          </div>
        )}
      </section>

      {tackle && (
        <section>
          <h2 className="mb-3 text-xl font-semibold">Where &amp; how</h2>
          <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-border bg-surface p-3"><p className="text-xs text-muted-foreground">Structure</p><p>{tackle.structure}</p></div>
            <div className="rounded-lg border border-border bg-surface p-3"><p className="text-xs text-muted-foreground">Depth</p><p>{tackle.depth}</p><p className="mt-1 text-xs text-muted-foreground">Best tide</p><p>{tackle.bestTide}</p></div>
            <div className="rounded-lg border border-border bg-surface p-3"><p className="text-xs text-muted-foreground">Best time of day</p><p>{tackle.bestTime}</p></div>
            <div className="rounded-lg border border-border bg-surface p-3">
              <p className="flex items-center gap-1 text-xs text-muted-foreground"><Thermometer className="size-3" /> Water temperature fit</p>
              <p>Prefers {s.profile.tempMinF}–{s.profile.tempMaxF}°F (best ~{s.profile.tempOptF}°F)</p>
              <p className="mt-1 font-semibold">{n.waterTempF != null ? <>Now {Math.round(n.waterTempF)}°F — {tempFit! > 0.8 ? "ideal" : tempFit! > 0.45 ? "workable" : "outside the preferred range"}</> : "Current water temp unavailable"}</p>
            </div>
          </div>
        </section>
      )}

      <section className="rounded-xl border border-border bg-surface p-4 text-sm">
        <h2 className="mb-2 text-xl font-semibold">Regulations snapshot</h2>
        {regFresh ? (
          <p>Size: {reg!.sizeLimit ?? "—"} · Bag: {reg!.bagLimit ?? "—"} · Season: {reg!.season ?? "—"} <span className="text-xs text-muted-foreground">(verified {timeAgo(reg!.lastVerifiedAt)})</span></p>
        ) : (
          <p className="font-semibold">Check official regulations — limits haven&apos;t been verified by FishRadar in the last 30 days.</p>
        )}
        {reg?.officialUrl && <a href={reg.officialUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-primary hover:underline">{spot.stateName} official {spot.waterType === "fresh" ? "freshwater" : "saltwater"} regulations <ExternalLink className="size-3" /></a>}
        {s.slug === "striped-bass" && spot.waterType !== "fresh" && <p className="mt-1 text-xs text-muted-foreground">Many Atlantic states require inline circle hooks when fishing bait for striped bass.</p>}
        <p className="mt-1 text-xs text-muted-foreground">Always check current regulations before keeping fish.</p>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">Recent reports mentioning {s.commonName.toLowerCase()} nearby</h2>
        <div className="grid gap-3 md:grid-cols-2">{reports.map((r) => <ReportCard key={r.id} r={r} />)}</div>
        {reports.length === 0 && <p className="text-sm text-muted-foreground">No reports in the last 30 days.</p>}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div>
          <div className="mb-3 flex items-center justify-between"><h2 className="text-xl font-semibold">Community catches</h2><Link href={`/catches/new?spot=${spot.id}&species=${s.speciesId}`} className={buttonVariants({ size: "sm" })}><Fish /> Log one</Link></div>
          <div className="grid grid-cols-3 gap-2">
            {catches.map((c) => (
              <Link key={c.id} href={`/catches/${c.id}`} className="overflow-hidden rounded-lg border border-border">
                {c.photoUrl ? <Img src={c.photoUrl} alt="" className="h-24 w-full object-cover" /> : <SpeciesPhoto slug={s.slug} scientificName={null} name={s.commonName} className="h-24 w-full" />}
                <p className="truncate p-1.5 text-[11px]">{c.lengthIn ? `${c.lengthIn}" · ` : ""}{c.lureName ?? c.baitName ?? ""}</p>
              </Link>
            ))}
          </div>
          {catches.length === 0 && <p className="text-sm text-muted-foreground">No catches logged yet.</p>}
        </div>
        <div>
          <h2 className="mb-3 text-xl font-semibold">Videos</h2>
          {videos.videos.length ? <div className="grid grid-cols-2 gap-2">{videos.videos.slice(0, 4).map((v) => <YouTubeEmbed key={v.youtubeId} id={v.youtubeId} title={v.title} />)}</div> :
            <a href={videos.searchUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">Recent {s.commonName.toLowerCase()} videos on YouTube <ExternalLink className="size-3" /></a>}
          <p className="mt-3 text-sm"><Link href={`/species/${s.slug}`} className="text-primary hover:underline">More about {s.commonName} →</Link></p>
        </div>
      </section>
    </div>
  );
}
