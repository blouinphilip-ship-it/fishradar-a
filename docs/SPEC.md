# FishRadar AI — Master Build Prompt for Claude Code

> Copy everything below the line into Claude Code. It is written so Claude Code can work through it phase by phase. Start a fresh, empty project folder before you paste it.

---

## 0. Your role and how to work

You are the lead engineer building **FishRadar AI**, a full-stack fishing intelligence platform. It combines an interactive 3D globe, live marine and freshwater conditions, fishing reports gathered from permitted sources across the internet, species run tracking, lure and bait recommendations with product photos, fish photos and videos, and user catch reports. An AI engine turns all of that into plain answers to "where and when should I fish, for what, and with what?"

Rules for how you work:

1. **Build in the phases in Section 18, in order.** At the end of each phase: run the app, run the tests, fix what breaks, write a short `PROGRESS.md` entry (what works, what's stubbed, what's next), and commit with a clear message.
2. **Ask me before** you add a paid service, choose between two competing data providers, or do anything that needs an API key I haven't given you. Put every key in `.env.example` with a comment that says where to get it and whether it's free.
3. **Never invent fishing data and present it as real.** Seed and demo data must be labeled `is_demo = true` and shown with a visible "Demo data" badge in the UI. Real reports always show their source, link and date.
4. **Respect content rights.** Only ingest from sources that allow it (official APIs, RSS feeds, sites whose terms and robots.txt permit it, or sources I've added to the allow-list). Never hotlink or rehost photos or videos you don't have rights to. See Section 13.
5. Write TypeScript in strict mode. Keep components small. Add tests for every data parser, every scoring function, and every API route.
6. If something in this spec is unclear or impossible, say so and propose the closest workable alternative instead of guessing silently.

---

## 1. Product summary

**Name:** FishRadar AI
**Tagline:** Know where the fish are — before you leave the dock.

The app answers these questions for any spot on the globe:

- Where are the fish right now?
- What species are running at Montauk, the Florida Keys, Cape Cod, San Diego, or anywhere else?
- What are anglers actually catching there, and when was it reported?
- What lures and bait are working — with real product pictures?
- What are the tides, wind, waves, water temperature, weather, moon phase and solunar periods?
- Where are the fish likely to move next, based on recent reports plus historical seasonal patterns?
- What fishing videos and verified catches have been posted nearby?

**The most important design principle:** always separate three kinds of information, everywhere in the UI, with distinct labels and colors:

| Label | Meaning | Example |
|---|---|---|
| **Verified recent report** | A real report from a named source, dated within the freshness window | "Montauk Point, Nov 7 — schoolie stripers on SP Minnows (Source: XYZ Tackle report)" |
| **Seasonal expectation** | Historical pattern for this date range; not a current observation | "Mid-November is historically peak striper run at Montauk" |
| **AI prediction** | Model inference from conditions + trends; always shows a confidence level and its reasoning | "Run likely to push south toward NJ within 7–10 days (medium confidence)" |

---

## 2. Tech stack

Use this stack unless you have a strong reason to change it (tell me first):

- **Frontend:** Next.js 15 (App Router) + React + TypeScript + Tailwind CSS + shadcn/ui
- **Globe:** CesiumJS via `resium` (3D globe with terrain + bathymetry imagery). Fallback / 2D mode: MapLibre GL JS. Use clustered markers so thousands of spots stay fast.
- **Charts:** Recharts (tide curves, wind, water temp trends)
- **Backend:** Next.js route handlers for the API + a separate worker process for ingestion jobs
- **Database:** PostgreSQL with **PostGIS** (spatial queries) and **pgvector** (semantic search on reports). Use Supabase or a local Docker Postgres for development.
- **ORM:** Drizzle ORM with migrations checked into the repo
- **Jobs / queues:** BullMQ + Redis (scheduled fetches, report ingestion, AI extraction)
- **Caching:** Redis, with per-source TTLs (tides 6h, weather 30 min, buoys 15 min, reports 1h)
- **Auth:** Auth.js (email magic link + Google + Apple)
- **Media storage:** S3-compatible storage (Supabase Storage or Cloudflare R2) + image resizing
- **AI:** Anthropic Claude API. Use `claude-sonnet-5-5` for report extraction and the fishing assistant, `claude-haiku-5-5` for cheap high-volume classification (is this text a fishing report? which species?). Put the model IDs in config, not hard-coded.
- **Testing:** Vitest (unit), Playwright (end-to-end), MSW to mock external APIs
- **Deployment target:** Vercel (web) + Railway/Fly.io (worker + Redis) + Supabase (DB). Provide a `docker-compose.yml` for local dev that runs everything.
- **Mobile:** responsive web first, installable as a PWA. Design so a React Native app can reuse the API later.

---

## 3. App structure and navigation

Top-level layout:

- **Top bar:** logo, global search (spots, species, towns, lakes), mode toggle **Saltwater | Freshwater | Runs**, account menu.
- **Main area:** the globe (always the home screen).
- **Right side panel** (slides in when a spot is selected; full-screen sheet on mobile): the Spot Detail view.
- **Left drawer:** filters (species, distance, water type, shore/boat/kayak, freshness of reports, "only show verified reports").

Main routes:

```
/                         Globe home
/spot/[slug]              Spot detail (also opens as side panel over the globe)
/spot/[slug]/species/[sp] Species-at-spot detail (lures, bait, reports, media)
/saltwater                Saltwater hub (regions + run subsections)
/saltwater/runs/[run]     A specific run (e.g. striper-run-east-coast)
/freshwater               Freshwater hub (lakes, rivers, reservoirs, ponds)
/runs                     Run Tracker (all species runs, timeline + map)
/lures                    Top Lures Working Now
/lures/[slug]             Lure detail
/species/[slug]           Species encyclopedia page
/catches                  Community catch feed
/catches/new              Log a catch
/assistant                AI fishing assistant chat
/me                       Profile, saved spots, alerts, my catches
/admin                    Moderation, sources, ingestion health
```

---

## 4. The globe (home screen)

Behavior:

1. On first load, ask for location permission. If granted, fly the camera to the user and show spots within 50 miles. If denied, show a "Click anywhere on the globe or search for where you are" prompt, and start zoomed on North America.
2. The user can **click anywhere on the globe to set "my location."** Drop a pin, then list the nearest spots in the side panel sorted by distance and by today's Fishing Score.
3. **Spot markers:**
   - Blue = saltwater, green = freshwater.
   - Marker glow/size = today's Fishing Score (Section 9).
   - A small flame badge = a species run is currently active there (verified reports in the last 7 days).
   - Clusters show a count when zoomed out.
4. **Map layers** (toggles in a layer menu):
   - Sea surface temperature heatmap (NOAA CoastWatch / ERDDAP)
   - Wind arrows (current + forecast slider)
   - Wave height
   - Chlorophyll / water color (useful for tuna and bait)
   - Bathymetry / depth contours
   - Active runs overlay (animated arrows showing recent movement of a run along the coast)
   - Report heatmap (density of verified reports in the last 7 / 14 / 30 days)
   - NOAA tide stations and NDBC buoys as small icons; click for readings
5. **Time slider** at the bottom: scrub from 30 days ago to 7 days ahead. Past = reports + recorded conditions; future = forecast conditions + AI predictions (clearly styled as forecast).
6. Hovering a marker shows a tooltip: spot name, water type, top 3 species running, Fishing Score, last report date.
7. Performance target: 60 fps with 5,000 markers on a mid-range laptop; first meaningful paint under 3 s.

---

## 5. Saltwater section

### 5.1 Coverage

Cover the **entire U.S. East Coast, Gulf Coast and West Coast**, plus Hawaii and Alaska, then expand worldwide later. Organize by region:

- **New England:** Maine, NH Seacoast (Hampton, Rye, Portsmouth, Isles of Shoals), Massachusetts (Cape Ann, Boston Harbor, Cape Cod Canal, Cape Cod, Martha's Vineyard, Nantucket), Rhode Island (Block Island, Watch Hill, Narragansett), Connecticut
- **New York / New Jersey:** Montauk, Long Island South Shore and North Shore, Jamaica Bay, Raritan Bay, Sandy Hook, Barnegat, Cape May
- **Mid-Atlantic:** Delaware Bay, Ocean City MD, Chesapeake Bay, Virginia Beach, Outer Banks / Cape Hatteras
- **Southeast:** Charleston, Hilton Head, Georgia coast, Jacksonville, Cape Canaveral / Mosquito Lagoon, Sebastian Inlet, Palm Beach, Miami / Biscayne Bay
- **Florida Keys:** Key Largo, Islamorada, Marathon, Big Pine, Key West, Dry Tortugas, Florida Bay / Everglades backcountry
- **Gulf Coast:** Naples, Boca Grande, Tampa Bay, Crystal River, Panhandle (Destin, Pensacola), Alabama, Mississippi, Louisiana (Venice, Grand Isle), Texas (Galveston, Port Aransas, South Padre)
- **West Coast:** San Diego (incl. long-range fleet), Orange County, LA / Santa Monica Bay, Channel Islands, Morro Bay, Monterey Bay, San Francisco Bay, Northern California, Oregon coast, Columbia River mouth, Washington coast, Puget Sound
- **Alaska and Hawaii:** Kenai, Homer, Sitka, Ketchikan; Kona, Oahu
- **Later (phase 7+):** Caribbean, Bahamas, Costa Rica, Mexico (Cabo, Baja), Canada, UK/Ireland, Australia, New Zealand, Japan

### 5.2 Run subsections

The Saltwater hub has a **"Sport Fish Runs"** section with a card for each run. Each run page shows: a season calendar, a map of where it is now (verified reports) vs. where it usually is this week (seasonal), recent reports, top lures, conditions that drive it, and an AI "where it's heading next" prediction.

Include at least these runs:

**East Coast / Northeast**
- Striped bass spring run (Chesapeake → NJ → NY → New England)
- Striped bass fall run (New England → Montauk → NJ → Outer Banks)
- False albacore / little tunny fall run (Cape Cod, Martha's Vineyard, RI, Montauk, NJ, NC Crystal Coast)
- Bluefin tuna (Cape Cod Bay, Stellwagen Bank, Gulf of Maine, NJ/NY canyons, Outer Banks winter bite)
- Yellowfin and bigeye tuna (canyons: Hudson, Block, Baltimore, Norfolk; Outer Banks)
- Bluefish blitzes
- Bonito (Atlantic)
- Summer flounder / fluke
- Black sea bass and tautog (blackfish) fall run
- Weakfish
- Mahi-mahi (offshore summer)
- Shark season (mako, thresher, blue)
- Atlantic cod and haddock (Gulf of Maine, Stellwagen)

**Southeast / Florida / Gulf**
- Redfish (red drum) — fall bull red run, Mosquito Lagoon, Louisiana marsh, Outer Banks
- Tarpon migration (Florida Keys, Boca Grande Pass, Homosassa, Gulf Coast)
- Snook
- Bonefish and permit (Keys flats)
- Sailfish winter run (Palm Beach, Stuart, Keys)
- Mahi-mahi, wahoo, kingfish (king mackerel), Spanish mackerel
- Cobia spring run (Gulf and Atlantic)
- Grouper and snapper (seasons + closures)
- Speckled trout
- Swordfish (daytime deep drop)
- Blue and white marlin

**West Coast**
- Bluefin tuna (SoCal)
- Yellowtail
- Yellowfin tuna and dorado (SoCal + Baja)
- Albacore (SoCal, Oregon, Washington)
- White seabass
- Calico (kelp) bass and barracuda
- Halibut (California and Pacific)
- Salmon runs (king/Chinook, coho — CA, OR, WA, AK)
- Steelhead (coastal rivers — cross-listed with Freshwater)
- Striped bass (SF Bay delta)
- Rockfish and lingcod

**Hawaii / Alaska:** ono (wahoo), ahi, marlin; Alaska halibut and all five salmon species.

Store each run as data (not hard-coded pages) so new runs can be added in the admin panel.

---

## 6. Freshwater section

Same structure as saltwater, organized by **state/province → water body type** (lakes, reservoirs, rivers, streams, ponds).

Freshwater species to support at launch: largemouth bass, smallmouth bass, spotted bass, walleye, northern pike, muskie, crappie, bluegill/sunfish, yellow perch, channel and flathead catfish, lake trout, brook trout, brown trout, rainbow trout, landlocked salmon, steelhead, Great Lakes salmon (king, coho), striped bass (reservoir), white bass, carp.

Freshwater "runs and seasonal events" (same Run Tracker format):
- Spring walleye spawning run
- Spring and fall steelhead runs (Great Lakes tributaries, Pacific Northwest)
- Great Lakes king salmon fall run
- Bass pre-spawn / spawn / post-spawn by latitude
- Crappie spawn
- Shad runs (cross-listed with saltwater rivers)
- Ice-out events (New England lakes — e.g. Lake Winnipesaukee ice-out date tracking)
- Ice fishing season (with ice-thickness reports clearly labeled user-reported, plus a safety warning)
- Trout stocking schedules (pull from state stocking reports where available)

Freshwater conditions differ from saltwater — use:
- **USGS Water Services:** streamflow (cfs), gauge height, water temperature
- **Lake levels:** USACE, state agencies, or USGS where available
- Weather, wind, barometric pressure trend, moon/solunar
- Ice-out / ice-in dates where tracked

Seed example: **Lake Winnipesaukee, NH** — smallmouth bass, lake trout, landlocked salmon, yellow perch, rainbow trout, with launch ramps and access points.

---

## 7. Spot Detail page (what you see when you click a spot)

Sections, top to bottom:

1. **Header:** spot name, region, water type badge, distance from the user, Fishing Score (0–100) with a one-line plain-English summary ("Good — falling tide at dawn, SW 10 kt, water 54°F, stripers reported 2 days ago"), save button, "Set alert" button, share button.
2. **What's running now:** horizontal cards for each species with verified reports in the last 14 days. Each card: fish photo, name, status badge (**Hot / Active / Starting / Tapering / Out of season**), last report date, number of reports this week. Cards are clickable (Section 8).
3. **All species you can catch here:** full grid, grouped by "In season now", "Coming soon", "Out of season", each with a mini season bar showing peak months.
4. **Conditions now and forecast:**
   - Saltwater: tide chart (highs/lows, current height, next change), tidal current if available, wind speed/direction/gusts, wave height and period, swell, water temperature (nearest buoy + satellite SST), air temp, cloud cover, precipitation, barometric pressure and its 6-hour trend, visibility, sunrise/sunset, moon phase and illumination, solunar major/minor periods, marine forecast text and any NWS small craft advisories or warnings (warnings shown prominently in red).
   - Freshwater: streamflow, gauge height, water temperature, lake level, weather, wind, pressure trend, moon/solunar.
   - A **"Best times to fish"** strip for the next 72 hours, combining tide + light + solunar + wind into ranked windows.
5. **Latest fishing reports:** a feed of reports for this spot and nearby (filter by radius), each showing source name and logo, date, summary, species mentioned, lures/bait mentioned, conditions on that date, link to the original. Badge: Verified / User-submitted / Seasonal.
6. **Recent catches:** community-submitted catch photos with species, size, lure used, date (location fuzzed — Section 12).
7. **Videos:** recent fishing videos from this area (YouTube Data API search by location + species keywords, embedded with the official player; show channel and date).
8. **Top lures and bait working here:** ranked list with product photos (Section 10).
9. **Access and info:** boat ramps, shore access, piers, parking, tackle shops, charter captains (directory listings), and a direct link to the state's fishing regulations, license page and any current closures. Show a disclaimer: "Always check current regulations before keeping fish."
10. **AI Spot Briefing:** a generated paragraph (cached, refreshed every 3 hours) that summarizes everything above, with citations to the reports it used, and the three-label system from Section 1.

---

## 8. Species-at-Spot detail (click a fish)

When the user clicks a species on a spot:

- **Hero:** large photo of the fish (licensed — Section 13), common and scientific name, local nicknames ("schoolie," "cow," "bull red," "albie," "fatty").
- **Is it running here?** Status badge + timeline chart of report counts over the last 60 days, plus this-year vs. historical-average overlay.
- **Pictures and videos of the fish running:** gallery from user catches + licensed images + embedded YouTube videos of recent blitzes/catches in this area.
- **Best lures for this fish here:** ranked list with product photos, color, size, weight, how to fish it (retrieve style), and why it's working (e.g., "matching the peanut bunker in the surf"). Each lure links to its lure page.
- **Best bait:** live and natural baits (e.g., eels, bunker/menhaden, clams, sand eels, squid, shrimp, pinfish, crabs, nightcrawlers, minnows) with how to rig them and photos of the rig.
- **Rigs and tackle:** recommended rod, reel, line, leader, hook size and type (circle hooks where required by law — e.g., striped bass with bait), terminal tackle.
- **Where and how:** structure to target, depth, best tide stage, best time of day, water temperature range the species prefers, and current water temp vs. that range.
- **Regulations snapshot:** size limit, bag limit, season — pulled from a maintained regulations table with "last verified" date and a link to the official source. If not verified within 30 days, show "Check official regulations" instead of numbers.
- **Recent reports mentioning this species here** (filtered feed).
- **Community catches** of this species here.
- **AI tip:** "Based on 6 reports in the last 5 days, white bucktails with a pork rind trailer and 5–7 in. soft plastics on a falling tide at night are producing."

---

## 9. Fishing Score and "best time" engine

Build a transparent, testable scoring module (`/lib/scoring`). Score 0–100 per spot per species per hour.

Inputs and default weights (store weights in config so they can be tuned):

| Factor | Notes |
|---|---|
| Recent verified reports (recency-weighted) | Biggest single factor |
| Seasonal likelihood | From the species × region season calendar |
| Water temperature vs. species preferred range | Gaussian fit around optimum |
| Tide stage and movement | Moving water > slack for most saltwater species; species-specific overrides |
| Light | Dawn/dusk bonus; night bonus for stripers, etc. |
| Wind | Too strong = penalty; species/spot-specific favorable directions |
| Barometric pressure trend | Falling-before-front bonus, post-front penalty |
| Moon phase / solunar | Small weight |
| Waves / safety | Hard cap: if small craft advisory or waves above a spot's safe threshold, show a safety warning and cap the boat score |
| Streamflow (freshwater) | Species-specific ideal ranges |

Requirements:
- Every score shows a **"Why this score?"** breakdown listing each factor's contribution.
- Unit tests for each factor function and for the combined score.
- Backtest script: compare historical scores against historical reports and print a correlation summary, so we can tune weights.

---

## 10. Top Lures Working Now

A dedicated `/lures` page plus a lure section on every spot and species page.

- **Ranking:** count of lure mentions in verified reports + user catches over the last 14 days, weighted by recency, filterable by region, species, saltwater/freshwater, shore/boat.
- **Lure card:** product photo, brand, model, size, weight, color, lure type (topwater, swimmer, bucktail, jig, metal, soft plastic, spoon, spinner, crankbait, jerkbait, fly, etc.), species it's working on, regions where it's hot, number of mentions this week, trend arrow, "how to fish it" tip, and price + "Where to buy" links.
- **Product photos:** use only images we're allowed to show — manufacturer press/media kits with permission, affiliate program product feeds (e.g., Amazon Associates PA-API, AvantLink, retailer affiliate feeds), or our own photos. Store image URL, source, and license for each. If no licensed image exists, show a clean illustrated placeholder by lure type.
- **Lure normalization:** AI extraction will find messy mentions ("white bucktail," "SP minnow," "Daiwa SP," "pink Hogy"). Build a lure catalog table plus an alias table and a matching step (fuzzy match + Claude fallback) so mentions map to catalog entries. Unmatched mentions go to an admin review queue.
- **Bait** gets the same treatment (bait catalog + aliases), shown in a "Top baits" tab.
- Affiliate links must be disclosed ("We may earn a commission").

---

## 11. Run Tracker (the headline feature)

`/runs` — pick a species (e.g., False Albacore, Striped Bass, Bluefin Tuna, Tarpon, Redfish).

Show:
- **Map:** verified reports as dots colored by age (bright = today, faded = 14 days), with an animated path showing the run's leading edge moving along the coast over time.
- **Timeline:** a scrollable list of reports by location and date — "Nov 3 Cape Cod → Nov 5 RI → Nov 7 Montauk → Nov 9 NJ" — each with conditions and lures mentioned.
- **Seasonal comparison:** this year vs. the typical timing (e.g., "The run is ~5 days later than the 5-year average").
- **Where next:** AI prediction for the next 7–14 days with a confidence level, the reasoning (water temps dropping, bait movement, historical progression), and a clear "AI prediction" label.
- **Alerts:** "Notify me when false albies are reported within 30 miles of me" (email + web push).

---

## 12. Community catches and user accounts

- Users can log a catch: photo(s), species (with AI-suggested species ID from the photo, user confirms), length/weight, lure or bait (pick from catalog or free text), date/time (from EXIF if available), location, conditions auto-attached from our data at that time and place, notes, kept or released.
- **Location privacy:** users choose precise / fuzzed (default — rounded to about 2 miles) / region only. Never expose exact coordinates of other users' catches. Strip EXIF GPS from public images.
- **Verification levels:** unverified, photo-verified (AI checks the photo contains a fish matching the species, and the image isn't a reverse-searched duplicate), community-confirmed, trusted angler (reputation-based).
- Likes, comments, follow anglers, report abuse.
- Profile: catch log, personal stats, species life list, saved spots, alert settings.
- Moderation queue in admin; automated filtering for spam, offensive content, and illegal catches (e.g., under-size fish shown as kept → flag, don't publicly shame).

---

## 13. Report ingestion pipeline (gathering info from across the internet — legally)

This is the core data engine. Build it as a pluggable **source adapter** system in `/worker/sources/`.

### 13.1 Source types

1. **Official/government data APIs** (always allowed): NOAA CO-OPS (tides, currents, water temp, water level), NOAA NDBC (buoys: wind, waves, water temp), NWS API api.weather.gov (forecasts, marine zones, warnings), NOAA CoastWatch/ERDDAP (SST, chlorophyll), USGS Water Services (streamflow, water temp), Open-Meteo Marine (waves, global coverage), state fish & wildlife agencies (stocking reports, regulations, creel/run counts, fish ladder counts like Columbia River dam counts).
2. **RSS / Atom feeds** from fishing report publishers, tackle shops, and charter captains that publish them.
3. **Partner sources:** tackle shops, charters, guides, clubs and publications who agree to share reports (give them a simple submission form + email-in address + API key). This is the long-term best source — build a "Partner portal" where a tackle shop can post its weekly report in 2 minutes.
4. **Social platforms via official APIs only:** YouTube Data API (videos), Reddit API (subreddits like fishing, surfcasting, saltwaterfishing — respect Reddit's API terms and rate limits; store only what's allowed, link back). Do not scrape Facebook or Instagram.
5. **Web pages** only when robots.txt and the site's terms allow it, from a domain allow-list I control in the admin panel. Store a short extracted summary and structured facts + a link back, **not** the full copied article.

### 13.2 Pipeline steps

```
fetch → dedupe → classify (is it a fishing report?) → extract structured data (AI)
     → geocode locations → normalize species/lures/bait → score confidence
     → attach conditions at that time/place → store → embed (pgvector) → publish
```

For every source record store: `source_id`, `url`, `fetched_at`, `published_at`, `license/permission type`, `robots_checked_at`, raw text hash (for dedupe), and extraction model + version.

### 13.3 AI extraction (Claude)

Send report text to Claude with a strict JSON schema (use tool use / structured output) and get back:

```json
{
  "is_fishing_report": true,
  "report_date": "2026-11-07",
  "locations": [{"name": "Montauk Point", "lat": null, "lon": null, "confidence": 0.9}],
  "species": [{"name": "striped bass", "size_notes": "schoolies to 30 in", "abundance": "good"}],
  "lures": [{"raw": "white bucktail with pork rind", "type": "bucktail", "color": "white"}],
  "bait": [{"raw": "live eels"}],
  "techniques": ["drifting the rips", "casting from the rocks at night"],
  "conditions_mentioned": {"water_temp_f": 56, "wind": "NW 15", "tide": "outgoing"},
  "summary": "One to two sentence neutral summary in our own words.",
  "extraction_confidence": 0.85
}
```

Rules: never fabricate fields — return null when not stated. Summaries must be in our own words (not copied). Validate output with Zod; if invalid, retry once, then send to the admin review queue. Log token usage per job and enforce a daily AI budget cap from config.

### 13.4 Freshness and trust

- Reports older than 14 days drop out of "running now"; older than 60 days are only used for historical patterns.
- Source trust score (admin-set + learned from agreement with other sources) feeds confidence.
- Show "Last updated" times everywhere. If a spot has no report in 14 days, say so honestly: "No recent reports — showing seasonal expectations."

### 13.5 Ingestion health dashboard (admin)

Per source: last success, last error, records fetched, records published, extraction failure rate, AI cost today. Toggle a source on/off. Add a new source from the UI (type, URL, schedule, allowed yes/no, notes on permission).

---

## 14. Fish photos and videos

- **Species photos:** use openly licensed images — iNaturalist (CC-licensed research-grade observations; respect each image's license), Wikimedia Commons, NOAA Fisheries and U.S. Fish & Wildlife Service images (public domain). Store attribution and license per image and show the credit on hover.
- **Species facts:** FishBase-style data (range, max size, preferred temperature, diet) — check terms; NOAA Fisheries species pages.
- **Videos:** YouTube Data API v3 search by species + location keywords + recency; embed with the official player only. Cache results 6h. Let admins pin or block videos.
- **User media:** uploaded catches (users grant us a display license in the terms of service).

---

## 15. AI Fishing Assistant

`/assistant` and a floating chat button on every page.

- Uses Claude with tool use. Tools the model can call: `search_spots`, `get_conditions(spot, time_range)`, `get_reports(spot|region, species, days)`, `get_run_status(species)`, `get_top_lures(region, species)`, `get_regulations(state, species)`, `get_fishing_score(spot, species, time_range)`.
- Example questions it must handle well:
  - "I'm in Rye, NH with a kayak Saturday morning. What should I target and with what?"
  - "Are the albies still at Montauk?"
  - "Best tide and lure for bull reds in Mosquito Lagoon this week?"
  - "Where's the striper run right now and where will it be in 10 days?"
  - "Smallmouth on Winnipesaukee in late October — what's working?"
- Every answer cites the reports and data it used (with links) and uses the three-label system (verified / seasonal / AI prediction).
- Safety: if conditions are dangerous (warnings, high wind/waves, thin ice), the assistant must lead with that.
- Stream responses. Keep a conversation history per user. Rate-limit per user.

---

## 16. Alerts and notifications

- Users create alerts: species + area radius + conditions (e.g., "False albacore reported within 25 mi" or "Fishing Score > 80 at my saved spots" or "Water temp at Cape Cod Bay drops below 58°F").
- Delivery: web push, email; mobile push later.
- Daily or weekly digest email for saved spots.

---

## 17. Data model (starting point — refine as needed)

Core tables (PostGIS geometry where noted):

- `regions` (id, name, parent_id, geometry)
- `spots` (id, slug, name, region_id, water_type [salt|fresh|brackish], spot_type [inlet, beach, jetty, flat, offshore, canyon, lake, river, reservoir, pond, pier], point geometry, access info, nearest_tide_station_id, nearest_buoy_id, usgs_site_id, is_demo)
- `species` (id, slug, common_name, scientific_name, nicknames[], water_types[], temp_min_f, temp_opt_f, temp_max_f, description, image_id)
- `species_seasons` (species_id, region_id, month-by-month likelihood 0–1, peak notes)
- `runs` (id, slug, species_id, name, direction, typical route as geometry, season start/end by region)
- `sources` (id, name, type, url, allowed, permission_notes, trust_score, schedule, enabled)
- `reports` (id, source_id, url, published_at, summary, raw_hash, extraction_json, confidence, is_verified, embedding vector)
- `report_mentions` (report_id, spot_id, species_id, lure_id, bait_id, abundance, size_notes)
- `lures` (id, brand, model, type, sizes, colors, image_id, affiliate_links)
- `lure_aliases` (alias, lure_id)
- `baits`, `bait_aliases`
- `conditions_snapshots` (spot_id, observed_at, tide_ft, tide_stage, wind_kt, wind_dir, gust_kt, wave_ft, wave_period_s, water_temp_f, air_temp_f, pressure_mb, pressure_trend, flow_cfs, moon_phase, source)
- `fishing_scores` (spot_id, species_id, hour, score, breakdown_json)
- `catches` (id, user_id, species_id, lure_id, bait_id, length_in, weight_lb, caught_at, precise point, fuzzed point, privacy, verification_level, conditions_snapshot_id, notes, released)
- `media` (id, url, type, source, license, attribution, owner_user_id)
- `videos` (id, youtube_id, title, channel, published_at, spot_id, species_id, pinned, blocked)
- `regulations` (state, species_id, size_limit, bag_limit, season, special_rules, official_url, last_verified_at)
- `users`, `saved_spots`, `alerts`, `follows`, `comments`, `likes`, `moderation_flags`
- `ai_jobs` (job type, model, tokens_in, tokens_out, cost, status)

Add spatial indexes, and indexes on `(spot_id, published_at)` and `(species_id, published_at)`.

---

## 18. Build phases

**Phase 1 — Foundation**
Repo, Docker compose (Postgres+PostGIS+pgvector, Redis), Next.js app, Tailwind/shadcn, Drizzle schema and migrations, auth, basic layout with Saltwater / Freshwater / Runs toggle, CI running lint + tests.

**Phase 2 — Globe + spots**
Cesium globe, click-to-set-location, clustered markers, search, spot side panel shell. Seed the **four launch regions** in depth: **Montauk, Cape Cod (incl. Canal and Cape Cod Bay), New Hampshire Seacoast, Florida Keys** — plus one freshwater lake (**Lake Winnipesaukee**) and one West Coast spot (**San Diego**). Seed species and season calendars for those regions. All seeds marked `is_demo` until real data replaces them.

**Phase 3 — Live conditions**
Adapters for NOAA CO-OPS, NDBC, NWS (incl. marine warnings), Open-Meteo Marine, CoastWatch SST, USGS. Moon/solunar calculation (use `suncalc` or equivalent). Conditions panel with tide chart and 72-hour forecast. Caching. Tests with mocked API responses.

**Phase 4 — Report ingestion + AI extraction**
Source adapter framework, RSS adapter, Partner submission form, Reddit and YouTube adapters, Claude extraction with schema validation, geocoding, species/lure/bait normalization, admin review queue, ingestion health dashboard.

**Phase 5 — Spot + species detail, lures, runs**
Full Spot Detail page, Species-at-Spot page, Top Lures page with product images, Run Tracker with map timeline and AI "where next," Fishing Score engine with "Why this score?"

**Phase 6 — Community + assistant + alerts**
Catch logging with privacy fuzzing and photo verification, feed, profiles, AI assistant with tools, alerts and email/web push.

**Phase 7 — Scale out coverage**
Add all East, Gulf and West Coast regions and runs from Section 5, more freshwater states, then international. Performance pass, accessibility pass (WCAG AA), SEO (server-rendered spot and species pages), PWA install, analytics.

---

## 19. Quality bar and acceptance checks

Before you call any phase done, verify:

- [ ] Clicking a spot on the globe opens its detail panel in under 1 s (cached).
- [ ] Every report, image and video shown has a visible source and date.
- [ ] Verified, seasonal and AI-predicted info are visually distinct everywhere.
- [ ] Clicking a species on a spot shows lures (with images or placeholders), bait, rigs, conditions fit, regs snapshot and recent reports.
- [ ] Marine warnings and dangerous conditions appear at the top, in red.
- [ ] Other users' exact catch coordinates are never sent to the browser.
- [ ] No API keys are exposed to the client; all third-party calls go through our backend.
- [ ] Works on a phone (375 px wide) with the globe and a bottom-sheet panel.
- [ ] Dark mode (anglers use this at 4 a.m.) and a high-contrast outdoor mode.
- [ ] Unit + e2e tests pass in CI.
- [ ] The app degrades gracefully when any single data source is down (show "unavailable" for that panel, not a crash).

## 20. Security, legal and safety

- Rate limiting on all public APIs; input validation with Zod; parameterized queries only; CSRF protection; secure cookies.
- Terms of Service and Privacy Policy pages (placeholders I'll have reviewed); user content license clause; DMCA takedown contact and admin takedown tool.
- Respect robots.txt and every source's terms; keep a per-source permission record.
- Regulation and safety disclaimers on every regs snapshot and forecast.
- Never present AI predictions as guarantees.

---

**Start now with Phase 1.** First, show me the folder structure and the Drizzle schema you plan to use, and list the API keys we'll need (marking which are free). Then build.
