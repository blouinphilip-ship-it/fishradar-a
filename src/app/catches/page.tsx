import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "Community Catches" };

export default function Page() {
  return (
    <ComingSoon title="Community Catches" phase={6}>
      <p>A feed of angler catches with species, size, lure used and date. Locations are fuzzed to protect spots.</p>
    </ComingSoon>
  );
}
