import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "Run Tracker" };

export default function Page() {
  return (
    <ComingSoon title="Run Tracker" phase={5}>
      <p>Follow a species run along the coast: verified reports on a map and timeline, this year vs. a typical year, and an AI prediction of where it goes next.</p>
    </ComingSoon>
  );
}
