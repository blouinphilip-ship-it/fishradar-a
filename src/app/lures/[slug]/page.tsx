import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { sql } from "drizzle-orm";
import { ExternalLink } from "lucide-react";
import { db } from "@/db";
import { LureIllustration } from "@/components/fish/lure-illustration";
import { ReportCard } from "@/components/fr/report-card";
import { getLure, getReports } from "@/lib/data";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const l = await getLure((await params).slug);
  return { title: l ? `${l.brand} ${l.model}` : "Lure not found" };
}

export default async function LurePage({ params }: Props) {
  const lure = await getLure((await params).slug);
  if (!lure) notFound();
  const [bySpecies, bySpot, reportIds, aliases] = await Promise.all([
    db.execute<{ slug: string; name: string; n: number }>(sql`select sp.slug, sp.common_name as name, count(*)::int n from report_mentions m join species sp on sp.id = m.species_id join reports r on r.id = m.report_id where m.lure_id = ${lure.id} and r.review_status = 'approved' and m.published_at > now() - interval '30 days' group by sp.id order by n desc limit 8`),
    db.execute<{ slug: string; name: string; state: string | null; n: number }>(sql`select s.slug, s.name, g.state_code as state, count(*)::int n from report_mentions m join spots s on s.id = m.spot_id left join regions g on g.id = s.region_id join reports r on r.id = m.report_id where m.lure_id = ${lure.id} and r.review_status = 'approved' and m.published_at > now() - interval '30 days' group by s.id, g.state_code order by n desc limit 10`),
    db.execute<{ id: number }>(sql`select distinct m.report_id as id, max(m.published_at) from report_mentions m where m.lure_id = ${lure.id} group by m.report_id order by 2 desc limit 6`),
    db.execute<{ alias: string }>(sql`select alias from lure_aliases where lure_id = ${lure.id} order by alias`),
  ]);
  const reports = await getReports({ ids: reportIds.map((x) => x.id), days: 60, limit: 6 });
  const search = encodeURIComponent(`${lure.brand} ${lure.model}`);
  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 px-4 py-6">
      <nav className="text-xs text-muted-foreground"><Link href="/lures" className="hover:underline">Top lures</Link> / {lure.brand} {lure.model}</nav>
      <header className="grid gap-6 md:grid-cols-[320px_1fr]">
        <div className="flex h-48 items-center justify-center rounded-xl bg-muted"><LureIllustration type={lure.type} seed={lure.id} className="h-36" /></div>
        <div>
          <h1 className="text-3xl font-bold">{lure.brand} {lure.model}</h1>
          <p className="mt-1 capitalize text-muted-foreground">{lure.type.replace("_", " ")}</p>
          <dl className="mt-3 grid grid-cols-[90px_1fr] gap-1 text-sm">
            {lure.sizes.length > 0 && <><dt className="text-muted-foreground">Sizes</dt><dd>{lure.sizes.join(", ")}</dd></>}
            {lure.weights.length > 0 && <><dt className="text-muted-foreground">Weights</dt><dd>{lure.weights.join(", ")}</dd></>}
            {lure.colors.length > 0 && <><dt className="text-muted-foreground">Colors</dt><dd>{lure.colors.join(", ")}</dd></>}
          </dl>
          <p className="mt-3 text-sm"><span className="font-semibold">How to fish it:</span> {lure.howToFish}</p>
          <div className="mt-4 text-sm">
            <p className="font-semibold">Where to buy</p>
            {lure.buyLinks.length ? lure.buyLinks.map((b) => <a key={b.url} href={b.url} target="_blank" rel="noreferrer sponsored" className="mr-3 inline-flex items-center gap-1 text-primary hover:underline">{b.retailer}{b.priceUsd ? ` $${b.priceUsd}` : ""} <ExternalLink className="size-3" /></a>) :
              <a href={`https://www.google.com/search?tbm=shop&q=${search}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">Compare prices <ExternalLink className="size-3" /></a>}
            <p className="mt-1 text-[11px] text-muted-foreground">Retailer links may be affiliate links — we may earn a commission.</p>
          </div>
        </div>
      </header>
      <section className="grid gap-6 md:grid-cols-2">
        <div><h2 className="mb-2 text-xl font-semibold">Working on (last 30 days)</h2><ul className="space-y-1 text-sm">{bySpecies.map((s) => <li key={s.slug}><Link href={`/species/${s.slug}`} className="hover:underline">{s.name}</Link> <span className="text-muted-foreground">· {s.n}</span></li>)}</ul></div>
        <div><h2 className="mb-2 text-xl font-semibold">Hot spots</h2><ul className="space-y-1 text-sm">{bySpot.map((s) => <li key={s.slug}><Link href={`/spot/${s.slug}`} className="hover:underline">{s.name}</Link> <span className="text-muted-foreground">({s.state}) · {s.n}</span></li>)}</ul></div>
      </section>
      <section><h2 className="mb-2 text-xl font-semibold">Reports mentioning it</h2><div className="grid gap-3 md:grid-cols-2">{reports.map((r) => <ReportCard key={r.id} r={r} />)}</div></section>
      <p className="text-xs text-muted-foreground">Also matched as: {aliases.map((a) => a.alias).join(", ")}</p>
    </div>
  );
}
