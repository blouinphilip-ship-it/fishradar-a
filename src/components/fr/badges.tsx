import { Badge } from "@/components/ui/badge";
import type { RunStatus } from "@/lib/scoring";
import { RUN_STATUS_LABEL } from "@/lib/scoring";
import { cn } from "@/lib/utils";

export function ReportKindBadge({ isDemo, isVerified, kind }: { isDemo: boolean; isVerified?: boolean; kind?: string }) {
  if (isDemo) return <Badge variant="demo" title="Synthetic sample data generated for the demo — not a real report">Demo data</Badge>;
  if (kind === "user_submitted") return <Badge variant="outline">User report</Badge>;
  return isVerified ? <Badge variant="verified">Verified report</Badge> : <Badge variant="outline">Unverified</Badge>;
}

const STATUS_STYLE: Record<RunStatus, string> = {
  hot: "bg-red-600 text-white", active: "bg-orange-500 text-white", starting: "bg-emerald-600 text-white", tapering: "bg-amber-700 text-white",
  in_season: "bg-seasonal text-seasonal-foreground", out_of_season: "bg-muted text-muted-foreground",
};

export function RunStatusBadge({ status, className }: { status: RunStatus; className?: string }) {
  const label = status === "in_season" ? "Seasonal" : RUN_STATUS_LABEL[status];
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold", STATUS_STYLE[status], className)} title={RUN_STATUS_LABEL[status]}>{status === "hot" ? "🔥 " : ""}{label}</span>;
}

export function WaterBadge({ water }: { water: string }) {
  return water === "fresh" ? <Badge variant="fresh">Freshwater</Badge> : water === "brackish" ? <Badge variant="salt">Brackish</Badge> : <Badge variant="salt">Saltwater</Badge>;
}

export function PredictionBadge({ confidence }: { confidence?: string }) {
  return <Badge variant="prediction">AI prediction{confidence ? ` · ${confidence} confidence` : ""}</Badge>;
}
