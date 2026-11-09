import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { env } from "@/lib/env";
import { getClaude, logAiJob, withinBudget } from "@/lib/ai/claude";
import { getDictionary } from "./dictionary";
import { heuristicExtract } from "./heuristic";
import { ClassifySchema, ExtractionSchema, type Extraction } from "./schema";

const SYSTEM = `You extract structured data from recreational fishing reports for FishRadar AI.
Rules:
- Only record what the text states. Use null or an empty array when something is not stated. Never guess locations, species, sizes or dates.
- "summary" must be one or two neutral sentences in your own words; do not copy phrases from the report.
- Use common species names (e.g. "striped bass", not "linesider"), but keep lure/bait names as written in "raw".
- If the text is not a fishing report (ads, questions, gear for sale, unrelated), set is_fishing_report to false.`;

export type ExtractOutcome = { extraction: Extraction; model: string; method: "claude" | "heuristic" };

/** Cheap first-pass classifier (Haiku) for high-volume sources like Reddit and RSS. */
export async function classify(text: string): Promise<{ isReport: boolean; method: string }> {
  const claude = getClaude();
  if (!claude || !(await withinBudget())) {
    const dict = await getDictionary();
    return { isReport: heuristicExtract(text, dict, null).is_fishing_report, method: "heuristic" };
  }
  const model = env.AI_MODEL_CLASSIFIER;
  try {
    const res = await claude.beta.messages.parse({
      model, max_tokens: 256, output_config: { effort: "low", format: betaZodOutputFormat(ClassifySchema) },
      messages: [{ role: "user", content: `Is this a recreational fishing report (someone describing fishing results/conditions)? List species named.\n\n<text>\n${text.slice(0, 6000)}\n</text>` }],
    });
    await logAiJob({ jobType: "classify", model, tokensIn: res.usage.input_tokens, tokensOut: res.usage.output_tokens, status: "succeeded" });
    return { isReport: res.stop_reason !== "refusal" && Boolean(res.parsed_output?.is_fishing_report), method: model };
  } catch (e) {
    await logAiJob({ jobType: "classify", model, tokensIn: 0, tokensOut: 0, status: "failed", error: errMsg(e) });
    const dict = await getDictionary();
    return { isReport: heuristicExtract(text, dict, null).is_fishing_report, method: "heuristic" };
  }
}

/**
 * Extract structured data. Uses Claude with schema-validated structured output when configured
 * (one retry on invalid output); otherwise the rule-based extractor.
 * Server-side fallbacks are enabled so a refusal on the primary model retries on a fallback model.
 */
export async function extractReport(text: string, reportDate: string | null, refId?: string): Promise<ExtractOutcome> {
  const claude = getClaude();
  if (claude && (await withinBudget())) {
    const model = env.AI_MODEL_EXTRACTION;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await claude.beta.messages.parse({
          model, max_tokens: 4000, system: SYSTEM,
          betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
          output_config: { effort: "low", format: betaZodOutputFormat(ExtractionSchema) },
          messages: [{ role: "user", content: `Report date (from source metadata, may be null): ${reportDate ?? "null"}\n\n<report>\n${text.slice(0, 20_000)}\n</report>` }],
        });
        if (res.stop_reason === "refusal" || !res.parsed_output) throw new Error(`no parsed output (stop_reason=${res.stop_reason})`);
        const parsed = ExtractionSchema.safeParse(res.parsed_output);
        if (!parsed.success) throw new Error("schema validation failed");
        await logAiJob({ jobType: "extract", model, tokensIn: res.usage.input_tokens, tokensOut: res.usage.output_tokens, status: "succeeded", refType: "report", refId });
        return { extraction: parsed.data, model, method: "claude" };
      } catch (e) {
        const retryable = !(e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError);
        await logAiJob({ jobType: "extract", model, tokensIn: 0, tokensOut: 0, status: attempt === 1 || !retryable ? "needs_review" : "failed", error: errMsg(e), refType: "report", refId });
        if (!retryable) break;
      }
    }
  }
  const dict = await getDictionary();
  return { extraction: heuristicExtract(text, dict, reportDate), model: "heuristic-v1", method: "heuristic" };
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 500);
