/** Small geo helpers (pure, unit-tested). */

const R_KM = 6371;
export const KM_PER_MI = 1.609344;

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

export const haversineMi = (lat1: number, lon1: number, lat2: number, lon2: number) =>
  haversineKm(lat1, lon1, lat2, lon2) / KM_PER_MI;

/**
 * Fuzz a location for public display. Snaps to a grid (~2 miles by default) so the exact
 * spot can't be recovered, and the same input always maps to the same output.
 */
export function fuzzPoint(lat: number, lon: number, gridMiles = 2): { lat: number; lon: number } {
  const latStep = (gridMiles * KM_PER_MI) / 111.32;
  const cellLat = (Math.floor(lat / latStep) + 0.5) * latStep;
  // Use the cell's latitude (not the input's) so every point in a cell gets the same lon grid.
  const lonStep = latStep / Math.max(0.2, Math.cos((cellLat * Math.PI) / 180));
  return {
    lat: Math.round(cellLat * 1e5) / 1e5,
    lon: Math.round((Math.floor(lon / lonStep) + 0.5) * lonStep * 1e5) / 1e5,
  };
}

export function degToCompass(deg: number | null | undefined): string {
  if (deg == null || Number.isNaN(deg)) return "—";
  const dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return dirs[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];
}

/** Day of year, 1..366, in UTC. */
export function dayOfYear(d: Date): number {
  const start = Date.UTC(d.getUTCFullYear(), 0, 1);
  return Math.floor((d.getTime() - start) / 86_400_000) + 1;
}
