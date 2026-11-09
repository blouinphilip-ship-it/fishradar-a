import type { Metadata } from "next";
import { InfoLegend } from "@/components/info-legend";
import { RunCards } from "@/components/hub/run-cards";
import { listRuns } from "@/lib/data";

export const metadata: Metadata = { title: "Run Tracker" };
export const dynamic = "force-dynamic";

export default async function RunsPage() {
  const [salt, fresh] = await Promise.all([listRuns("salt"), listRuns("fresh")]);
  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-6">
      <header>
        <h1 className="text-3xl font-bold">Run Tracker</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">Follow migrations as they happen. Each run shows verified reports by date and place, how this year compares to the typical timing, and a clearly labeled AI prediction of where the fish go next.</p>
        <InfoLegend className="mt-3" />
      </header>
      <section><h2 className="mb-3 text-xl font-semibold">Saltwater runs</h2><RunCards runs={salt} /></section>
      <section><h2 className="mb-3 text-xl font-semibold">Freshwater runs &amp; seasonal events</h2><RunCards runs={fresh} /></section>
    </div>
  );
}
