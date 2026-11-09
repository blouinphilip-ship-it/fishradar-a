"use client";

import { useEffect, useState } from "react";
import { Check, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { haversineMi } from "@/lib/geo";

export function ShareButton({ title }: { title: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button variant="outline" size="sm" onClick={async () => {
      const url = window.location.href;
      try {
        if (navigator.share) await navigator.share({ title, url });
        else { await navigator.clipboard.writeText(url); setDone(true); setTimeout(() => setDone(false), 2000); }
      } catch { /* cancelled */ }
    }}>{done ? <Check /> : <Share2 />} {done ? "Link copied" : "Share"}</Button>
  );
}

/** Distance from the location the user set on the globe (stored locally, never sent to the server). */
export function DistanceFromMe({ lat, lon }: { lat: number; lon: number }) {
  const [mi, setMi] = useState<number | null>(null);
  useEffect(() => {
    try {
      const p = JSON.parse(localStorage.getItem("fr-location") ?? "null");
      if (p) setMi(Math.round(haversineMi(p.lat, p.lon, lat, lon)));
    } catch { /* ignore */ }
  }, [lat, lon]);
  return mi == null ? null : <span>{mi.toLocaleString()} mi from you</span>;
}

export function YouTubeEmbed({ id, title }: { id: string; title: string }) {
  const [play, setPlay] = useState(false);
  if (play) return <iframe className="aspect-video w-full rounded-lg" src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1`} title={title} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen />;
  return (
    <button onClick={() => setPlay(true)} className="group relative block aspect-video w-full overflow-hidden rounded-lg bg-black" aria-label={`Play ${title}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`} alt="" className="h-full w-full object-cover opacity-80 group-hover:opacity-100" />
      <span className="absolute inset-0 m-auto flex size-12 items-center justify-center rounded-full bg-red-600 text-white">▶</span>
    </button>
  );
}
