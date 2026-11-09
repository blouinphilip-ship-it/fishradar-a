import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { adminAddSource, adminMapUnmatched, adminResolveFlag, adminReviewReport, adminRunAlerts, adminSetRole, adminToggleSource } from "@/app/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { aiEnabled } from "@/lib/ai/claude";
import { env } from "@/lib/env";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Admin" };
export const dynamic = "force-dynamic";

const field = "h-9 w-full rounded-md border border-border bg-background px-2 text-sm";

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ tab?: string; alerts?: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  if (session.user.role !== "admin" && session.user.role !== "moderator") return <p className="mx-auto max-w-xl px-4 py-10">You don&apos;t have access to this page.</p>;
  const { tab = "sources", alerts } = await searchParams;

  const [sources, pending, unmatched, flags, ai, lures, baits, counts] = await Promise.all([
    db.execute<{ id: number; name: string; type: string; url: string | null; allowed: boolean; enabled: boolean; trustScore: number; schedule: string | null; lastSuccessAt: string | null; lastErrorAt: string | null; lastError: string | null; permissionNotes: string | null; total: number; week: number; pendingN: number }>(sql`
      select s.id, s.name, s.type, s.url, s.allowed, s.enabled, s.trust_score as "trustScore", s.schedule, s.last_success_at as "lastSuccessAt", s.last_error_at as "lastErrorAt", s.last_error as "lastError", s.permission_notes as "permissionNotes",
        (select count(*)::int from reports r where r.source_id = s.id) total, (select count(*)::int from reports r where r.source_id = s.id and r.created_at > now() - interval '7 days') week,
        (select count(*)::int from reports r where r.source_id = s.id and r.review_status = 'pending') "pendingN"
      from sources s order by s.type, s.name`),
    db.execute<{ id: number; summary: string; confidence: number; createdAt: string; source: string; model: string | null }>(sql`select r.id, r.summary, r.confidence, r.created_at as "createdAt", s.name as source, r.extraction_model as model from reports r join sources s on s.id = r.source_id where r.review_status = 'pending' order by r.created_at desc limit 30`),
    db.execute<{ id: number; kind: string; rawText: string; createdAt: string }>(sql`select id, kind, raw_text as "rawText", created_at as "createdAt" from unmatched_mentions where status = 'pending' order by created_at desc limit 40`),
    db.execute<{ id: number; targetType: string; targetId: string; reason: string; automated: boolean; createdAt: string }>(sql`select id, target_type as "targetType", target_id as "targetId", reason, automated, created_at as "createdAt" from moderation_flags where status = 'pending' order by created_at desc limit 40`),
    db.execute<{ jobType: string; model: string; n: number; failed: number; cost: number; tin: number; tout: number }>(sql`select job_type as "jobType", model, count(*)::int n, count(*) filter (where status <> 'succeeded')::int failed, coalesce(sum(cost_usd),0)::float cost, coalesce(sum(tokens_in),0)::int tin, coalesce(sum(tokens_out),0)::int tout from ai_jobs where created_at > date_trunc('day', now()) group by 1, 2 order by cost desc`),
    db.execute<{ slug: string; name: string }>(sql`select slug, brand || ' ' || model as name from lures order by 2`),
    db.execute<{ slug: string; name: string }>(sql`select slug, name from baits order by 2`),
    db.execute<{ reports: number; demo: number; catches: number; users: number; alerts: number }>(sql`select (select count(*)::int from reports) reports, (select count(*)::int from reports where is_demo) demo, (select count(*)::int from catches) catches, (select count(*)::int from "user") users, (select count(*)::int from alerts) alerts`),
  ]);
  const spent = ai.reduce((a, r) => a + r.cost, 0);
  const tabs = [["sources", "Sources & health"], ["review", `Review queue (${pending.length + unmatched.length})`], ["moderation", `Moderation (${flags.length})`], ["ai", "AI usage"], ["users", "Users"]];
  const c = counts[0];

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6">
      <header className="flex flex-wrap items-end gap-4">
        <div className="flex-1"><h1 className="text-2xl font-bold">Admin</h1><p className="text-sm text-muted-foreground">{c.reports} reports ({c.demo} demo) · {c.catches} catches · {c.users} users · {c.alerts} alerts · AI {aiEnabled() ? `on — $${spent.toFixed(3)} of $${env.AI_DAILY_BUDGET_USD} today` : "off (no key)"}</p></div>
        <form action={adminRunAlerts}><Button size="sm" variant="outline">Run alert check now</Button></form>
      </header>
      {alerts && <p className="rounded-md border border-border bg-muted p-2 text-sm">Alert check: fired {alerts.split("/")[0]} of {alerts.split("/")[1]} alerts.</p>}
      <nav className="flex flex-wrap gap-1 border-b border-border">{tabs.map(([k, l]) => <Link key={k} href={`/admin?tab=${k}`} className={cn("-mb-px border-b-2 px-3 py-2 text-sm font-medium", tab === k ? "border-primary" : "border-transparent text-muted-foreground")}>{l}</Link>)}</nav>

      {tab === "sources" && (
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left text-xs text-muted-foreground"><tr><th className="p-2">Source</th><th className="p-2">Status</th><th className="p-2">Reports</th><th className="p-2">Last success / error</th><th className="p-2"></th></tr></thead>
              <tbody>
                {sources.map((s) => (
                  <tr key={s.id} className="border-t border-border align-top">
                    <td className="p-2"><p className="font-medium">{s.name}</p><p className="text-xs text-muted-foreground">{s.type}{s.schedule ? ` · ${s.schedule}` : ""} · trust {s.trustScore}</p>{s.permissionNotes && <p className="text-[11px] text-muted-foreground">{s.permissionNotes}</p>}</td>
                    <td className="p-2"><div className="flex flex-col gap-1">{s.allowed ? <Badge variant="verified">permitted</Badge> : <Badge variant="outline">not permitted</Badge>}{s.enabled ? <Badge variant="verified">enabled</Badge> : <Badge variant="outline">disabled</Badge>}</div></td>
                    <td className="p-2 tabular-nums">{s.total} <span className="text-xs text-muted-foreground">({s.week} this week{s.pendingN ? `, ${s.pendingN} pending` : ""})</span></td>
                    <td className="p-2 text-xs">{s.lastSuccessAt ? `✓ ${timeAgo(s.lastSuccessAt)}` : "—"}{s.lastError && <p className="text-danger">✗ {timeAgo(s.lastErrorAt)}: {s.lastError}</p>}</td>
                    <td className="space-y-1 p-2">
                      <form action={adminToggleSource.bind(null, s.id, "enabled")}><Button size="sm" variant="outline" className="w-full">{s.enabled ? "Disable" : "Enable"}</Button></form>
                      <form action={adminToggleSource.bind(null, s.id, "allowed")}><Button size="sm" variant="ghost" className="w-full text-xs">{s.allowed ? "Revoke permission" : "Mark permitted"}</Button></form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <form action={adminAddSource} className="space-y-2 rounded-xl border border-border bg-surface p-4 text-sm">
            <h2 className="font-semibold">Add a source</h2>
            <Input name="name" required placeholder="Name (e.g. Shop weekly report RSS)" />
            <select name="type" className={field}><option value="rss">RSS / Atom feed</option><option value="reddit">Reddit (official API)</option><option value="web_allowlisted">Allow-listed web page (RSS-style)</option><option value="partner">Partner (manual)</option></select>
            <Input name="url" type="url" placeholder="Feed URL" />
            <Input name="schedule" placeholder="Cron, e.g. 0 * * * *" />
            <textarea name="permissionNotes" rows={3} placeholder="Permission record: terms reviewed, robots.txt checked, agreement on file…" className="w-full rounded-md border border-border bg-background p-2" />
            <label className="flex items-center gap-2"><input type="checkbox" name="allowed" /> Permission confirmed</label>
            <Button className="w-full">Add (disabled until you enable it)</Button>
            <p className="text-[11px] text-muted-foreground">The worker (pnpm worker) schedules enabled + permitted sources. Restart it or use the scheduler job to pick up new ones.</p>
          </form>
        </div>
      )}

      {tab === "review" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <section><h2 className="mb-2 font-semibold">Reports awaiting review</h2>
            <ul className="space-y-2">{pending.map((r) => (
              <li key={r.id} className="rounded-lg border border-border p-3 text-sm"><p className="text-xs text-muted-foreground">{r.source} · confidence {r.confidence} · {r.model} · {timeAgo(r.createdAt)}</p><p className="mt-1">{r.summary}</p>
                <div className="mt-2 flex gap-2"><form action={adminReviewReport.bind(null, r.id, "approved")}><Button size="sm">Approve</Button></form><form action={adminReviewReport.bind(null, r.id, "rejected")}><Button size="sm" variant="outline">Reject</Button></form></div></li>))}
              {pending.length === 0 && <p className="text-sm text-muted-foreground">Nothing pending.</p>}</ul>
          </section>
          <section><h2 className="mb-2 font-semibold">Unrecognized lures, baits &amp; places</h2>
            <ul className="space-y-2">{unmatched.map((u) => (
              <li key={u.id} className="rounded-lg border border-border p-3 text-sm"><p><Badge variant="outline">{u.kind}</Badge> “{u.rawText}”</p>
                {u.kind === "lure" || u.kind === "bait" ? (
                  <form action={adminMapUnmatched.bind(null, u.id)} className="mt-2 flex gap-2"><select name="target" className={field}><option value="">— ignore —</option>{(u.kind === "lure" ? lures : baits).map((l) => <option key={l.slug} value={l.slug}>{l.name}</option>)}</select><Button size="sm">Save alias</Button></form>
                ) : <form action={adminMapUnmatched.bind(null, u.id)} className="mt-2"><Button size="sm" variant="outline">Dismiss</Button></form>}
              </li>))}
              {unmatched.length === 0 && <p className="text-sm text-muted-foreground">Nothing to map.</p>}</ul>
          </section>
        </div>
      )}

      {tab === "moderation" && (
        <ul className="space-y-2">{flags.map((f) => (
          <li key={f.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3 text-sm">
            <Badge variant={f.automated ? "outline" : "danger"}>{f.automated ? "auto" : "user report"}</Badge>
            <span className="flex-1">{f.targetType} {f.targetType === "catch" ? <Link href={`/catches/${f.targetId}`} className="text-primary hover:underline">{f.targetId.slice(0, 8)}</Link> : f.targetId}: {f.reason} <span className="text-xs text-muted-foreground">{timeAgo(f.createdAt)}</span></span>
            <form action={adminResolveFlag.bind(null, f.id, "approved", true)}><Button size="sm" variant="outline">Hide content</Button></form>
            <form action={adminResolveFlag.bind(null, f.id, "rejected", false)}><Button size="sm" variant="ghost">Dismiss</Button></form>
          </li>))}
          {flags.length === 0 && <p className="text-sm text-muted-foreground">No open flags.</p>}</ul>
      )}

      {tab === "ai" && (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm"><thead className="bg-muted text-left text-xs text-muted-foreground"><tr><th className="p-2">Job</th><th className="p-2">Model</th><th className="p-2">Calls</th><th className="p-2">Failed / review</th><th className="p-2">Tokens in/out</th><th className="p-2">Cost today</th></tr></thead>
            <tbody>{ai.map((r) => <tr key={r.jobType + r.model} className="border-t border-border"><td className="p-2">{r.jobType}</td><td className="p-2">{r.model}</td><td className="p-2">{r.n}</td><td className="p-2">{r.failed}</td><td className="p-2">{r.tin.toLocaleString()} / {r.tout.toLocaleString()}</td><td className="p-2">${r.cost.toFixed(4)}</td></tr>)}
              {ai.length === 0 && <tr><td colSpan={6} className="p-3 text-muted-foreground">No AI calls today{aiEnabled() ? "" : " — set ANTHROPIC_API_KEY to enable Claude"}.</td></tr>}</tbody></table>
        </div>
      )}

      {tab === "users" && (
        <form action={adminSetRole} className="max-w-md space-y-2 text-sm">
          <h2 className="font-semibold">Set a user&apos;s role</h2>
          <Input name="email" type="email" required placeholder="user@example.com" />
          <select name="role" className={field}><option value="partner">Partner (can submit reports)</option><option value="moderator">Moderator</option><option value="admin">Admin</option><option value="angler">Angler</option></select>
          <Button>Update role</Button>
          <p className="text-[11px] text-muted-foreground">Making someone a partner creates a dedicated partner source so their reports are attributed to them.</p>
        </form>
      )}
    </div>
  );
}
