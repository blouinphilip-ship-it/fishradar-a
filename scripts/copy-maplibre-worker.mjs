// MapLibre 6 ships its web worker as a separate ES module that Next's bundler can't resolve.
// Copy it into /public so the browser can load it from a stable URL (see components/home/globe.tsx).
import fs from "node:fs";
fs.mkdirSync("public/maplibre", { recursive: true });
fs.copyFileSync("node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs", "public/maplibre/maplibre-gl-worker.mjs");
console.log("copied maplibre worker");
