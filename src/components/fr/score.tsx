import type { ScoreResult } from "@/lib/scoring";
import { cn } from "@/lib/utils";

export const scoreColor = (s: number) => (s >= 75 ? "#16a34a" : s >= 55 ? "#65a30d" : s >= 40 ? "#ca8a04" : s >= 25 ? "#ea580c" : "#64748b");
export const scoreWord = (s: number) => (s >= 75 ? "Excellent" : s >= 55 ? "Good" : s >= 40 ? "Fair" : s >= 25 ? "Slow" : "Poor");

export function ScoreDial({ score, size = 72, className }: { score: number; size?: number; className?: string }) {
  const r = size / 2 - 6;
  const c = 2 * Math.PI * r;
  return (
    <div className={cn("relative inline-flex items-center justify-center", className)} style={{ width: size, height: size }} role="img" aria-label={`Fishing Score ${score} out of 100`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--muted)" strokeWidth="6" fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={scoreColor(score)} strokeWidth="6" fill="none" strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} strokeLinecap="round" />
      </svg>
      <span className="absolute text-lg font-bold" style={{ fontSize: size / 3.6 }}>{score}</span>
    </div>
  );
}

export function ScoreBreakdown({ result }: { result: ScoreResult }) {
  return (
    <details className="group text-sm">
      <summary className="cursor-pointer text-primary hover:underline">Why this score?</summary>
      <ul className="mt-2 space-y-1">
        {result.factors.sort((a, b) => b.points - a.points).map((f) => (
          <li key={f.key} className="flex items-center gap-2">
            <span className="w-40 shrink-0 text-muted-foreground">{f.note}</span>
            <span className="h-2 flex-1 rounded bg-muted"><span className="block h-2 rounded" style={{ width: `${f.value * 100}%`, background: scoreColor(f.value * 100) }} /></span>
            <span className="w-12 text-right tabular-nums">+{f.points}</span>
          </li>
        ))}
      </ul>
      {result.missing.length > 0 && <p className="mt-2 text-xs text-muted-foreground">Not scored (data unavailable): {result.missing.join(", ")}.</p>}
      {result.safetyNote && <p className="mt-2 text-xs font-semibold text-danger">Capped for safety: {result.safetyNote}</p>}
    </details>
  );
}
