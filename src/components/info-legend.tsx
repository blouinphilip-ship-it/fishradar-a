import { Badge } from "@/components/ui/badge";

/** Explains the three information kinds. Shown wherever mixed information appears. */
export function InfoLegend({ className }: { className?: string }) {
  return (
    <div className={className}>
      <ul className="flex flex-wrap gap-2 text-xs">
        <li><Badge variant="verified">Verified report</Badge></li>
        <li><Badge variant="seasonal">Seasonal expectation</Badge></li>
        <li><Badge variant="prediction">AI prediction</Badge></li>
        <li><Badge variant="demo">Demo data</Badge></li>
      </ul>
    </div>
  );
}
