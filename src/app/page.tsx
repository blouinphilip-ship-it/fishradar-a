import { Globe2, MapPin } from "lucide-react";
import { FilterDrawer } from "@/components/home/filter-drawer";
import { InfoLegend } from "@/components/info-legend";

export default function Home() {
  return (
    <div className="relative flex min-h-[70dvh] flex-1 overflow-hidden">
      <FilterDrawer />

      {/* Globe area — CesiumJS globe arrives in Phase 2 */}
      <section
        aria-label="Globe"
        className="relative flex flex-1 items-center justify-center bg-[radial-gradient(circle_at_50%_45%,#0f3b5f_0%,#07121f_60%)]"
      >
        <div className="flex flex-col items-center gap-4 px-6 text-center text-slate-200">
          <Globe2 className="size-40 text-primary/70" strokeWidth={0.8} aria-hidden />
          <h1 className="text-2xl font-bold">Know where the fish are — before you leave the dock.</h1>
          <p className="max-w-md text-sm text-slate-300">
            The interactive 3D globe is coming in Phase 2. You&apos;ll click anywhere to set your location and see nearby
            spots, what&apos;s running, and live conditions.
          </p>
        </div>
      </section>

      {/* Right side panel shell (bottom sheet on mobile) */}
      <aside
        aria-label="Spot details"
        className="absolute inset-x-0 bottom-0 z-10 max-h-[45dvh] overflow-y-auto rounded-t-2xl border-t border-border bg-surface p-4 shadow-2xl md:static md:max-h-none md:w-96 md:rounded-none md:border-l md:border-t-0"
      >
        <div className="flex items-center gap-2 text-muted-foreground">
          <MapPin className="size-4" aria-hidden />
          <span className="text-sm">No spot selected</span>
        </div>
        <p className="mt-3 text-sm">
          Select a spot on the globe to see what&apos;s running, conditions, reports, catches and the lures that are
          working.
        </p>
        <h2 className="mt-6 mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">How to read FishRadar</h2>
        <InfoLegend />
      </aside>
    </div>
  );
}
