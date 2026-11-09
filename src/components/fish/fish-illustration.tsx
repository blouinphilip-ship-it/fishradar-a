import { lookFor } from "@/lib/species-look";

const BODY: Record<string, string> = {
  torpedo: "M14 50 C 40 22, 120 18, 168 42 L 196 26 L 188 50 L 196 74 L 168 58 C 120 82, 40 78, 14 50 Z",
  tuna: "M12 50 C 46 16, 128 14, 166 44 L 196 20 L 186 50 L 196 80 L 166 56 C 128 86, 46 84, 12 50 Z",
  flat: "M14 52 C 40 24, 130 22, 170 46 L 196 32 L 190 52 L 196 72 L 170 58 C 130 80, 40 80, 14 52 Z",
  tall: "M16 50 C 34 8, 130 6, 162 40 L 194 22 L 186 50 L 194 78 L 162 60 C 130 94, 34 92, 16 50 Z",
  billfish: "M2 50 L 34 46 C 60 24, 128 20, 166 42 L 196 18 L 186 50 L 196 82 L 166 58 C 128 80, 60 76, 34 54 Z",
  catfish: "M14 52 C 36 30, 120 26, 168 44 L 196 30 L 190 52 L 196 74 L 168 60 C 120 80, 36 78, 14 52 Z",
  eel: "M8 50 C 60 38, 140 38, 196 50 C 140 62, 60 62, 8 50 Z",
  pike: "M8 50 C 40 34, 130 30, 172 44 L 196 30 L 190 50 L 196 70 L 172 56 C 130 70, 40 66, 8 50 Z",
  trout: "M14 50 C 40 26, 124 22, 168 44 L 196 28 L 188 50 L 196 72 L 168 56 C 124 78, 40 76, 14 50 Z",
};

/** Clean illustrated fish — the default image until a licensed photo is available. */
export function FishIllustration({ slug, className, title }: { slug: string; className?: string; title?: string }) {
  const l = lookFor(slug);
  const id = `g-${slug}`;
  const d = BODY[l.shape] ?? BODY.torpedo;
  const stripes = l.pattern === "stripes" ? [30, 38, 46, 54, 62].map((y) => <path key={y} d={`M30 ${y} C 80 ${y - 4}, 130 ${y - 4}, 165 ${y}`} stroke={l.accent} strokeWidth="2.2" fill="none" opacity="0.75" />) : null;
  const bars = l.pattern === "bars" ? [50, 72, 94, 116, 138].map((x) => <rect key={x} x={x} y="24" width="7" height="44" rx="3" fill={l.accent} opacity="0.45" />) : null;
  const spots = l.pattern === "spots" || l.pattern === "dots"
    ? Array.from({ length: l.pattern === "dots" ? 22 : 12 }, (_, i) => <circle key={i} cx={40 + ((i * 37) % 120)} cy={34 + ((i * 17) % 26)} r={l.pattern === "dots" ? 1.8 : 2.8} fill={l.accent} opacity="0.7" />)
    : null;
  const lateral = l.pattern === "lateral" ? <path d="M28 49 C 80 44, 130 44, 168 48" stroke={l.accent} strokeWidth="5" fill="none" opacity="0.7" /> : null;
  return (
    <svg viewBox="0 0 200 100" className={className} role="img" aria-label={title ?? `${slug.replace(/-/g, " ")} illustration`}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={l.body} />
          <stop offset="55%" stopColor={l.body} />
          <stop offset="100%" stopColor={l.belly} />
        </linearGradient>
        <clipPath id={`c-${slug}`}><path d={d} /></clipPath>
      </defs>
      <path d={d} fill={`url(#${id})`} stroke="#0b1726" strokeOpacity="0.35" strokeWidth="1.5" />
      <g clipPath={`url(#c-${slug})`}>{stripes}{bars}{spots}{lateral}</g>
      {l.shape === "catfish" && <path d="M18 54 q -10 6 -14 16 M18 50 q -12 2 -16 8" stroke={l.accent} strokeWidth="1.5" fill="none" />}
      <path d="M70 30 q 20 -18 50 -12 l -8 14 Z" fill={l.body} opacity="0.85" />
      <circle cx="34" cy="46" r="4.5" fill="#fff" /><circle cx="33" cy="46" r="2.5" fill="#111" />
    </svg>
  );
}
