import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "Search" };

export default function Page() {
  return (
    <ComingSoon title="Search" phase={2}>
      <p>Search across spots, species, towns and lakes.</p>
    </ComingSoon>
  );
}
