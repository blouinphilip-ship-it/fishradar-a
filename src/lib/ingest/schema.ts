import { z } from "zod";

/** Structured extraction schema (spec §13.3). Null when the report doesn't say — never invented. */
export const ExtractionSchema = z.object({
  is_fishing_report: z.boolean(),
  report_date: z.string().nullable().describe("YYYY-MM-DD if stated or clearly implied, else null"),
  locations: z.array(z.object({ name: z.string(), confidence: z.number() })),
  species: z.array(z.object({ name: z.string(), abundance: z.enum(["excellent", "good", "fair", "slow"]).nullable(), size_notes: z.string().nullable() })),
  lures: z.array(z.object({ raw: z.string(), type: z.string().nullable(), color: z.string().nullable() })),
  bait: z.array(z.object({ raw: z.string() })),
  techniques: z.array(z.string()),
  conditions_mentioned: z.object({ water_temp_f: z.number().nullable(), wind: z.string().nullable(), tide: z.string().nullable() }),
  summary: z.string().describe("One to two neutral sentences in our own words. Do not copy the original text."),
  extraction_confidence: z.number(),
});
export type Extraction = z.infer<typeof ExtractionSchema>;

export const ClassifySchema = z.object({ is_fishing_report: z.boolean(), species: z.array(z.string()) });
