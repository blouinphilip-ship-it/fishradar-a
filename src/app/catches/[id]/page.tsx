import type { Metadata } from "next";
import { Img } from "@/components/ui/img";
import Link from "next/link";
import { notFound } from "next/navigation";
import { sql } from "drizzle-orm";
import { Flag, Heart } from "lucide-react";
import { auth } from "@/auth";
import { db } from "@/db";
import { addComment, flagContent, toggleLike } from "@/app/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SpeciesPhoto } from "@/components/fish/species-photo";
import { MiniMap } from "@/components/fr/mini-map";
import { getCatches } from "@/lib/data";
import { timeAgo } from "@/lib/format";

export const metadata: Metadata = { title: "Catch" };

export default async function CatchPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ new?: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const session = await auth();
  const [k] = await getCatches({ id, limit: 1 });
  if (!k) notFound();
  const comments = await db.execute<{ id: number; body: string; createdAt: string; handle: string | null }>(sql`select c.id, c.body, c.created_at as "createdAt", u.handle from comments c join "user" u on u.id = c.user_id where c.catch_id = ${id} and c.moderation = 'approved' order by c.created_at`);
  const liked = session?.user ? (await db.execute(sql`select 1 from likes where user_id = ${session.user.id} and catch_id = ${id}`)).length > 0 : false;
  const isNew = (await searchParams).new;
  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-6">
      {isNew && <p className="rounded-lg border border-verified bg-verified/10 p-3 text-sm">Catch saved! Location is shown {k.privacy === "precise" ? "precisely" : k.privacy === "region" ? "as region only" : "fuzzed to about 2 miles"}.</p>}
      <div className="grid gap-6 md:grid-cols-2">
        {k.photoUrl ? <Img src={k.photoUrl} alt={k.speciesName ?? ""} className="w-full rounded-xl" /> : <SpeciesPhoto slug={k.speciesSlug ?? ""} scientificName={null} name={k.speciesName ?? ""} className="h-64 w-full rounded-xl" />}
        <div className="space-y-3 text-sm">
          <h1 className="text-2xl font-bold">{k.speciesName}{k.lengthIn ? ` · ${k.lengthIn}"` : ""}{k.weightLb ? ` · ${k.weightLb} lb` : ""}</h1>
          <p>Caught by <Link href={`/u/${k.userHandle}`} className="text-primary hover:underline">@{k.userHandle}</Link> · {new Date(k.caughtAt).toLocaleString()} ({timeAgo(k.caughtAt)})</p>
          {k.spotName && <p>Near <Link href={`/spot/${k.spotSlug}`} className="text-primary hover:underline">{k.spotName}</Link></p>}
          {(k.lureName || k.baitName) && <p>On {k.lureSlug ? <Link href={`/lures/${k.lureSlug}`} className="text-primary hover:underline">{k.lureName}</Link> : k.lureName ?? k.baitName}</p>}
          <p>{k.released ? "Released" : "Kept"} · <Badge variant="outline">{k.verification.replace("_", " ")}</Badge> {k.isDemo && <Badge variant="demo">Demo</Badge>}</p>
          {k.notes && <p className="rounded-lg bg-muted p-3">{k.notes}</p>}
          <div className="flex gap-2">
            <form action={toggleLike.bind(null, id)}><Button size="sm" variant={liked ? "secondary" : "outline"}><Heart className={liked ? "fill-current" : ""} /> {k.likes}</Button></form>
            <form action={flagContent.bind(null, "catch", id)}><input type="hidden" name="reason" value="Reported from catch page" /><Button size="sm" variant="ghost"><Flag /> Report</Button></form>
          </div>
          {k.lat != null && k.lon != null && <MiniMap points={[{ lat: k.lat, lon: k.lon, color: "#f43f5e", radius: 8, label: "Approximate location" }]} className="h-48 w-full rounded-xl" animatePath={false} />}
        </div>
      </div>
      <section>
        <h2 className="mb-2 text-lg font-semibold">Comments ({comments.length})</h2>
        <ul className="space-y-2">{comments.map((cm) => <li key={cm.id} className="rounded-lg border border-border p-2 text-sm"><span className="font-semibold">@{cm.handle ?? "angler"}</span> <span className="text-xs text-muted-foreground">{timeAgo(cm.createdAt)}</span><p>{cm.body}</p></li>)}</ul>
        {session?.user ? (
          <form action={addComment.bind(null, id)} className="mt-3 flex gap-2"><input name="body" required maxLength={1000} placeholder="Nice fish! What tide?" className="h-9 flex-1 rounded-md border border-border bg-background px-2 text-sm" /><Button size="sm">Post</Button></form>
        ) : <p className="mt-2 text-sm"><Link href="/signin" className="text-primary hover:underline">Sign in</Link> to comment.</p>}
      </section>
    </div>
  );
}
