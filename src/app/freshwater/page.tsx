import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "Freshwater" };

export default function Page() {
  return (
    <ComingSoon title="Freshwater" phase={5}>
      <p>Lakes, rivers, reservoirs and ponds by state, with streamflow, water temperature, lake levels, stocking schedules and ice-out tracking.</p>
    </ComingSoon>
  );
}
