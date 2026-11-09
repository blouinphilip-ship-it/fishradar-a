import type { Metadata } from "next";
import Link from "next/link";
import { search } from "@/lib/data";

export const metadata: Metadata = { title: "Search" };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = ((await searchParams).q ?? "").trim();
  const r = q.length >= 2 ? await search(q) : null;
  const total = r ? r.spots.length + r.species.length + r.lures.length + r.runs.length + r.states.length : 0;
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6">
      <h1 className="text-2xl font-bold">Search{q && <> for “{q}”</>}</h1>
      {!r && <p className="mt-2 text-sm text-muted-foreground">Type at least two characters — try “montauk”, “albie”, “winni”, “redfish” or “NH”.</p>}
      {r && total === 0 && <p className="mt-2 text-sm text-muted-foreground">Nothing found. Try a town, a lake, a species nickname or a state code.</p>}
      {r && (
        <div className="mt-6 grid gap-8 md:grid-cols-2">
          {r.spots.length > 0 && <section><h2 className="mb-2 font-semibold">Spots</h2><ul className="space-y-1">{r.spots.map((s) => <li key={s.slug}><Link className="text-primary hover:underline" href={`/spot/${s.slug}`}>{s.name}</Link> <span className="text-xs text-muted-foreground">{s.state} · {s.water === "fresh" ? "freshwater" : "saltwater"}</span></li>)}</ul></section>}
          {r.species.length > 0 && <section><h2 className="mb-2 font-semibold">Species</h2><ul className="space-y-1">{r.species.map((s) => <li key={s.slug}><Link className="text-primary hover:underline" href={`/species/${s.slug}`}>{s.name}</Link> <span className="text-xs text-muted-foreground">{s.nicknames.slice(0, 3).join(", ")}</span></li>)}</ul></section>}
          {r.runs.length > 0 && <section><h2 className="mb-2 font-semibold">Runs</h2><ul className="space-y-1">{r.runs.map((s) => <li key={s.slug}><Link className="text-primary hover:underline" href={`/runs/${s.slug}`}>{s.name}</Link></li>)}</ul></section>}
          {r.lures.length > 0 && <section><h2 className="mb-2 font-semibold">Lures</h2><ul className="space-y-1">{r.lures.map((s) => <li key={s.slug}><Link className="text-primary hover:underline" href={`/lures/${s.slug}`}>{s.name}</Link></li>)}</ul></section>}
          {r.states.length > 0 && <section><h2 className="mb-2 font-semibold">States</h2><ul className="space-y-1">{r.states.map((s) => <li key={s.code}><Link className="text-primary hover:underline" href={`/search?q=${s.code}`}>{s.name}</Link></li>)}</ul></section>}
        </div>
      )}
    </div>
  );
}
