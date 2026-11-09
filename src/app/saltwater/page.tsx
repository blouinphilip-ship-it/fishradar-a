import type { Metadata } from "next";
import Link from "next/link";
import { RunCards } from "@/components/hub/run-cards";
import { SpotGroups } from "@/components/hub/spot-list";
import { InfoLegend } from "@/components/info-legend";
import { getSpotMarkers, listRuns, listSpots } from "@/lib/data";

export const metadata: Metadata = { title: "Saltwater fishing" };
export const dynamic = "force-dynamic";

const COAST: Record<string, string> = {
  northeast: "New England & New York", midatl: "New Jersey to the Outer Banks", southeast: "Southeast & Florida Atlantic", keys: "Florida Keys",
  gulf: "Gulf Coast", socal: "Southern California", norcal: "Central & Northern California", pnw: "Pacific Northwest", alaska: "Alaska", hawaii: "Hawaii",
};

export default async function SaltwaterPage({ searchParams }: { searchParams: Promise<{ coast?: string }> }) {
  const { coast } = await searchParams;
  const [spots, markers, runs] = await Promise.all([listSpots({ water: "salt" }), getSpotMarkers(), listRuns("salt")]);
  const shown = coast ? spots.filter((s) => s.zone === coast) : spots;
  const order = Object.keys(COAST);
  shown.sort((a, b) => order.indexOf(a.zone) - order.indexOf(b.zone) || (a.stateCode ?? "").localeCompare(b.stateCode ?? ""));
  return (
    <div className="mx-auto w-full max-w-6xl space-y-10 px-4 py-6">
      <header>
        <h1 className="text-3xl font-bold">Saltwater</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">East Coast, Gulf and West Coast spots plus Alaska and Hawaii — with live tides, buoys and marine forecasts, recent reports, and the major sport-fish runs.</p>
        <InfoLegend className="mt-3" />
      </header>
      <section>
        <h2 className="mb-3 text-xl font-semibold">Sport fish runs</h2>
        <RunCards runs={runs} />
      </section>
      <section>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="mr-2 text-xl font-semibold">Spots by region</h2>
          <Link href="/saltwater" className={`rounded-full border px-2.5 py-0.5 text-xs ${!coast ? "bg-primary text-primary-foreground" : "border-border hover:bg-muted"}`}>All</Link>
          {Object.entries(COAST).map(([k, v]) => <Link key={k} href={`/saltwater?coast=${k}`} className={`rounded-full border px-2.5 py-0.5 text-xs ${coast === k ? "bg-primary text-primary-foreground" : "border-border hover:bg-muted"}`}>{v}</Link>)}
        </div>
        <SpotGroups spots={shown} markers={markers} groupLabel={(s) => `${COAST[s.zone] ?? s.zone} — ${s.stateName}`} />
      </section>
    </div>
  );
}
