"use client";

import { useEffect, useState } from "react";
import { FishIllustration } from "./fish-illustration";

type Photo = { url: string; attribution: string; license: string; sourceUrl: string };

/**
 * Species photo from iNaturalist's taxon default photo (Creative Commons; attribution shown).
 * Loaded in the browser and cached in sessionStorage. Falls back to an illustration.
 */
export function SpeciesPhoto({ slug, scientificName, name, className, size = "medium" }: { slug: string; scientificName: string | null; name: string; className?: string; size?: "square" | "medium" }) {
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!scientificName || scientificName.includes("spp.")) return;
    const key = `inat:${scientificName}`;
    try {
      const hit = sessionStorage.getItem(key);
      if (hit) { const p = JSON.parse(hit); if (p) setPhoto(p); else setFailed(true); return; }
    } catch { /* ignore */ }
    const ctrl = new AbortController();
    fetch(`https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(scientificName)}&rank=species,genus&per_page=1`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j) => {
        const t = j.results?.[0];
        const dp = t?.default_photo;
        const allowed = dp?.license_code && /^cc/.test(dp.license_code);
        const p: Photo | null = dp && allowed ? { url: size === "square" ? dp.square_url : dp.medium_url, attribution: dp.attribution, license: dp.license_code.toUpperCase(), sourceUrl: `https://www.inaturalist.org/taxa/${t.id}` } : null;
        try { sessionStorage.setItem(key, JSON.stringify(p)); } catch { /* ignore */ }
        if (p) setPhoto(p); else setFailed(true);
      })
      .catch(() => setFailed(true));
    return () => ctrl.abort();
  }, [scientificName, size]);

  if (!photo || failed) {
    return (
      <div className={`flex items-center justify-center bg-gradient-to-b from-sky-900/40 to-sky-950/60 ${className ?? ""}`}>
        <FishIllustration slug={slug} className="h-full w-full p-2" title={name} />
      </div>
    );
  }
  return (
    <figure className={`group relative overflow-hidden bg-muted ${className ?? ""}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photo.url} alt={name} className="h-full w-full object-cover" loading="lazy" onError={() => setFailed(true)} />
      <figcaption className="absolute inset-x-0 bottom-0 truncate bg-black/60 px-1.5 py-0.5 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100">
        <a href={photo.sourceUrl} target="_blank" rel="noreferrer">{photo.attribution} · {photo.license} · iNaturalist</a>
      </figcaption>
    </figure>
  );
}
