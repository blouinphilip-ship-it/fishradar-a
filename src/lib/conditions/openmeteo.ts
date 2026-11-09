/** Open-Meteo hourly weather + marine forecast (global coverage, no key for non-commercial use). */
import { getJson } from "./http";

export type WeatherHour = {
  time: string; airTempF: number | null; windKt: number | null; windDirDeg: number | null; gustKt: number | null;
  pressureMb: number | null; cloudPct: number | null; precipIn: number | null; visibilityMi: number | null;
};
export type MarineHour = { time: string; waveFt: number | null; wavePeriodS: number | null; waveDirDeg: number | null; swellFt: number | null; swellPeriodS: number | null; sstF: number | null };

type Hourly = Record<string, (number | null)[]> & { time: string[] };
const at = (h: Hourly, k: string, i: number) => (h[k]?.[i] ?? null) as number | null;
const iso = (t: string) => new Date(t + "Z").toISOString();
const r1 = (v: number | null) => (v == null ? null : Math.round(v * 10) / 10);

export function parseWeather(json: { hourly: Hourly }): WeatherHour[] {
  const h = json.hourly;
  return h.time.map((t, i) => ({
    time: iso(t), airTempF: at(h, "temperature_2m", i), windKt: at(h, "wind_speed_10m", i), windDirDeg: at(h, "wind_direction_10m", i),
    gustKt: at(h, "wind_gusts_10m", i), pressureMb: at(h, "pressure_msl", i), cloudPct: at(h, "cloud_cover", i),
    precipIn: at(h, "precipitation", i), visibilityMi: at(h, "visibility", i) == null ? null : Math.round((at(h, "visibility", i)! / 5280) * 10) / 10,
  }));
}

export function parseMarine(json: { hourly: Hourly; hourly_units?: Record<string, string> }): MarineHour[] {
  const h = json.hourly;
  const sstIsC = (json.hourly_units?.sea_surface_temperature ?? "°C").includes("C");
  return h.time.map((t, i) => {
    const sst = at(h, "sea_surface_temperature", i);
    return {
      time: iso(t), waveFt: r1(at(h, "wave_height", i)), wavePeriodS: r1(at(h, "wave_period", i)), waveDirDeg: at(h, "wave_direction", i),
      swellFt: r1(at(h, "swell_wave_height", i)), swellPeriodS: r1(at(h, "swell_wave_period", i)),
      sstF: sst == null ? null : sstIsC ? Math.round((sst * 9) / 5 + 32) : sst,
    };
  });
}

export async function fetchWeather(lat: number, lon: number) {
  const q = `latitude=${lat}&longitude=${lon}&hourly=temperature_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m,pressure_msl,cloud_cover,precipitation,visibility&wind_speed_unit=kn&temperature_unit=fahrenheit&precipitation_unit=inch&timezone=GMT&past_days=1&forecast_days=3`;
  return parseWeather(await getJson(`https://api.open-meteo.com/v1/forecast?${q}`));
}

export async function fetchMarine(lat: number, lon: number) {
  const q = `latitude=${lat}&longitude=${lon}&hourly=wave_height,wave_period,wave_direction,swell_wave_height,swell_wave_period,sea_surface_temperature&length_unit=imperial&timezone=GMT&forecast_days=3`;
  return parseMarine(await getJson(`https://marine-api.open-meteo.com/v1/marine?${q}`));
}
