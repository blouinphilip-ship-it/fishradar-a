/** USGS Water Services instantaneous values: streamflow, gauge height, water temperature, lake level. */
import { getJson } from "./http";

export type RiverObs = { siteName: string; time: string | null; flowCfs: number | null; gaugeFt: number | null; waterTempF: number | null; lakeLevelFt: number | null };

type IvJson = { value: { timeSeries: { sourceInfo: { siteName: string }; variable: { variableCode: { value: string }[]; noDataValue: number }; values: { value: { value: string; dateTime: string }[] }[] }[] } };

export function parseUsgs(json: IvJson): RiverObs | null {
  const ts = json.value?.timeSeries ?? [];
  if (ts.length === 0) return null;
  const out: RiverObs = { siteName: ts[0].sourceInfo.siteName, time: null, flowCfs: null, gaugeFt: null, waterTempF: null, lakeLevelFt: null };
  for (const s of ts) {
    const code = s.variable.variableCode[0]?.value;
    const last = s.values[0]?.value.at(-1);
    if (!last) continue;
    const v = Number(last.value);
    if (Number.isNaN(v) || v === s.variable.noDataValue) continue;
    out.time = new Date(last.dateTime).toISOString();
    if (code === "00060") out.flowCfs = v;
    if (code === "00065") out.gaugeFt = v;
    if (code === "00010") out.waterTempF = Math.round((v * 9) / 5 + 32);
    if (code === "62614" || code === "62615") out.lakeLevelFt = v;
  }
  return out;
}

export async function fetchRiver(site: string) {
  return parseUsgs(await getJson<IvJson>(`https://waterservices.usgs.gov/nwis/iv/?format=json&sites=${site}&parameterCd=00060,00065,00010,62614&siteStatus=active`));
}
