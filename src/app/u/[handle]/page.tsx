import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { sql } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { toggleFollow } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { CatchCard } from "@/components/fr/catch-card";
import { getCatches } from "@/lib/data";

export const metadata: Metadata = { title: "Angler" };

export default async function UserPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const [u] = await db.execute<{ id: string; name: string | null; handle: string; bio: string | null; reputation: number }>(sql`select id, name, handle, bio, reputation from "user" where handle = ${handle}`);
  if (!u) notFound();
  const session = await auth();
  const [catches, stats, following] = await Promise.all([
    getCatches({ userId: u.id, limit: 24 }),
    db.execute<{ catches: number; species: number; followers: number }>(sql`select (select count(*)::int from catches where user_id = ${u.id} and moderation='approved') catches, (select count(distinct species_id)::int from catches where user_id = ${u.id}) species, (select count(*)::int from follows where followee_id = ${u.id}) followers`),
    session?.user ? db.execute(sql`select 1 from follows where follower_id = ${session.user.id} and followee_id = ${u.id}`) : Promise.resolve([]),
  ]);
  const st = stats[0];
  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6">
      <header className="flex flex-wrap items-center gap-4">
        <div className="flex-1"><h1 className="text-2xl font-bold">{u.name ?? u.handle}</h1><p className="text-sm text-muted-foreground">@{u.handle} · {st.catches} catches · {st.species} species · {st.followers} followers</p>{u.bio && <p className="mt-1 text-sm">{u.bio}</p>}</div>
        {session?.user && session.user.id !== u.id && <form action={toggleFollow.bind(null, u.id, u.handle)}><Button variant={following.length ? "secondary" : "default"}>{following.length ? "Following" : "Follow"}</Button></form>}
      </header>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{catches.map((c) => <CatchCard key={c.id} c={c} />)}</div>
    </div>
  );
}
