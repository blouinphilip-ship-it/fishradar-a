"use client";

import { useState } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const FRESHNESS = ["3 days", "7 days", "14 days", "30 days"];
const ACCESS = ["Shore", "Boat", "Kayak"];

/** Left filter drawer. Phase 1 = UI shell; Phase 2 wires these into URL params + the globe query. */
export function FilterDrawer() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        className="absolute left-3 top-3 z-20 shadow"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-controls="filter-drawer"
      >
        <SlidersHorizontal /> Filters
      </Button>
      <aside
        id="filter-drawer"
        aria-label="Filters"
        className={cn(
          "absolute inset-y-0 left-0 z-30 w-72 max-w-[85vw] border-r border-border bg-surface p-4 shadow-xl transition-transform",
          open ? "translate-x-0" : "-translate-x-full",
        )}
        inert={!open}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold">Filters</h2>
          <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Close filters">
            <X />
          </Button>
        </div>
        <form className="space-y-5 text-sm">
          <fieldset>
            <legend className="mb-2 font-medium">Water type</legend>
            {["Saltwater", "Freshwater", "Brackish"].map((w) => (
              <label key={w} className="flex items-center gap-2 py-0.5">
                <input type="checkbox" defaultChecked name="water" value={w.toLowerCase()} /> {w}
              </label>
            ))}
          </fieldset>
          <label className="block">
            <span className="mb-1 block font-medium">Species</span>
            <input className="h-9 w-full rounded-md border border-border bg-background px-2" placeholder="e.g. striped bass" name="species" />
          </label>
          <label className="block">
            <span className="mb-1 block font-medium">Distance: within</span>
            <select name="distance" defaultValue="50" className="h-9 w-full rounded-md border border-border bg-background px-2">
              {[10, 25, 50, 100, 250].map((d) => (
                <option key={d} value={d}>{d} miles</option>
              ))}
            </select>
          </label>
          <fieldset>
            <legend className="mb-2 font-medium">Access</legend>
            {ACCESS.map((a) => (
              <label key={a} className="flex items-center gap-2 py-0.5">
                <input type="checkbox" name="access" value={a.toLowerCase()} /> {a}
              </label>
            ))}
          </fieldset>
          <label className="block">
            <span className="mb-1 block font-medium">Reports from the last</span>
            <select name="freshness" defaultValue="14 days" className="h-9 w-full rounded-md border border-border bg-background px-2">
              {FRESHNESS.map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="verifiedOnly" /> Only show verified reports
          </label>
        </form>
      </aside>
    </>
  );
}
