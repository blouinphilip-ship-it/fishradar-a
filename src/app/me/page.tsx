import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "My FishRadar" };

export default function Page() {
  return (
    <ComingSoon title="My FishRadar" phase={6}>
      <p>Your catch log, species life list, saved spots and alerts.</p>
    </ComingSoon>
  );
}
