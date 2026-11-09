import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "AI Fishing Assistant" };

export default function Page() {
  return (
    <ComingSoon title="AI Fishing Assistant" phase={6}>
      <p>Ask where and when to fish, what is running, and what to throw. Every answer cites the reports and data it used.</p>
    </ComingSoon>
  );
}
