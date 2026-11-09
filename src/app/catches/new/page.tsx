import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { logCatch } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const metadata: Metadata = { title: "Log a catch" };

const field = "h-9 w-full rounded-md border border-border bg-background px-2 text-sm";

export default async function NewCatchPage({ searchParams }: { searchParams: Promise<{ spot?: string; species?: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/signin?next=/catches/new");
  const sp = await searchParams;
  const [species, spots, lures, baits] = await Promise.all([
    db.execute<{ id: number; name: string }>(sql`select id, common_name as name from species order by common_name`),
    db.execute<{ id: number; name: string; state: string | null }>(sql`select s.id, s.name, r.state_code as state from spots s left join regions r on r.id = s.region_id order by r.state_code, s.name`),
    db.execute<{ id: number; name: string }>(sql`select id, brand || ' ' || model as name from lures order by brand, model`),
    db.execute<{ id: number; name: string }>(sql`select id, name from baits order by name`),
  ]);
  const now = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6">
      <h1 className="text-2xl font-bold">Log a catch</h1>
      <p className="mt-1 text-sm text-muted-foreground">Conditions at that time and place are attached automatically. Photo GPS data is stripped before saving.</p>
      <form action={logCatch} className="mt-6 space-y-4">
        <label className="block text-sm"><span className="mb-1 block font-medium">Photo</span><input type="file" name="photo" accept="image/jpeg,image/png,image/webp,image/heic" className="text-sm" /></label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm"><span className="mb-1 block font-medium">Species *</span>
            <select name="speciesId" required defaultValue={sp.species ?? ""} className={field}><option value="" disabled>Choose…</option>{species.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
          <label className="block text-sm"><span className="mb-1 block font-medium">When *</span><Input type="datetime-local" name="caughtAt" required defaultValue={now} /></label>
          <label className="block text-sm"><span className="mb-1 block font-medium">Length (in)</span><Input type="number" step="0.5" name="lengthIn" min={0} /></label>
          <label className="block text-sm"><span className="mb-1 block font-medium">Weight (lb)</span><Input type="number" step="0.1" name="weightLb" min={0} /></label>
          <label className="block text-sm"><span className="mb-1 block font-medium">Lure</span>
            <select name="lureId" className={field}><option value="">—</option>{lures.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
          <label className="block text-sm"><span className="mb-1 block font-medium">…or bait</span>
            <select name="baitId" className={field}><option value="">—</option>{baits.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
          <label className="block text-sm sm:col-span-2"><span className="mb-1 block font-medium">Lure not listed? Describe it</span><Input name="lureFreeText" maxLength={80} placeholder="e.g. white 1 oz bucktail with pink trailer" /></label>
          <label className="block text-sm sm:col-span-2"><span className="mb-1 block font-medium">Spot</span>
            <select name="spotId" defaultValue={sp.spot ?? ""} className={field}><option value="">Nearest to coordinates below</option>{spots.map((s) => <option key={s.id} value={s.id}>{s.state} — {s.name}</option>)}</select></label>
          <label className="block text-sm"><span className="mb-1 block font-medium">Latitude (optional)</span><Input name="lat" type="number" step="any" placeholder="41.07" /></label>
          <label className="block text-sm"><span className="mb-1 block font-medium">Longitude (optional)</span><Input name="lon" type="number" step="any" placeholder="-71.86" /></label>
        </div>
        <fieldset className="text-sm"><legend className="mb-1 font-medium">Location privacy</legend>
          <label className="mr-4"><input type="radio" name="privacy" value="fuzzed" defaultChecked /> Fuzzed (~2 mi) — recommended</label>
          <label className="mr-4"><input type="radio" name="privacy" value="region" /> Region only</label>
          <label><input type="radio" name="privacy" value="precise" /> Precise</label>
        </fieldset>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="released" defaultChecked /> Released</label>
        <label className="block text-sm"><span className="mb-1 block font-medium">Notes</span><textarea name="notes" maxLength={1000} rows={3} className="w-full rounded-md border border-border bg-background p-2 text-sm" /></label>
        <Button type="submit" className="w-full">Save catch</Button>
      </form>
    </div>
  );
}
