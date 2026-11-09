"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function Footer() {
  const p = usePathname();
  if (p === "/" || p.startsWith("/assistant")) return null;
  return (
    <footer className="mt-10 border-t border-border px-4 py-6 text-xs text-muted-foreground">
      <div className="mx-auto flex max-w-6xl flex-wrap gap-x-4 gap-y-1">
        <span>© {new Date().getFullYear()} FishRadar AI</span>
        <Link href="/terms" className="hover:underline">Terms</Link>
        <Link href="/privacy" className="hover:underline">Privacy</Link>
        <Link href="/partner" className="hover:underline">Partner portal</Link>
        <Link href="/sources" className="hover:underline">Data sources</Link>
        <span>Conditions: NOAA, NWS, USGS, Open-Meteo. Fishing involves risk — check forecasts and regulations.</span>
      </div>
    </footer>
  );
}
