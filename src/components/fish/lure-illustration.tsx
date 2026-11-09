/** Illustrated lure by type — shown until a licensed product photo is attached (spec §10). */
const COLORS = ["#e8e2d0", "#7d5fb0", "#3f7fbf", "#d94f70", "#f2c230", "#3aa36b", "#c9c9c9", "#e86a2c"];

export function LureIllustration({ type, seed = 0, className }: { type: string; seed?: number; className?: string }) {
  const c = COLORS[seed % COLORS.length];
  const c2 = COLORS[(seed + 3) % COLORS.length];
  const hook = (x: number, y: number) => <path d={`M${x} ${y} v8 a4 4 0 0 1 -8 0`} stroke="#555" strokeWidth="1.6" fill="none" />;
  let body: React.ReactNode;
  switch (type) {
    case "topwater":
      body = <><path d="M20 50 C 30 36, 140 34, 172 44 C 176 50, 176 52, 172 56 C 140 66, 30 64, 20 50 Z" fill={c} stroke="#333" /><path d="M20 50 q 6 -8 14 -9 v 18 q -8 -1 -14 -9" fill="#222" opacity=".6" />{hook(80, 60)}{hook(150, 58)}</>;
      break;
    case "swimmer": case "jerkbait": case "crankbait":
      body = <><path d="M34 50 C 50 34, 150 34, 176 48 C 150 64, 50 66, 34 50 Z" fill={c} stroke="#333" /><path d="M34 50 L 10 58 L 14 46 Z" fill="#ddd" stroke="#666" opacity={type === "jerkbait" ? 0.5 : 1} /><circle cx="50" cy="47" r="4" fill="#fff" /><circle cx="50" cy="47" r="2" fill="#111" />{hook(90, 62)}{hook(150, 58)}</>;
      break;
    case "bucktail": case "jig":
      body = <><circle cx="40" cy="50" r="14" fill={c2} stroke="#333" /><path d="M52 44 C 100 30, 160 36, 186 50 C 160 64, 100 70, 52 56 Z" fill={c} opacity=".9" />{[0, 1, 2, 3, 4].map((i) => <path key={i} d={`M56 ${46 + i * 2} C 110 ${40 + i * 4}, 160 ${44 + i * 3}, 184 ${48 + i}`} stroke="#fff" strokeOpacity=".5" fill="none" />)}<circle cx="36" cy="46" r="3" fill="#fff" /></>;
      break;
    case "metal": case "spoon":
      body = <><path d="M30 50 C 60 30, 150 30, 176 50 C 150 70, 60 70, 30 50 Z" fill="url(#chrome)" stroke="#555" /><path d="M40 50 C 80 40, 140 42, 170 50" stroke={c} strokeWidth="5" opacity=".7" />{hook(176, 52)}</>;
      break;
    case "soft_plastic":
      body = <><path d="M24 50 C 40 38, 130 40, 160 48 L 186 34 L 182 50 L 186 66 L 160 54 C 130 62, 40 62, 24 50 Z" fill={c} opacity=".9" stroke="#333" /><circle cx="36" cy="48" r="2.5" fill="#111" /></>;
      break;
    case "spinner": case "spinnerbait":
      body = <><path d="M20 50 H 120" stroke="#666" strokeWidth="2" /><ellipse cx="60" cy="40" rx="18" ry="10" fill="url(#chrome)" stroke="#555" transform="rotate(-20 60 40)" /><path d="M110 50 C 130 40, 170 42, 186 50 C 170 58, 130 60, 110 50 Z" fill={c} />{hook(180, 52)}</>;
      break;
    case "fly":
      body = <><path d="M40 50 C 80 30, 150 36, 184 50 C 150 64, 80 70, 40 50 Z" fill={c} opacity=".75" /><path d="M40 50 C 80 40, 150 44, 184 50" stroke={c2} strokeWidth="4" opacity=".8" /><circle cx="46" cy="48" r="4" fill="#d9c27a" />{hook(46, 54)}</>;
      break;
    case "trolling": case "teaser": case "umbrella_rig":
      body = <><path d="M20 50 C 30 40, 60 38, 76 44 L 76 56 C 60 62, 30 60, 20 50 Z" fill={c2} stroke="#333" />{Array.from({ length: 9 }, (_, i) => <path key={i} d={`M76 ${44 + i * 1.5} C 120 ${34 + i * 4}, 160 ${30 + i * 5}, 190 ${30 + i * 5}`} stroke={c} strokeWidth="2.5" fill="none" />)}</>;
      break;
    default:
      body = <><circle cx="100" cy="46" r="14" fill={c} stroke="#333" /><path d="M100 60 v 20" stroke="#333" /></>;
  }
  return (
    <svg viewBox="0 0 200 100" className={className} role="img" aria-label={`${type.replace("_", " ")} illustration`}>
      <defs>
        <linearGradient id="chrome" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f5f7fa" /><stop offset=".5" stopColor="#9aa4ad" /><stop offset="1" stopColor="#e6e9ec" /></linearGradient>
      </defs>
      {body}
    </svg>
  );
}
