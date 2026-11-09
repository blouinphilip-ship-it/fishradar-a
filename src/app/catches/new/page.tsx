import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "Log a Catch" };

export default function Page() {
  return (
    <ComingSoon title="Log a Catch" phase={6}>
      <p>Upload a photo, confirm the species, add the lure or bait — conditions are attached automatically.</p>
    </ComingSoon>
  );
}
