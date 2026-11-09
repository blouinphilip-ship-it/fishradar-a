import Link from "next/link";
import type { SpotMarker, SpotRow } from "@/lib/data";
import { scoreColor } from "@/components/fr/score";
import { timeAgo } from "@/lib/format";

/** Spots grouped by state with live quick score and what's running. */
export function SpotGroups({ spots, markers, groupLabel }: { spots: SpotRow[]; markers: SpotMarker[]; groupLabel: (s: SpotRow) => string }) {
  const groups = new Map<string, SpotRow[]>();
  for (const s of spots) (groups.get(groupLabel(s)) ?? groups.set(groupLabel(s), []).get(groupLabel(s))!).push(s);
  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      {[...groups].map(([label, list]) => (
        <div key={label}>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{label}</h3>
          <ul className="space-y-1.5">
            {list.map((s) => {
              const m = markers.find((x) => x.slug === s.slug);
              return (
                <li key={s.slug}>
                  <Link href={`/spot/${s.slug}`} className="flex items-center gap-3 rounded-lg border border-border bg-surface p-2.5 hover:border-primary">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white" style={{ background: scoreColor(m?.score ?? 0) }}>{m?.score ?? 0}</span>
                    <span className="min-w-0 flex-1"><span className="block truncate font-medium">{s.name}</span><span className="block truncate text-xs text-muted-foreground">{m?.top.length ? `Running: ${m.top.join(", ")}` : "No recent reports"}{m?.lastReportAt ? ` · ${timeAgo(m.lastReportAt)}` : ""}</span></span>
                    {m?.activeRun && <span title="Run active">🔥</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
