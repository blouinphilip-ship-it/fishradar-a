"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sparkles } from "lucide-react";

/** Floating "Ask AI" button on every page except the assistant itself and the globe (which has its own). */
export function AskFab() {
  const p = usePathname();
  if (p.startsWith("/assistant") || p === "/") return null;
  return (
    <Link href="/assistant" className="fixed bottom-4 right-4 z-40 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg hover:opacity-90">
      <Sparkles className="size-4" /> Ask AI
    </Link>
  );
}
