import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "Saltwater" };

export default function Page() {
  return (
    <ComingSoon title="Saltwater" phase={5}>
      <p>Saltwater regions from Maine to Texas and the whole West Coast, plus Sport Fish Run sections: striped bass, redfish, tuna, false albacore, tarpon and more.</p>
    </ComingSoon>
  );
}
