import type { Metadata } from "next";
import { RunCards } from "@/components/hub/run-cards";
import { SpotGroups } from "@/components/hub/spot-list";
import { InfoLegend } from "@/components/info-legend";
import { getSpotMarkers, listRuns, listSpots } from "@/lib/data";

export const metadata: Metadata = { title: "Freshwater fishing" };
export const dynamic = "force-dynamic";

const TYPE: Record<string, string> = { lake: "Lakes", reservoir: "Reservoirs", river: "Rivers", stream: "Streams", pond: "Ponds", bay: "Lakes" };

export default async function FreshwaterPage() {
  const [spots, markers, runs] = await Promise.all([listSpots({ water: "fresh" }), getSpotMarkers(), listRuns("fresh")]);
  spots.sort((a, b) => (a.stateName ?? "").localeCompare(b.stateName ?? "") || a.spotType.localeCompare(b.spotType));
  return (
    <div className="mx-auto w-full max-w-6xl space-y-10 px-4 py-6">
      <header>
        <h1 className="text-3xl font-bold">Freshwater</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">Lakes, rivers, reservoirs and ponds — with USGS streamflow and water temperature, weather, moon and solunar data, stocking-season runs and ice-out events.</p>
        <InfoLegend className="mt-3" />
      </header>
      <section>
        <h2 className="mb-3 text-xl font-semibold">Runs &amp; seasonal events</h2>
        <RunCards runs={runs} />
        <p className="mt-2 text-xs text-muted-foreground">Ice-thickness reports, when added, are user-reported — never trust ice you haven&apos;t checked yourself.</p>
      </section>
      <section>
        <h2 className="mb-3 text-xl font-semibold">Waters by state</h2>
        <SpotGroups spots={spots} markers={markers} groupLabel={(s) => `${s.stateName} — ${TYPE[s.spotType] ?? "Waters"}`} />
      </section>
    </div>
  );
}
