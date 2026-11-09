import Link from "next/link";
import { Img } from "@/components/ui/img";
import { Heart, MessageCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SpeciesPhoto } from "@/components/fish/species-photo";
import type { PublicCatch } from "@/lib/data";
import { timeAgo } from "@/lib/format";

export function CatchCard({ c }: { c: PublicCatch }) {
  return (
    <Link href={`/catches/${c.id}`} className="overflow-hidden rounded-xl border border-border bg-surface hover:border-primary">
      {c.photoUrl ? <Img src={c.photoUrl} alt={c.speciesName ?? "Catch"} className="h-44 w-full object-cover" /> : <SpeciesPhoto slug={c.speciesSlug ?? ""} scientificName={null} name={c.speciesName ?? ""} className="h-44 w-full" />}
      <div className="space-y-1 p-3 text-sm">
        <div className="flex items-center gap-2"><span className="font-semibold">{c.speciesName ?? "Unknown species"}</span>{c.lengthIn ? <span className="text-muted-foreground">{c.lengthIn}&quot;</span> : null}{c.weightLb ? <span className="text-muted-foreground">{c.weightLb} lb</span> : null}{c.isDemo && <Badge variant="demo">Demo</Badge>}</div>
        <p className="text-xs text-muted-foreground">{c.lureName ? `on ${c.lureName}` : c.baitName ? `on ${c.baitName}` : ""}{c.spotName ? ` · near ${c.spotName}` : ""}</p>
        <p className="flex items-center gap-3 text-xs text-muted-foreground"><span>@{c.userHandle ?? "angler"} · {timeAgo(c.caughtAt)}</span><span className="ml-auto inline-flex items-center gap-1"><Heart className="size-3" />{c.likes}</span><span className="inline-flex items-center gap-1"><MessageCircle className="size-3" />{c.comments}</span></p>
      </div>
    </Link>
  );
}
