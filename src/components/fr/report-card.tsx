import Link from "next/link";
import { ExternalLink } from "lucide-react";
import type { ReportItem } from "@/lib/data";
import { fmtDay, timeAgo } from "@/lib/format";
import { ReportKindBadge } from "./badges";

export function ReportCard({ r, showSpot = true }: { r: ReportItem; showSpot?: boolean }) {
  return (
    <article className="rounded-lg border border-border bg-surface p-3 text-sm">
      <header className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <ReportKindBadge isDemo={r.isDemo} isVerified={r.isVerified} kind={r.kind} />
        <span className="font-medium text-foreground">{r.sourceName}</span>
        <span>· {fmtDay(r.publishedAt)} ({timeAgo(r.publishedAt)})</span>
        {showSpot && r.spotSlug && <Link href={`/spot/${r.spotSlug}`} className="text-primary hover:underline">· {r.spotName}</Link>}
        {r.url && <a href={r.url} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-primary hover:underline">Original <ExternalLink className="size-3" /></a>}
      </header>
      <p className="mt-2 leading-relaxed">{r.summary}</p>
      {(r.species.length > 0 || r.lures.length > 0 || r.baits.length > 0) && (
        <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
          {r.species.map((s) => <Link key={s.slug} href={`/species/${s.slug}`} className="rounded bg-muted px-1.5 py-0.5 hover:underline">🐟 {s.name}{s.size ? ` · ${s.size}` : ""}</Link>)}
          {r.lures.map((l) => <Link key={l.slug} href={`/lures/${l.slug}`} className="rounded bg-muted px-1.5 py-0.5 hover:underline">🎣 {l.name}</Link>)}
          {r.baits.map((b) => <span key={b.slug} className="rounded bg-muted px-1.5 py-0.5">🪱 {b.name}</span>)}
        </div>
      )}
      {r.conditions && Object.keys(r.conditions).length > 0 && (
        <p className="mt-1.5 text-xs text-muted-foreground">Conditions reported: {Object.entries(r.conditions).map(([k, v]) => `${k.replace("_f", "").replace("_", " ")} ${v}`).join(" · ")}</p>
      )}
    </article>
  );
}
