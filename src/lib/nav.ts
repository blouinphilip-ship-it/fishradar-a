export type Mode = "saltwater" | "freshwater" | "runs";

export const MODES: { id: Mode; label: string; href: string }[] = [
  { id: "saltwater", label: "Saltwater", href: "/saltwater" },
  { id: "freshwater", label: "Freshwater", href: "/freshwater" },
  { id: "runs", label: "Runs", href: "/runs" },
];

/** Work out which mode tab is active from the URL. Run pages under /saltwater/runs count as "runs". */
export function modeFromPath(pathname: string, searchMode?: string | null): Mode | null {
  if (searchMode === "saltwater" || searchMode === "freshwater" || searchMode === "runs") return searchMode;
  if (pathname.startsWith("/runs") || pathname.startsWith("/saltwater/runs")) return "runs";
  if (pathname.startsWith("/saltwater")) return "saltwater";
  if (pathname.startsWith("/freshwater")) return "freshwater";
  return null;
}

export const SECONDARY_LINKS = [
  { href: "/lures", label: "Top Lures" },
  { href: "/catches", label: "Catches" },
  { href: "/assistant", label: "AI Assistant" },
];
