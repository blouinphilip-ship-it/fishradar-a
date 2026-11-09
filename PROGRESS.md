# Progress

## Status: Phases 1–7 built (2026-11-09)

Everything below was run and checked in a local environment (Postgres 16 + PostGIS 3.4 + pgvector, Redis 7, Node 22): lint ✅ · typecheck ✅ · 45 unit/integration tests ✅ · 22 Playwright e2e tests (desktop + phone) ✅ · production build ✅ · signed-in flows exercised end to end (log catch with photo → like/comment → partner report → alert fires → notification; offline assistant).

### Phase 1 — Foundation ✅
Next.js 15 + TS strict + Tailwind 4, shadcn-style UI, Auth.js (Google/Apple/Resend magic link + dev login, gated by keys), Drizzle schema + 4 migrations, dark/light/outdoor themes, Docker Compose (db, redis, migrate+seed, web, worker), GitHub Actions CI.

### Phase 2 — Globe + spots ✅
- MapLibre GL **globe projection** with Natural Earth land outlines (works offline) + Esri ocean-bathymetry / satellite basemaps, clustered markers (blue salt / green fresh, size = score, orange ring = active run, faded = no recent reports), hover tooltips, click-a-spot side panel (bottom sheet on phones), **click anywhere to set your location → nearest spots**, "Use my location", report heatmap layer, "reports from the last N days" slider.
- **107 spots** across New England, NY/NJ, Mid-Atlantic, Southeast, Florida Keys, Gulf, West Coast, Alaska, Hawaii, and 26 freshwater lakes/rivers. **72 species** with nicknames, preferred temps and month-by-month season calendars for 14 regional zones. **21 runs** with state-by-state windows. **58 lures + 23 baits** with aliases, tackle advice per species group, and official regulation links for 33 states.
- Search across spots (incl. local aliases like "the canal", "winni"), species nicknames, lures, runs, states.
- Deviation from spec: **MapLibre globe instead of CesiumJS** — no token needed, lighter, works offline. Cesium can be swapped in later if 3D terrain is wanted.

### Phase 3 — Live conditions ✅
Adapters with parsers tested against real responses: NOAA CO-OPS (hi/lo + hourly tide curve, water temp), NDBC buoys, NWS alerts + hourly forecast (fallback when Open-Meteo is rate-limited), Open-Meteo weather + marine (waves, swell, SST), USGS (flow, gauge, water temp, lake level), suncalc sun/moon + solunar periods. Nearest stations resolved per spot at seed time (79 tide stations, 82 buoys, 26 USGS gauges). Each source cached separately (Redis, memory fallback) and fails independently — the UI shows "unavailable" for that source instead of crashing.

### Phase 4 — Ingestion + AI extraction ✅
Source registry with permission records; pipeline: dedupe (hash) → classify (Claude Haiku or rules) → extract (Claude Sonnet structured output validated with Zod, one retry, else review queue; **rule-based extractor when no key**) → normalize species/lures/bait/spots via alias dictionaries → confidence from source trust → store + mentions → unmatched terms to admin review. Partner Portal, RSS/Atom adapter, Reddit (official OAuth API) and YouTube Data API adapters, BullMQ worker with per-source cron schedules, daily AI budget cap + cost log.

### Phase 5 — Spot, species, lures, runs ✅
Spot Detail (all 10 spec sections incl. Fishing Score + "Why this score?", 72-hour best-times strip, tide chart, safety banner, reports by radius, catches, videos, lures/bait, access & regs, AI briefing cached 3h). Species-at-Spot (status, 60-day timeline, lures/bait/rigs/tackle, where & how, water-temp fit, regulation snapshot that refuses to show unverified numbers, AI tip). Top Lures (ranked by recency-weighted mentions, trend, filters by water/species/region; baits tab). Run Tracker (age-colored report map with animated run path, timeline, this-year-vs-typical table, labeled AI prediction with confidence + reasoning, alert button). Species encyclopedia, Saltwater/Freshwater hubs.

### Phase 6 — Community, assistant, alerts ✅
Catch logging (photo re-encoded → EXIF/GPS stripped; privacy precise/fuzzed/region with deterministic ~2-mile grid; nearest spot; kept-undersize auto-flag), feed with species filters, likes, comments (spam check), report button, angler profiles + follow, life list. AI Assistant: Claude Sonnet with 7 tools in a streaming tool loop, citations, safety-first prompt, server-side refusal fallbacks enabled; **offline engine** answers from the same tools when no key. Alerts: species-reported-nearby / score-above / water-temp thresholds → in-app notifications (+ email via Resend when configured). Admin: source health + enable/permission toggles + add source, review queue, unmatched-term mapping, moderation, AI usage/cost, user roles (partner/moderator/admin).

### Phase 7 — Scale-out (partially done)
Done: national coverage above, accessibility basics (labels, roles, contrast themes, keyboard-usable controls), server-rendered spot/species pages with metadata, phone layouts verified (no horizontal scroll).

## Not done yet / known gaps
- **SST / chlorophyll / wind overlays** on the globe (NOAA CoastWatch ERDDAP tiles) — layer menu says "planned". Forecast time-slider is a "reports in last N days" slider only.
- **Embeddings / semantic report search** — pgvector column + HNSW index exist, nothing populates them yet (needs an embeddings provider).
- **Web push** notifications and the daily/weekly digest email; alerts are in-app (+ email with Resend).
- **AI photo verification** of catches and AI species-ID from photos (schema supports `verification`; currently all user catches are "unverified").
- **Licensed lure product photos** — shown as illustrations until manufacturer media kits / affiliate feeds are connected. Species photos load from iNaturalist (CC, attributed) in the browser.
- **Regulation numbers** — intentionally not seeded; every snapshot says "Check official regulations" with the agency link until staff verify limits.
- **International spots**, PWA manifest/install, analytics, Redis-backed rate limiting for multi-instance deploys, S3/R2 storage for uploads (currently `public/uploads`).
- **Docker images and the CI workflow were not run here** (no Docker daemon in the build sandbox); the same steps were run directly.
- Open-Meteo's free tier is rate-limited per IP; the NWS hourly forecast is used as a fallback for wind/air temp (US only).
