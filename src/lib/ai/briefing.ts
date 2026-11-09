import "server-only";
import { env } from "@/lib/env";
import { cached } from "@/lib/cache";
import { getClaude, logAiJob, withinBudget } from "@/lib/ai/claude";
import type { ReportItem, SpeciesAtSpot, SpotRow, LureRank } from "@/lib/data";
import type { SpotForecast } from "@/lib/forecast";
import { RUN_STATUS_LABEL } from "@/lib/scoring";
import { degToCompass } from "@/lib/geo";

export type Briefing = { text: string; mode: "claude" | "rules"; generatedAt: string; citedReportIds: number[] };

/** AI Spot Briefing (spec §7.10): cached 3 hours; Claude when configured, else a rules-based summary. */
export async function getBriefing(spot: SpotRow, species: SpeciesAtSpot[], forecast: SpotForecast, reports: ReportItem[], lures: LureRank[]): Promise<Briefing> {
  return cached(`briefing:v2:${spot.slug}`, 3 * 3600, async () => {
    const facts = buildFacts(spot, species, forecast, reports, lures);
    const claude = getClaude();
    if (claude && (await withinBudget())) {
      const model = env.AI_MODEL_ASSISTANT;
      try {
        const res = await claude.beta.messages.create({
          model, max_tokens: 2000, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default", output_config: { effort: "low" },
          system: "You write short fishing briefings for FishRadar AI. Use only the facts given. Label claims as Verified report (cite [R<id>]), Seasonal expectation, or AI prediction. Lead with any safety warning. 90–140 words, plain text, no headings.",
          messages: [{ role: "user", content: `Facts (JSON):\n${JSON.stringify(facts)}` }],
        });
        const text = res.stop_reason === "refusal" ? "" : res.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("");
        await logAiJob({ jobType: "briefing", model, tokensIn: res.usage.input_tokens, tokensOut: res.usage.output_tokens, status: "succeeded", refType: "spot", refId: spot.slug });
        if (text) return { text, mode: "claude" as const, generatedAt: new Date().toISOString(), citedReportIds: [...text.matchAll(/\[R(\d+)\]/g)].map((m) => Number(m[1])) };
      } catch (e) {
        await logAiJob({ jobType: "briefing", model, tokensIn: 0, tokensOut: 0, status: "failed", error: e instanceof Error ? e.message : String(e) });
      }
    }
    return rulesBriefing(spot, species, forecast, reports, lures);
  });
}

function buildFacts(spot: SpotRow, species: SpeciesAtSpot[], f: SpotForecast, reports: ReportItem[], lures: LureRank[]) {
  const n = f.conditions.now;
  return {
    spot: spot.name, water: spot.waterType,
    warnings: n.dangerous.map((a) => a.headline),
    now: { waterTempF: n.waterTempF, wind: n.windKt != null ? `${degToCompass(n.windDirDeg)} ${Math.round(n.windKt)} kt` : null, seasFt: n.waveFt, tide: n.tideStage, pressure: n.pressureTrend, flowCfs: n.flowCfs },
    fishingScore: f.now.score, bestWindows: f.windows.slice(0, 3),
    running: species.filter((s) => s.signal > 0.12).map((s) => ({ species: s.commonName, status: RUN_STATUS_LABEL[s.status], reportsThisWeek: s.reportsThisWeek })),
    seasonal: species.filter((s) => s.signal <= 0.12 && s.seasonalNow >= 0.4).map((s) => s.commonName),
    reports: reports.slice(0, 6).map((r) => ({ id: r.id, date: r.publishedAt.slice(0, 10), demo: r.isDemo, summary: r.summary })),
    topLures: lures.slice(0, 4).map((l) => `${l.brand} ${l.model}`),
  };
}

function rulesBriefing(spot: SpotRow, species: SpeciesAtSpot[], f: SpotForecast, reports: ReportItem[], lures: LureRank[]): Briefing {
  const n = f.conditions.now;
  const parts: string[] = [];
  if (n.dangerous.length) parts.push(`⚠️ ${n.dangerous.map((a) => a.event).join(", ")} in effect — check the marine forecast before going out.`);
  const running = species.filter((s) => s.signal > 0.12);
  if (running.length) {
    const top = running[0];
    const rep = reports.find((r) => r.species.some((x) => x.slug === top.slug));
    parts.push(`Verified reports: ${running.slice(0, 3).map((s) => `${s.commonName.toLowerCase()} (${RUN_STATUS_LABEL[s.status].toLowerCase()})`).join(", ")}${rep ? ` — latest ${rep.publishedAt.slice(5, 10).replace("-", "/")}${rep.isDemo ? " (demo)" : ""} [R${rep.id}]` : ""}.`);
  } else parts.push("No verified reports here in the last two weeks.");
  const seasonal = species.filter((s) => s.signal <= 0.12 && s.seasonalNow >= 0.4).map((s) => s.commonName.toLowerCase());
  if (seasonal.length) parts.push(`Seasonal expectation: ${seasonal.slice(0, 3).join(", ")} ${seasonal.length > 1 ? "are" : "is"} typically around this time of year.`);
  const cond = [n.waterTempF != null && `water ${Math.round(n.waterTempF)}°F`, n.windKt != null && `${degToCompass(n.windDirDeg)} wind ${Math.round(n.windKt)} kt`, n.tideStage && `${n.tideStage} tide`, n.pressureTrend && `${n.pressureTrend} pressure`].filter(Boolean);
  if (cond.length) parts.push(`Now: ${cond.join(", ")}.`);
  if (f.windows[0]) parts.push(`AI prediction: the best window in the next 72 hours looks like ${new Date(f.windows[0].start).toLocaleString("en-US", { weekday: "short", hour: "numeric", timeZone: "America/New_York" })} (score ${f.windows[0].peak}).`);
  if (lures.length) parts.push(`Lures mentioned most: ${lures.slice(0, 3).map((l) => `${l.brand} ${l.model}`).join(", ")}.`);
  const text = parts.join(" ");
  return { text, mode: "rules", generatedAt: new Date().toISOString(), citedReportIds: [...text.matchAll(/\[R(\d+)\]/g)].map((m) => Number(m[1])) };
}
