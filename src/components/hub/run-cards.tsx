import Link from "next/link";
import { Flame } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getRunTracker, type RunRow } from "@/lib/data";
import { dayOfYear } from "@/lib/geo";
import { timeAgo } from "@/lib/format";

/** Cards summarizing each run's live status (verified reports) and season window. */
export async function RunCards({ runs }: { runs: RunRow[] }) {
  const today = dayOfYear(new Date());
  const items = await Promise.all(runs.map(async (r) => {
    const t = await getRunTracker(r, new Date(), 14);
    const recent = t.points.filter((p) => p.ageDays <= 7).length;
    const inWindow = r.seasonWindows.some((w) => (today >= w.startDoy && today <= w.endDoy) || (today + 365 >= w.startDoy && today + 365 <= w.endDoy));
    return { r, t, recent, inWindow };
  }));
  items.sort((a, b) => b.recent - a.recent || Number(b.inWindow) - Number(a.inWindow));
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map(({ r, t, recent, inWindow }) => (
        <Link key={r.slug} href={`/runs/${r.slug}`} className="rounded-xl border border-border bg-surface p-4 hover:border-primary">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold">{r.name}</h3>
            {recent >= 8 ? <span className="flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-xs font-semibold text-white"><Flame className="size-3" /> Hot</span> : recent > 0 ? <Badge variant="verified">Active</Badge> : inWindow ? <Badge variant="seasonal">In season</Badge> : <Badge variant="outline">Off season</Badge>}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{r.speciesName} · moves {r.direction} · {r.seasonWindows.map((w) => w.regionSlug.toUpperCase()).join(" → ")}</p>
          <p className="mt-2 text-sm">{recent} report{recent === 1 ? "" : "s"} this week{t.leadingEdge ? ` · leading edge ${t.leadingEdge.state} (${timeAgo(t.leadingEdge.date)})` : ""}</p>
          {t.prediction.nextStates.length > 0 && <p className="mt-1 text-xs text-prediction">AI prediction: next {t.prediction.nextStates.join(", ")}</p>}
        </Link>
      ))}
    </div>
  );
}
