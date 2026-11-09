import { MONTHS, MONTH_NAMES } from "@/lib/format";
import { cn } from "@/lib/utils";

/** 12-month seasonal likelihood bar (seasonal expectation, not observations). */
export function SeasonBar({ monthly, className, now = new Date() }: { monthly: number[]; className?: string; now?: Date }) {
  const m = now.getMonth();
  return (
    <div className={cn("flex items-end gap-px", className)} role="img" aria-label={`Season: ${monthly.map((v, i) => `${MONTH_NAMES[i]} ${Math.round(v * 100)}%`).join(", ")}`}>
      {monthly.map((v, i) => (
        <div key={i} className="flex flex-1 flex-col items-center gap-0.5">
          <div className={cn("w-full rounded-sm", i === m ? "ring-1 ring-foreground" : "")} style={{ height: `${4 + v * 18}px`, background: `color-mix(in srgb, var(--seasonal) ${Math.round(15 + v * 85)}%, transparent)` }} />
          <span className={cn("text-[9px] leading-none", i === m ? "font-bold text-foreground" : "text-muted-foreground")}>{MONTHS[i]}</span>
        </div>
      ))}
    </div>
  );
}
