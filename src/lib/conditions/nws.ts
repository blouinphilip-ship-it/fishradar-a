/** National Weather Service active alerts for a point (marine + land). */
import { getJson } from "./http";

export type Alert = { event: string; headline: string; severity: string; description: string; expires: string | null; isMarine: boolean };

type AlertsJson = { features?: { properties: { event: string; headline: string | null; severity: string; description: string; expires: string | null } }[] };

const MARINE = /(small craft|gale|storm warning|hurricane|tropical|marine|hazardous seas|special marine|rip current|high surf|freezing spray|dense fog advisory)/i;

export function parseAlerts(json: AlertsJson): Alert[] {
  return (json.features ?? []).map(({ properties: p }) => ({
    event: p.event, headline: p.headline ?? p.event, severity: p.severity, description: p.description?.slice(0, 1200) ?? "",
    expires: p.expires, isMarine: MARINE.test(p.event),
  }));
}

export async function fetchAlerts(lat: number, lon: number) {
  return parseAlerts(await getJson<AlertsJson>(`https://api.weather.gov/alerts/active?point=${lat.toFixed(4)},${lon.toFixed(4)}`));
}

/** Alerts that should cap boating scores / lead the assistant's answer. */
export const isDangerous = (a: Alert) => /(warning|small craft|hazardous seas|gale|storm|hurricane|rip current)/i.test(a.event);

/** NWS hourly forecast — used as the weather fallback when Open-Meteo is unavailable (US only). */
type PointsJson = { properties?: { forecastHourly?: string } };
type HourlyJson = { properties?: { periods?: { startTime: string; temperature: number; temperatureUnit: string; windSpeed: string; windDirection: string; probabilityOfPrecipitation?: { value: number | null }; shortForecast: string }[] } };

const COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];

export function parseNwsHourly(json: HourlyJson) {
  return (json.properties?.periods ?? []).map((p) => {
    const mph = (p.windSpeed.match(/\d+/g) ?? []).map(Number);
    const avg = mph.length ? mph.reduce((a, b) => a + b, 0) / mph.length : null;
    const dirIdx = COMPASS.indexOf(p.windDirection);
    return {
      time: new Date(p.startTime).toISOString(),
      airTempF: p.temperatureUnit === "F" ? p.temperature : Math.round((p.temperature * 9) / 5 + 32),
      windKt: avg == null ? null : Math.round(avg * 0.868976 * 10) / 10,
      windDirDeg: dirIdx >= 0 ? dirIdx * 22.5 : null,
      gustKt: mph.length > 1 ? Math.round(Math.max(...mph) * 0.868976 * 10) / 10 : null,
      pressureMb: null, cloudPct: null, precipIn: null, visibilityMi: null,
      precipChance: p.probabilityOfPrecipitation?.value ?? null, summary: p.shortForecast,
    };
  });
}

export async function fetchNwsHourly(lat: number, lon: number) {
  const pts = await getJson<PointsJson>(`https://api.weather.gov/points/${lat.toFixed(4)},${lon.toFixed(4)}`);
  if (!pts.properties?.forecastHourly) throw new Error("No NWS forecast for this point");
  return parseNwsHourly(await getJson<HourlyJson>(pts.properties.forecastHourly));
}
