import type { Metadata } from "next";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Data sources" };
export const dynamic = "force-dynamic";

export default async function SourcesPage() {
  const sources = await db.execute<{ name: string; type: string; url: string | null; allowed: boolean; enabled: boolean; permissionNotes: string | null }>(sql`select name, type, url, allowed, enabled, permission_notes as "permissionNotes" from sources order by type, name`);
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6">
      <h1 className="text-2xl font-bold">Where our information comes from</h1>
      <p className="mt-2 text-sm text-muted-foreground">FishRadar only uses sources that allow it: government APIs, partner submissions, official platform APIs and feeds whose terms permit reuse. We show a short summary in our own words with a link back — never the full copied article. Photos and videos are shown only when licensed (Creative Commons with credit, the official YouTube player, or uploaded by users).</p>
      <ul className="mt-6 space-y-2">
        {sources.map((s) => (
          <li key={s.name} className="rounded-lg border border-border bg-surface p-3 text-sm">
            <p className="flex flex-wrap items-center gap-2 font-medium">{s.name} <Badge variant="outline">{s.type.replace("_", " ")}</Badge> {s.enabled && s.allowed ? <Badge variant="verified">active</Badge> : <Badge variant="outline">not active</Badge>}</p>
            {s.permissionNotes && <p className="mt-1 text-xs text-muted-foreground">{s.permissionNotes}</p>}
          </li>
        ))}
      </ul>
      <p className="mt-6 text-xs text-muted-foreground">Copyright concern? Email the DMCA contact listed in our <a href="/terms" className="underline">Terms</a> and we&apos;ll remove the content promptly.</p>
    </div>
  );
}
