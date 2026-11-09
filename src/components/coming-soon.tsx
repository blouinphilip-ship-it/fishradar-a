import { Badge } from "@/components/ui/badge";

export function ComingSoon({ title, phase, children }: { title: string; phase: number; children?: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">{title}</h1>
        <Badge variant="outline">Coming in Phase {phase}</Badge>
      </div>
      <div className="mt-4 space-y-3 text-muted-foreground">{children}</div>
    </div>
  );
}
