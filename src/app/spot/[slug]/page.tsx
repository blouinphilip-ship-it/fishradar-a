import type { Metadata } from "next";
import { Img } from "@/components/ui/img";
import Link from "next/link";
import { notFound } from "next/navigation";
import { sql } from "drizzle-orm";
import { Anchor, Bell, Bookmark, BookmarkCheck, ExternalLink, Fish, MapPin, Sparkles, Store } from "lucide-react";
import { auth } from "@/auth";
import { db } from "@/db";
import { toggleSaveSpot } from "@/app/actions";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { ReportKindBadge, RunStatusBadge, WaterBadge } from "@/components/fr/badges";
import { ConditionsPanel, SafetyBanner, tzForLon } from "@/components/fr/conditions-panel";
import { ReportCard } from "@/components/fr/report-card";
import { ScoreBreakdown, ScoreDial, scoreWord } from "@/components/fr/score";
import { ScoreStrip } from "@/components/fr/charts";
import { SeasonBar } from "@/components/fr/season-bar";
import { DistanceFromMe, ShareButton, YouTubeEmbed } from "@/components/fr/client-bits";
import { SpeciesPhoto } from "@/components/fish/species-photo";
import { LureIllustration } from "@/components/fish/lure-illustration";
import { getBriefing } from "@/lib/ai/briefing";
import { getCatches, getReports, getSpeciesAtSpot, getSpot, getTackle, getTopBaits, getTopLures, getLuresBySlugs } from "@/lib/data";
import { getSpotForecast } from "@/lib/forecast";
import { timeAgo } from "@/lib/format";
import { degToCompass } from "@/lib/geo";
import { getVideos } from "@/lib/videos";
import { cn } from "@/lib/utils";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ r?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const spot = await getSpot((await params).slug);
  return spot ? { title: `${spot.name} fishing report & conditions`, description: spot.description ?? undefined } : { title: "Spot not found" };
}

export default async function SpotPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const radius = Math.min(100, Math.max(0, Number((await searchParams).r ?? 15)));
  const spot = await getSpot(slug);
  if (!spot) notFound();
  const session = await auth();

  const species = await getSpeciesAtSpot(spot);
  const [forecast, reports, catches, lures, baits, saved] = await Promise.all([
    getSpotForecast(spot, species),
    getReports({ ...(radius > 0 ? { nearSpotId: spot.id, radiusMi: radius } : { spotId: spot.id }), days: 30, limit: 12 }),
    getCatches({ spotId: spot.id, limit: 8 }),
    getTopLures({ spotId: spot.id, days: 21, limit: 8 }),
    getTopBaits({ spotId: spot.id, days: 21, limit: 6 }),
    session?.user ? db.execute(sql`select 1 from saved_spots where user_id = ${session.user.id} and spot_id = ${spot.id}`) : Promise.resolve([]),
  ]);
  const briefing = await getBriefing(spot, species, forecast, reports, lures);
  const top = species[0];
  const videos = await getVideos({ spotId: spot.id, spotName: spot.name, lat: spot.lat, lon: spot.lon, speciesId: top?.speciesId, speciesName: top?.commonName });
  const fallbackLures = lures.length < 3 && top ? await getLuresBySlugs((await getTackle(top.speciesId))?.defaultLures ?? []) : [];

  const running = species.filter((s) => s.signal > 0.12);
  const inSeason = species.filter((s) => s.signal <= 0.12 && s.seasonalNow >= 0.4);
  const coming = species.filter((s) => s.signal <= 0.12 && s.seasonalNow < 0.4 && s.monthly[(new Date().getMonth() + 1) % 12] >= 0.4);
  const out = species.filter((s) => !running.includes(s) && !inSeason.includes(s) && !coming.includes(s));
  const n = forecast.conditions.now;
  const zone = tzForLon(spot.lon);
  const summaryLine = [
    n.tideStage && `${n.tideStage} tide`, n.windKt != null && `${degToCompass(n.windDirDeg)} ${Math.round(n.windKt)} kt`, n.waterTempF != null && `water ${Math.round(n.waterTempF)}°F`,
    top && top.lastReportAt && `${top.commonName.toLowerCase()} reported ${timeAgo(top.lastReportAt)}`,
  ].filter(Boolean).join(", ");

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-6">
      {/* 1. Header */}
      <header className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1">
          <nav className="text-xs text-muted-foreground"><Link href="/" className="hover:underline">Globe</Link> / <Link href={spot.waterType === "fresh" ? "/freshwater" : "/saltwater"} className="hover:underline">{spot.waterType === "fresh" ? "Freshwater" : "Saltwater"}</Link> / {spot.stateName}</nav>
          <h1 className="mt-1 text-3xl font-bold">{spot.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <WaterBadge water={spot.waterType} /><span className="capitalize">{spot.spotType}</span><span>·</span><span>{spot.accessModes.join(" / ")}</span><span>·</span><DistanceFromMe lat={spot.lat} lon={spot.lon} />
          </div>
          <p className="mt-3 max-w-3xl text-sm">{spot.description}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <form action={toggleSaveSpot.bind(null, spot.id, spot.slug)}><Button size="sm" variant={saved.length ? "secondary" : "outline"} type="submit">{saved.length ? <BookmarkCheck /> : <Bookmark />} {saved.length ? "Saved" : "Save spot"}</Button></form>
            <Link href={`/me?tab=alerts&spot=${spot.id}&spotName=${encodeURIComponent(spot.name)}`} className={buttonVariants({ variant: "outline", size: "sm" })}><Bell /> Set alert</Link>
            <ShareButton title={`${spot.name} on FishRadar AI`} />
            <Link href={`/assistant?q=${encodeURIComponent(`What should I target at ${spot.name} in the next few days, and with what?`)}`} className={buttonVariants({ variant: "outline", size: "sm" })}><Sparkles /> Ask AI</Link>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-border bg-surface p-4">
          <ScoreDial score={forecast.now.score} size={84} />
          <div className="max-w-56">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Fishing Score{forecast.species ? ` · ${forecast.species.commonName}` : ""}</p>
            <p className="font-semibold">{scoreWord(forecast.now.score)}{summaryLine ? ` — ${summaryLine}` : ""}</p>
            <ScoreBreakdown result={forecast.now} />
          </div>
        </div>
      </header>

      <SafetyBanner c={forecast.conditions} />

      {/* 10. AI briefing (placed high — it summarizes everything below) */}
      <section className="rounded-xl border border-prediction/40 bg-prediction/5 p-4">
        <h2 className="flex items-center gap-2 font-semibold"><Sparkles className="size-4 text-prediction" /> Spot briefing
          <Badge variant="prediction">{briefing.mode === "claude" ? "AI-written" : "Auto summary"}</Badge>
          <span className="text-xs font-normal text-muted-foreground">updated {timeAgo(briefing.generatedAt)}</span></h2>
        <p className="mt-2 text-sm leading-relaxed">{briefing.text.split(/(\[R\d+\])/).map((part, i) => {
          const m = part.match(/\[R(\d+)\]/);
          return m ? <a key={i} href={`#report-${m[1]}`} className="text-primary hover:underline">[{briefing.citedReportIds.indexOf(Number(m[1])) + 1}]</a> : <span key={i}>{part}</span>;
        })}</p>
      </section>

      {/* 2. What's running now */}
      <section>
        <h2 className="mb-3 text-xl font-semibold">What&apos;s running now</h2>
        {running.length === 0 ? <p className="text-sm text-muted-foreground">No verified reports in the last 14 days. {inSeason.length > 0 && <>Seasonal expectation: {inSeason.map((s) => s.commonName).join(", ")}.</>}</p> : (
          <div className="flex snap-x gap-3 overflow-x-auto pb-2">
            {running.map((s) => (
              <Link key={s.slug} href={`/spot/${spot.slug}/species/${s.slug}`} className="w-56 shrink-0 snap-start overflow-hidden rounded-xl border border-border bg-surface hover:border-primary">
                <SpeciesPhoto slug={s.slug} scientificName={s.scientificName} name={s.commonName} className="h-28 w-full" />
                <div className="space-y-1 p-3">
                  <div className="flex items-center justify-between gap-2"><span className="font-semibold">{s.commonName}</span><RunStatusBadge status={s.status} /></div>
                  <p className="text-xs text-muted-foreground">Last report {timeAgo(s.lastReportAt)}{s.lastReportDemo ? " (demo)" : ""} · {s.reportsThisWeek} this week</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* 4. Conditions */}
      <section className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div>
          <h2 className="mb-3 text-xl font-semibold">Conditions now &amp; forecast</h2>
          <ConditionsPanel c={forecast.conditions} />
        </div>
        <div>
          <h2 className="mb-3 text-xl font-semibold">Best times to fish</h2>
          <div className="rounded-xl border border-border bg-surface p-3">
            <p className="text-xs text-muted-foreground">Hourly Fishing Score{forecast.species ? ` for ${forecast.species.commonName.toLowerCase()}` : ""} — next 72 hours <Badge variant="prediction" className="ml-1">forecast</Badge></p>
            <ScoreStrip hours={forecast.hours} />
            <ol className="mt-2 space-y-1 text-sm">
              {forecast.windows.slice(0, 4).map((w, i) => (
                <li key={w.start} className="flex items-center gap-2">
                  <span className="flex size-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{i + 1}</span>
                  <span className="flex-1">{new Date(w.start).toLocaleString("en-US", { weekday: "short", hour: "numeric", timeZone: zone })} – {new Date(w.end).toLocaleString("en-US", { hour: "numeric", timeZone: zone })}</span>
                  <span className="text-xs text-muted-foreground">peak {w.peak}</span>
                </li>
              ))}
            </ol>
            <p className="mt-2 text-[11px] text-muted-foreground">Combines tide, light, solunar periods, wind, pressure trend, water temperature, season and recent reports.</p>
          </div>
        </div>
      </section>

      {/* 3. All species */}
      <section>
        <h2 className="mb-3 text-xl font-semibold">All species you can catch here</h2>
        <div className="grid gap-6 md:grid-cols-3">
          {([["Running / in season now", [...running, ...inSeason]], ["Coming soon", coming], ["Out of season", out]] as const).map(([label, list]) => (
            <div key={label}>
              <h3 className="mb-2 text-sm font-semibold text-muted-foreground">{label} ({list.length})</h3>
              <ul className="space-y-2">
                {list.map((s) => (
                  <li key={s.slug}>
                    <Link href={`/spot/${spot.slug}/species/${s.slug}`} className="block rounded-lg border border-border bg-surface p-2.5 hover:border-primary">
                      <div className="flex items-center justify-between gap-2 text-sm"><span className="font-medium">{s.commonName}</span><RunStatusBadge status={s.status} /></div>
                      <SeasonBar monthly={s.monthly} className="mt-2" />
                    </Link>
                  </li>
                ))}
                {list.length === 0 && <li className="text-sm text-muted-foreground">—</li>}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* 8. Lures & bait */}
      <section>
        <h2 className="mb-3 text-xl font-semibold">Top lures &amp; bait working here</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {lures.map((l, i) => (
            <Link key={l.slug} href={`/lures/${l.slug}`} className="rounded-xl border border-border bg-surface p-3 hover:border-primary">
              <div className="flex h-20 items-center justify-center rounded-lg bg-muted"><LureIllustration type={l.type} seed={i + l.id} className="h-16" /></div>
              <p className="mt-2 font-semibold">{l.brand} {l.model}</p>
              <p className="text-xs text-muted-foreground">{l.mentions14} mention{l.mentions14 === 1 ? "" : "s"} · {l.species.slice(0, 2).join(", ")}{l.demoOnly ? " · demo data" : ""}</p>
            </Link>
          ))}
          {fallbackLures.map((l, i) => (
            <Link key={l.slug} href={`/lures/${l.slug}`} className="rounded-xl border border-dashed border-seasonal/60 bg-surface p-3 hover:border-primary">
              <div className="flex h-20 items-center justify-center rounded-lg bg-muted"><LureIllustration type={l.type} seed={i + 7} className="h-16" /></div>
              <p className="mt-2 font-semibold">{l.brand} {l.model}</p>
              <p className="text-xs text-seasonal">Seasonal pick for {top?.commonName.toLowerCase()}</p>
            </Link>
          ))}
        </div>
        {baits.length > 0 && <p className="mt-3 text-sm"><span className="font-semibold">Top baits:</span> {baits.map((b) => `${b.name} (${b.mentions})`).join(" · ")}</p>}
        <p className="mt-2 text-[11px] text-muted-foreground">Illustrations shown until licensed product photos are connected (manufacturer media kits / affiliate feeds).</p>
      </section>

      {/* 5. Reports */}
      <section>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h2 className="text-xl font-semibold">Latest fishing reports</h2>
          <div className="flex gap-1 text-xs">
            {[0, 15, 30, 60].map((r) => <Link key={r} href={`?r=${r}`} scroll={false} className={cn("rounded-md border border-border px-2 py-1", radius === r ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>{r === 0 ? "This spot" : `${r} mi`}</Link>)}
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {reports.map((r) => <div key={r.id} id={`report-${r.id}`}><ReportCard r={r} /></div>)}
          {reports.length === 0 && <p className="text-sm text-muted-foreground">No reports in the last 30 days within {radius} miles — showing seasonal expectations above.</p>}
        </div>
      </section>

      {/* 6. Catches + 7. Videos */}
      <section className="grid gap-6 lg:grid-cols-2">
        <div>
          <div className="mb-3 flex items-center justify-between"><h2 className="text-xl font-semibold">Recent catches</h2><Link href={`/catches/new?spot=${spot.id}`} className={buttonVariants({ size: "sm" })}><Fish /> Log a catch</Link></div>
          <div className="grid grid-cols-2 gap-3">
            {catches.map((c) => (
              <Link key={c.id} href={`/catches/${c.id}`} className="overflow-hidden rounded-lg border border-border bg-surface hover:border-primary">
                {c.photoUrl ? <Img src={c.photoUrl} alt={c.speciesName ?? "catch"} className="h-28 w-full object-cover" /> : <SpeciesPhoto slug={c.speciesSlug ?? ""} scientificName={null} name={c.speciesName ?? ""} className="h-28 w-full" />}
                <div className="p-2 text-xs"><p className="font-semibold">{c.speciesName}{c.lengthIn ? ` · ${c.lengthIn}"` : ""}</p><p className="text-muted-foreground">{c.lureName ?? c.baitName ?? "—"} · {timeAgo(c.caughtAt)}</p>{c.isDemo && <Badge variant="demo" className="mt-1">Demo</Badge>}</div>
              </Link>
            ))}
          </div>
          {catches.length === 0 && <p className="text-sm text-muted-foreground">No catches logged here yet.</p>}
          <p className="mt-2 text-[11px] text-muted-foreground">Catch locations are fuzzed to about 2 miles unless the angler chooses otherwise.</p>
        </div>
        <div>
          <h2 className="mb-3 text-xl font-semibold">Videos from this area</h2>
          {videos.videos.length > 0 ? (
            <div className="grid grid-cols-2 gap-3">{videos.videos.map((v) => <div key={v.youtubeId}><YouTubeEmbed id={v.youtubeId} title={v.title} /><p className="mt-1 line-clamp-2 text-xs">{v.title}</p><p className="text-[11px] text-muted-foreground">{v.channel} · {timeAgo(new Date(v.publishedAt).toISOString())}</p></div>)}</div>
          ) : (
            <div className="rounded-xl border border-border bg-surface p-4 text-sm">
              <p>{videos.configured ? "No recent videos found for this area." : "Video search needs a YouTube Data API key (free)."}</p>
              <a href={videos.searchUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-primary hover:underline">Search recent {top?.commonName.toLowerCase() ?? "fishing"} videos on YouTube <ExternalLink className="size-3" /></a>
            </div>
          )}
        </div>
      </section>

      {/* 9. Access & info */}
      <section className="rounded-xl border border-border bg-surface p-4">
        <h2 className="mb-3 text-xl font-semibold">Access &amp; info</h2>
        <div className="grid gap-4 text-sm md:grid-cols-3">
          <div><h3 className="mb-1 flex items-center gap-1.5 font-semibold"><Anchor className="size-4" /> Boat ramps</h3>{spot.access.boatRamps?.length ? <ul className="list-disc pl-5">{spot.access.boatRamps.map((r) => <li key={r.name}>{r.name}</li>)}</ul> : <p className="text-muted-foreground">Not listed yet.</p>}<p className="mt-1 text-muted-foreground">Access: {spot.accessModes.join(", ")}</p></div>
          <div><h3 className="mb-1 flex items-center gap-1.5 font-semibold"><Store className="size-4" /> Tackle shops &amp; charters</h3>{spot.access.tackleShops?.length ? <ul className="list-disc pl-5">{spot.access.tackleShops.map((r) => <li key={r.name}>{r.name}</li>)}</ul> : <p className="text-muted-foreground">Directory coming soon — <Link href="/partner" className="text-primary hover:underline">list your shop</Link>.</p>}</div>
          <div><h3 className="mb-1 flex items-center gap-1.5 font-semibold"><MapPin className="size-4" /> Regulations</h3>
            {spot.regulationsUrl && <a href={spot.regulationsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">{spot.stateName} official fishing regulations &amp; licenses <ExternalLink className="size-3" /></a>}
            <p className="mt-1 text-xs text-muted-foreground">Always check current regulations before keeping fish. Seasons, size and bag limits change.</p></div>
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">Data: tide station {spot.nearestTideStationId ?? "—"}, water temp station {spot.waterTempStationId ?? "—"}, buoy {spot.nearestBuoyId ?? "—"}, USGS gauge {spot.usgsSiteId ?? "—"}. Coordinates {spot.lat.toFixed(3)}, {spot.lon.toFixed(3)}.</p>
      </section>
      {reports.some((r) => r.isDemo) && <p className="text-center text-xs text-muted-foreground"><ReportKindBadge isDemo /> reports are generated sample data until real sources are connected.</p>}
    </div>
  );
}
