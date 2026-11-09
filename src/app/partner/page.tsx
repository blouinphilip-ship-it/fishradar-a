import type { Metadata } from "next";
import Link from "next/link";
import { sql } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { submitPartnerReport } from "@/app/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { timeAgo } from "@/lib/format";

export const metadata: Metadata = { title: "Partner portal" };

type SP = { result?: string; review?: string; method?: string; unmatched?: string };

export default async function PartnerPage({ searchParams }: { searchParams: Promise<SP> }) {
  const session = await auth();
  const sp = await searchParams;
  const isPartner = session?.user && (session.user.role === "partner" || session.user.role === "admin");
  const [spots, mine] = await Promise.all([
    db.execute<{ id: number; name: string; state: string | null }>(sql`select s.id, s.name, r.state_code as state from spots s left join regions r on r.id = s.region_id order by r.state_code, s.name`),
    session?.user ? db.execute<{ id: number; title: string | null; status: string; createdAt: string; reportId: number | null; review: string | null }>(sql`select x.id, x.title, x.status, x.created_at as "createdAt", x.report_id as "reportId", r.review_status as review from raw_submissions x left join reports r on r.id = x.report_id where x.submitted_by = ${session.user.id} order by x.created_at desc limit 20`) : Promise.resolve([]),
  ]);
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6">
      <header>
        <h1 className="text-2xl font-bold">Partner portal</h1>
        <p className="mt-1 text-sm text-muted-foreground">Tackle shops, charter captains, guides and clubs: post your weekly report in two minutes. Reports are summarized, linked to species and lures, shown with your shop&apos;s name, and linked back to you.</p>
      </header>
      {!session?.user && <p className="text-sm"><Link href="/signin" className="text-primary hover:underline">Sign in</Link> to submit reports. Partner access is granted by FishRadar staff.</p>}
      {session?.user && !isPartner && <p className="rounded-lg border border-border bg-muted p-3 text-sm">Your account isn&apos;t a partner account yet. Ask FishRadar to enable partner access (admins can do this in /admin → Users).</p>}
      {sp.result && (
        <div className={`rounded-lg border p-3 text-sm ${sp.result === "stored" ? "border-verified bg-verified/10" : "border-border bg-muted"}`}>
          {sp.result === "stored" ? <>Report received and processed ({sp.method === "claude" ? "AI extraction" : "rule-based extraction"}). Status: <b>{sp.review === "approved" ? "published" : "queued for review"}</b>.</> : sp.result === "duplicate" ? "This report was already submitted." : sp.result === "not_a_report" ? "We couldn't find fishing details (species/results) in that text — add what's biting and where." : `Not stored: ${sp.result}`}
          {sp.unmatched && <p className="mt-1 text-xs text-muted-foreground">Sent to review (unrecognized): {sp.unmatched}</p>}
        </div>
      )}
      {isPartner && (
        <form action={submitPartnerReport} className="space-y-3 rounded-xl border border-border bg-surface p-4 text-sm">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block"><span className="mb-1 block text-xs">Spot *</span><select name="spotId" required className="h-9 w-full rounded-md border border-border bg-background px-2"><option value="">Choose…</option>{spots.map((s) => <option key={s.id} value={s.id}>{s.state} — {s.name}</option>)}</select></label>
            <label className="block"><span className="mb-1 block text-xs">Report date *</span><Input type="date" name="reportDate" required defaultValue={new Date().toISOString().slice(0, 10)} /></label>
          </div>
          <label className="block"><span className="mb-1 block text-xs">Title</span><Input name="title" maxLength={140} placeholder="Weekly report: fall run in full swing" /></label>
          <label className="block"><span className="mb-1 block text-xs">Report * (what&apos;s biting, where, on what, conditions)</span><textarea name="body" required minLength={40} maxLength={8000} rows={7} className="w-full rounded-md border border-border bg-background p-2" placeholder="Stripers were thick at the Point on the dropping tide at first light, mostly 24–30 in with a few keepers. White bucktails with pork rind and SP Minnows did the damage; live eels after dark. Water 56°F, NW 15." /></label>
          <label className="block"><span className="mb-1 block text-xs">Link to the full report on your site (optional)</span><Input name="url" type="url" placeholder="https://yourshop.com/reports/..." /></label>
          <Button>Submit report</Button>
          <p className="text-[11px] text-muted-foreground">By submitting you confirm you have the right to share this report and grant FishRadar a license to display a summary with attribution and a link back.</p>
        </form>
      )}
      {mine.length > 0 && (
        <section><h2 className="mb-2 font-semibold">Your submissions</h2>
          <ul className="space-y-1 text-sm">{mine.map((m) => <li key={m.id} className="flex items-center gap-2"><span className="flex-1">{m.title ?? `Report #${m.id}`}</span><Badge variant={m.review === "approved" ? "verified" : "outline"}>{m.review ?? m.status}</Badge><span className="text-xs text-muted-foreground">{timeAgo(m.createdAt)}</span></li>)}</ul>
        </section>
      )}
    </div>
  );
}
