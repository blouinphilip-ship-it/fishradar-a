import type { Metadata } from "next";
import Link from "next/link";
import { sql } from "drizzle-orm";
import { Fish } from "lucide-react";
import { db } from "@/db";
import { buttonVariants } from "@/components/ui/button";
import { CatchCard } from "@/components/fr/catch-card";
import { getCatches } from "@/lib/data";

export const metadata: Metadata = { title: "Community catches" };
export const dynamic = "force-dynamic";

export default async function CatchesPage({ searchParams }: { searchParams: Promise<{ species?: string }> }) {
  const { species } = await searchParams;
  const sp = species ? (await db.execute<{ id: number }>(sql`select id from species where slug = ${species}`))[0] : null;
  const [catches, speciesOpts] = await Promise.all([
    getCatches({ speciesId: sp?.id, limit: 48 }),
    db.execute<{ slug: string; name: string; n: number }>(sql`select s.slug, s.common_name as name, count(*)::int n from catches c join species s on s.id = c.species_id where c.moderation = 'approved' group by s.id order by n desc limit 14`),
  ]);
  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-3xl font-bold">Community catches</h1><p className="mt-1 text-sm text-muted-foreground">Fresh catches from anglers. Locations are fuzzed to protect spots.</p></div>
        <Link href="/catches/new" className={buttonVariants()}><Fish /> Log a catch</Link>
      </header>
      <div className="flex flex-wrap gap-2 text-xs">
        <Link href="/catches" className={`rounded-full border px-2.5 py-1 ${!species ? "bg-primary text-primary-foreground" : "border-border hover:bg-muted"}`}>All</Link>
        {speciesOpts.map((s) => <Link key={s.slug} href={`/catches?species=${s.slug}`} className={`rounded-full border px-2.5 py-1 ${species === s.slug ? "bg-primary text-primary-foreground" : "border-border hover:bg-muted"}`}>{s.name} ({s.n})</Link>)}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{catches.map((c) => <CatchCard key={c.id} c={c} />)}</div>
      {catches.length === 0 && <p className="text-sm text-muted-foreground">No catches yet — be the first.</p>}
    </div>
  );
}
