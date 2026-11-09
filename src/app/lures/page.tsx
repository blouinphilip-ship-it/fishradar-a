import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "Top Lures Working Now" };

export default function Page() {
  return (
    <ComingSoon title="Top Lures Working Now" phase={5}>
      <p>Lures ranked by mentions in recent verified reports and catches, with product photos, sizes, colors and how to fish them.</p>
    </ComingSoon>
  );
}
