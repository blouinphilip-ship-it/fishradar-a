import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { env } from "@/lib/env";
import { getClaude, logAiJob, withinBudget } from "@/lib/ai/claude";
import { getDictionary } from "@/lib/ingest/dictionary";
import { findMentions } from "@/lib/ingest/heuristic";
import { getReports, getRegulation, getRun, getRunTracker, getSpecies, getSpeciesAtSpot, getSpot, getTopLures, listRuns, search, type ReportItem } from "@/lib/data";
import { getSpotForecast } from "@/lib/forecast";
import { RUN_STATUS_LABEL } from "@/lib/scoring";
import { degToCompass } from "@/lib/geo";

export type AssistantEvent =
  | { type: "text"; delta: string }
  | { type: "tool"; name: string; input: unknown }
  | { type: "citations"; reports: { id: number; title: string | null; spotName: string | null; publishedAt: string; isDemo: boolean; url: string | null; sourceName: string }[] }
  | { type: "mode"; mode: "claude" | "offline" }
  | { type: "error"; message: string };

const fmtTime = (iso: string) => new Date(iso).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

// ── Tools (shared by Claude and the offline engine) ────────────────────────

function createTools(cited: Map<number, ReportItem>) {
  return {
  async search_spots({ query }: { query: string }) {
    const r = await search(query);
    return { spots: r.spots.slice(0, 8), species: r.species.slice(0, 5), runs: r.runs.slice(0, 5) };
  },
  async get_conditions({ spot_slug }: { spot_slug: string }) {
    const spot = await getSpot(spot_slug);
    if (!spot) return { error: `Unknown spot ${spot_slug}` };
    const list = await getSpeciesAtSpot(spot);
    const f = await getSpotForecast(spot, list);
    const n = f.conditions.now;
    return {
      spot: spot.name, water: spot.waterType,
      warnings: n.dangerous.map((a) => a.headline),
      now: { waterTempF: n.waterTempF, waterTempSource: n.waterTempSource, windKt: n.windKt, windDir: degToCompass(n.windDirDeg), gustKt: n.gustKt, waveFt: n.waveFt, airTempF: n.airTempF, pressureTrend: n.pressureTrend, tideStage: n.tideStage, flowCfs: n.flowCfs },
      nextTides: f.conditions.tides?.ok ? f.conditions.tides.data.events.filter((e) => new Date(e.time) > new Date()).slice(0, 4).map((e) => `${e.type === "H" ? "High" : "Low"} ${e.ft.toFixed(1)} ft ${fmtTime(e.time)}`) : [],
      moon: f.conditions.astro[0]?.moonPhaseName,
      fishingScoreNow: f.now.score, scoreBreakdown: f.now.factors.map((x) => `${x.note} (+${x.points})`),
      bestWindows: f.windows.slice(0, 3).map((w) => `${fmtTime(w.start)}–${fmtTime(w.end)} (peak ${w.peak})`),
      unavailable: [f.conditions.weather, f.conditions.marine, f.conditions.tides].filter((x) => x && !x.ok).map((x) => x!.source),
    };
  },
  async get_reports({ spot_slug, species_slug, state, days }: { spot_slug?: string | null; species_slug?: string | null; state?: string | null; days?: number | null }) {
    const spot = spot_slug ? await getSpot(spot_slug) : null;
    const sp = species_slug ? await getSpecies(species_slug) : null;
    const reps = await getReports({ nearSpotId: spot?.id, radiusMi: 20, speciesId: sp?.id, stateCodes: state ? [state.toUpperCase()] : undefined, days: days ?? 14, limit: 8 });
    reps.forEach((r) => cited.set(r.id, r));
    return reps.map((r) => ({ report_id: r.id, date: fmtDate(r.publishedAt), spot: r.spotName, kind: r.isDemo ? "DEMO data" : r.isVerified ? "verified report" : "user report", source: r.sourceName, summary: r.summary, lures: r.lures.map((l) => l.name), baits: r.baits.map((b) => b.name) }));
  },
  async get_run_status({ run_slug, species_slug }: { run_slug?: string | null; species_slug?: string | null }) {
    let run = run_slug ? await getRun(run_slug) : null;
    if (!run && species_slug) run = (await listRuns()).find((r) => r.speciesSlug === species_slug) ?? null;
    if (!run) return { error: "No run found", available: (await listRuns()).map((r) => r.slug) };
    const t = await getRunTracker(run);
    return {
      run: run.name, leadingEdge: t.leadingEdge, byState: t.byState.map((b) => ({ state: b.state, reports30d: b.reports, status: b.status, inSeasonWindowNow: b.inWindowNow })),
      ai_prediction: { ...t.prediction, label: "AI prediction — not a guarantee" }, recentReports: t.points.filter((p) => p.ageDays <= 7).length,
    };
  },
  async get_top_lures({ species_slug, spot_slug, water }: { species_slug?: string | null; spot_slug?: string | null; water?: "salt" | "fresh" | null }) {
    const sp = species_slug ? await getSpecies(species_slug) : null;
    const spot = spot_slug ? await getSpot(spot_slug) : null;
    const l = await getTopLures({ speciesId: sp?.id, spotId: spot?.id, water: water ?? undefined, limit: 6 });
    return l.map((x) => ({ lure: `${x.brand} ${x.model}`, type: x.type, mentionsLast14d: x.mentions14, howToFish: x.howToFish, demoData: x.demoOnly }));
  },
  async get_regulations({ state, species_slug, water }: { state: string; species_slug: string; water?: "salt" | "fresh" | null }) {
    const sp = await getSpecies(species_slug);
    if (!sp) return { error: "Unknown species" };
    const r = await getRegulation(state.toUpperCase(), sp.id, water ?? "salt");
    const fresh = r?.lastVerifiedAt && Date.now() - +new Date(r.lastVerifiedAt) < 30 * 86_400_000;
    return fresh ? r : { note: "Limits not verified in the last 30 days — check the official regulations.", officialUrl: r?.officialUrl ?? null };
  },
  async get_fishing_score({ spot_slug, species_slug }: { spot_slug: string; species_slug?: string | null }) {
    const spot = await getSpot(spot_slug);
    if (!spot) return { error: `Unknown spot ${spot_slug}` };
    const list = await getSpeciesAtSpot(spot);
    const f = await getSpotForecast(spot, list, species_slug ?? undefined);
    return { species: f.species?.commonName, status: f.species ? RUN_STATUS_LABEL[f.species.status] : null, scoreNow: f.now.score, safetyNote: f.now.safetyNote, bestWindows: f.windows.slice(0, 4).map((w) => ({ from: fmtTime(w.start), to: fmtTime(w.end), peak: w.peak })) };
  },
};
}
type Tools = ReturnType<typeof createTools>;
type ToolName = keyof Tools;

const s = (props: Record<string, unknown>, required: string[]) => ({ type: "object" as const, properties: props, required, additionalProperties: false });
const str = { type: "string" };
const nstr = { type: ["string", "null"] };
const TOOLS: Anthropic.Beta.BetaTool[] = [
  { name: "search_spots", description: "Find fishing spots, species and runs by name, town, nickname or state.", input_schema: s({ query: str }, ["query"]) },
  { name: "get_conditions", description: "Live conditions at a spot: warnings, water temp, wind, waves, tide, moon, current Fishing Score and best windows next 72h.", input_schema: s({ spot_slug: str }, ["spot_slug"]) },
  { name: "get_reports", description: "Recent fishing reports near a spot and/or for a species or state. Each has a report_id to cite.", input_schema: s({ spot_slug: nstr, species_slug: nstr, state: nstr, days: { type: ["integer", "null"] } }, ["spot_slug", "species_slug", "state", "days"]) },
  { name: "get_run_status", description: "Where a migratory run is right now (verified reports by state) plus a labeled AI prediction of where it goes next.", input_schema: s({ run_slug: nstr, species_slug: nstr }, ["run_slug", "species_slug"]) },
  { name: "get_top_lures", description: "Lures ranked by mentions in recent reports, optionally for a species, spot or water type.", input_schema: s({ species_slug: nstr, spot_slug: nstr, water: { type: ["string", "null"], enum: ["salt", "fresh", null] } }, ["species_slug", "spot_slug", "water"]) },
  { name: "get_regulations", description: "Official regulations link (and limits only if recently verified) for a state and species.", input_schema: s({ state: str, species_slug: str, water: { type: ["string", "null"], enum: ["salt", "fresh", null] } }, ["state", "species_slug", "water"]) },
  { name: "get_fishing_score", description: "Fishing Score now and the best time windows over the next 72 hours for a spot (and species).", input_schema: s({ spot_slug: str, species_slug: nstr }, ["spot_slug", "species_slug"]) },
].map((t) => ({ ...t, strict: true, eager_input_streaming: true }));

const INPUTS: Record<ToolName, z.ZodTypeAny> = {
  search_spots: z.object({ query: z.string() }),
  get_conditions: z.object({ spot_slug: z.string() }),
  get_reports: z.object({ spot_slug: z.string().nullable(), species_slug: z.string().nullable(), state: z.string().nullable(), days: z.number().int().nullable() }),
  get_run_status: z.object({ run_slug: z.string().nullable(), species_slug: z.string().nullable() }),
  get_top_lures: z.object({ species_slug: z.string().nullable(), spot_slug: z.string().nullable(), water: z.enum(["salt", "fresh"]).nullable() }),
  get_regulations: z.object({ state: z.string(), species_slug: z.string(), water: z.enum(["salt", "fresh"]).nullable() }),
  get_fishing_score: z.object({ spot_slug: z.string(), species_slug: z.string().nullable() }),
};

const SYSTEM = `You are FishRadar AI, a fishing intelligence assistant for saltwater and freshwater anglers in the US.
Use the tools to look up spots (by slug), live conditions, recent reports, runs, top lures and regulations before answering. Don't answer from memory when a tool can check.

How to answer:
- If any tool returns warnings (small craft advisories, gales, dangerous seas, thin ice), lead with that safety information.
- Clearly separate three kinds of information and label them: **Verified reports** (cite them like [R123] using report_id), **Seasonal expectation** (typical for the time of year), and **AI prediction** (your inference, with a confidence level). Never present a prediction as fact.
- Reports marked "DEMO data" are sample data: say so if you use them.
- Recommend specific lures/baits and how to fish them, plus the best time windows.
- For keeping fish, point to the official regulations link; don't state limits unless the tool returned verified numbers.
- Be concise and practical: short paragraphs or bullets, under about 250 words unless asked for more.`;

// ── Claude engine: manual streaming tool loop ───────────────────────────────

export async function* runAssistant(history: { role: "user" | "assistant"; content: string }[]): AsyncGenerator<AssistantEvent> {
  const cited = new Map<number, ReportItem>();
  const toolImpl = createTools(cited);
  const claude = getClaude();
  if (!claude || !(await withinBudget())) {
    yield { type: "mode", mode: "offline" };
    yield* offlineAnswer(history.at(-1)?.content ?? "", toolImpl);
    yield citationsEvent(cited);
    return;
  }
  yield { type: "mode", mode: "claude" };
  const model = env.AI_MODEL_ASSISTANT;
  const messages: Anthropic.Beta.BetaMessageParam[] = history.map((m) => ({ role: m.role, content: m.content }));
  let tokensIn = 0;
  let tokensOut = 0;
  try {
    for (let turn = 0; turn < 8; turn++) {
      const stream = claude.beta.messages.stream({
        model, max_tokens: 16000, system: SYSTEM, tools: TOOLS, messages,
        betas: ["server-side-fallback-2026-07-01"], fallbacks: "default", output_config: { effort: "medium" },
      });
      const queue: string[] = [];
      stream.on("text", (d) => queue.push(d));
      let done = false;
      const final = stream.finalMessage().finally(() => { done = true; });
      while (!done || queue.length) {
        if (queue.length) yield { type: "text", delta: queue.shift()! };
        else await new Promise((r) => setTimeout(r, 25));
      }
      const msg = await final;
      tokensIn += msg.usage.input_tokens;
      tokensOut += msg.usage.output_tokens;
      if (msg.stop_reason === "refusal") { yield { type: "text", delta: "\n\nI can't help with that request." }; break; }
      if (msg.stop_reason === "max_tokens") break; // never run tools on a truncated turn
      const uses = msg.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
      if (msg.stop_reason !== "tool_use" || uses.length === 0) break;
      messages.push({ role: "assistant", content: msg.content });
      const results = await Promise.all(uses.map(async (u): Promise<Anthropic.Beta.BetaToolResultBlockParam> => {
        const schema = INPUTS[u.name as ToolName];
        const parsed = schema?.safeParse(u.input);
        if (!schema || !parsed?.success) return { type: "tool_result", tool_use_id: u.id, is_error: true, content: JSON.stringify({ INVALID_INPUT: u.input }) };
        try {
          const out = await (toolImpl[u.name as ToolName] as (i: unknown) => Promise<unknown>)(parsed.data);
          return { type: "tool_result", tool_use_id: u.id, content: JSON.stringify(out) };
        } catch (e) {
          return { type: "tool_result", tool_use_id: u.id, is_error: true, content: e instanceof Error ? e.message : "tool failed" };
        }
      }));
      for (const u of uses) yield { type: "tool", name: u.name, input: u.input };
      messages.push({ role: "user", content: results });
    }
    await logAiJob({ jobType: "assistant", model, tokensIn, tokensOut, status: "succeeded" });
  } catch (e) {
    await logAiJob({ jobType: "assistant", model, tokensIn, tokensOut, status: "failed", error: e instanceof Error ? e.message : String(e) });
    if (e instanceof Anthropic.APIError) {
      yield { type: "text", delta: `\n\n_The AI service is unavailable right now (${e.status ?? "network"}). Here's what I can tell you from FishRadar's data:_\n\n` };
      yield* offlineAnswer(history.at(-1)?.content ?? "", toolImpl);
    } else {
      yield { type: "error", message: "Something went wrong answering that." };
    }
  }
  yield citationsEvent(cited);
}

function citationsEvent(cited: Map<number, ReportItem>): AssistantEvent {
  return { type: "citations", reports: [...cited.values()].slice(0, 12).map((r) => ({ id: r.id, title: r.title, spotName: r.spotName, publishedAt: r.publishedAt, isDemo: r.isDemo, url: r.url, sourceName: r.sourceName })) };
}

// ── Offline (rule-based) engine ────────────────────────────────────────────

async function* offlineAnswer(question: string, toolImpl: Tools): AsyncGenerator<AssistantEvent> {
  const dict = await getDictionary();
  const spotHit = findMentions(question, dict.spots)[0];
  const speciesHit = findMentions(question, dict.species)[0];
  const out: string[] = [];
  const say = (s: string) => out.push(s);

  if (!spotHit && !speciesHit) {
    yield { type: "text", delta: "I couldn't match a spot or species in that question. Try something like **\"Are the albies still at Montauk?\"**, **\"Best lures for redfish in Mosquito Lagoon\"** or **\"Where's the striper run right now?\"**" };
    return;
  }

  if (spotHit) {
    yield { type: "tool", name: "get_conditions", input: { spot_slug: spotHit.slug } };
    const c = await toolImpl.get_conditions({ spot_slug: spotHit.slug });
    if ("error" in c) return;
    if (c.warnings.length) say(`⚠️ **Safety first:** ${c.warnings.join("; ")}. Check the marine forecast before heading out.\n`);
    const spot = (await getSpot(spotHit.slug))!;
    const list = await getSpeciesAtSpot(spot);
    const target = speciesHit ? list.find((x) => x.slug === speciesHit.slug) : list[0];
    say(`### ${c.spot}`);
    const n = c.now;
    const bits = [n.waterTempF != null && `water ${n.waterTempF}°F`, n.windKt != null && `wind ${n.windDir} ${Math.round(n.windKt)} kt`, n.waveFt != null && `seas ${n.waveFt} ft`, n.tideStage && `${n.tideStage} tide`, n.flowCfs != null && `flow ${n.flowCfs} cfs`, c.moon && c.moon.toLowerCase()].filter(Boolean);
    if (bits.length) say(`**Now:** ${bits.join(", ")}. Fishing Score **${c.fishingScoreNow}/100**.`);
    if (c.nextTides.length) say(`**Tides:** ${c.nextTides.slice(0, 3).join(" · ")}`);
    if (c.bestWindows.length) say(`**Best windows (next 72h):** ${c.bestWindows.join(" · ")}`);
    const running = list.filter((x) => x.signal > 0.12).slice(0, 4);
    say(`\n**What's running (verified reports, last 14 days):** ${running.length ? running.map((x) => `${x.commonName} — ${RUN_STATUS_LABEL[x.status]}`).join("; ") : "no recent reports here."}`);
    if (target) {
      if (speciesHit && target.signal <= 0.12) say(`**Seasonal expectation:** ${target.commonName} is ${target.seasonalNow >= 0.4 ? "normally in season here now" : "not usually around here this time of year"}.`);
      const reps = await toolImpl.get_reports({ spot_slug: spotHit.slug, species_slug: target.slug, days: 14 });
      if (reps.length) say(`\n**Recent reports:**\n${reps.slice(0, 3).map((r) => `- ${r.date}${r.kind === "DEMO data" ? " (demo)" : ""}: ${r.summary} [R${r.report_id}]`).join("\n")}`);
      const lures = await toolImpl.get_top_lures({ species_slug: target.slug, spot_slug: spotHit.slug });
      const lureList = lures.length ? lures : await toolImpl.get_top_lures({ species_slug: target.slug });
      if (lureList.length) say(`\n**What to throw for ${target.commonName.toLowerCase()}:**\n${lureList.slice(0, 4).map((l) => `- **${l.lure}** — ${l.howToFish ?? l.type}`).join("\n")}`);
    }
  } else if (speciesHit) {
    const sp = await getSpecies(speciesHit.slug);
    {
      yield { type: "tool", name: "get_run_status", input: { species_slug: speciesHit.slug } };
      const r = await toolImpl.get_run_status({ species_slug: speciesHit.slug });
      if (!("error" in r)) {
        say(`### ${r.run}`);
        if (r.leadingEdge) say(`**Verified reports:** leading edge in **${r.leadingEdge.state}** (latest ${fmtDate(r.leadingEdge.date)}), ${r.recentReports} reports in the last 7 days.`);
        const active = r.byState.filter((b) => b.reports30d > 0 && b.status !== "done");
        if (active.length) say(`**By state:** ${active.map((b) => `${b.state} (${b.reports30d} reports, ${b.status.replace("_", " ")})`).join(", ")}`);
        say(`**AI prediction (${r.ai_prediction.confidence} confidence):** ${r.ai_prediction.text}`);
      } else say(`### ${sp?.commonName}`);
    }
    const reps = await toolImpl.get_reports({ species_slug: speciesHit.slug, days: 7 });
    if (reps.length) say(`\n**Latest reports:**\n${reps.slice(0, 4).map((x) => `- ${x.date} · ${x.spot}${x.kind === "DEMO data" ? " (demo)" : ""}: ${x.summary} [R${x.report_id}]`).join("\n")}`);
    const lures = await toolImpl.get_top_lures({ species_slug: speciesHit.slug });
    if (lures.length) say(`\n**Top lures right now:** ${lures.slice(0, 4).map((l) => l.lure).join(", ")}.`);
  }
  say(`\n_Offline mode: this answer was assembled from FishRadar's data without the AI model. Add an Anthropic API key for full conversational answers._`);
  const text = out.join("\n");
  for (let i = 0; i < text.length; i += 40) yield { type: "text", delta: text.slice(i, i + 40) };
}
