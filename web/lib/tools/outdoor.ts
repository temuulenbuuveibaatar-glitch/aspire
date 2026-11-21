// "Is it safe to go out at 05:30?": ice, frostbite, UV and the weather for one hour, anywhere.
// One Open-Meteo request (free, no key). The ice check only ever raises a risk: missing a signal
// never means "no ice" or "safe".
import { UA } from "@/lib/site";
import { NO_PLACE, openMeteoGeocode } from "./world";
import { str, type Tool, type ToolContext } from "./types";

/** WMO codes that mean ice by themselves: freezing fog, freezing drizzle, freezing rain. */
const ICE_CODES = new Set([48, 56, 57, 66, 67]);

/** "risk of ice" or null (null = no signal in the data, which is not the same as no ice). */
export function iceRisk(code: number, tempC: number, precipPrior6hMm: number): "risk of ice" | null {
  return ICE_CODES.has(code) || (tempC <= 0 && precipPrior6hMm > 0) ? "risk of ice" : null;
}

/** Environment Canada wind chill index (air at or below 10 C, wind at least 4.8 km/h), else null. */
export function windChill(tempC: number, windKmh: number): number | null {
  if (tempC > 10 || windKmh < 4.8) return null;
  const v = windKmh ** 0.16;
  return Math.round(13.12 + 0.6215 * tempC - 11.37 * v + 0.3965 * tempC * v);
}

/** Environment Canada wind chill hazard bands: how fast exposed skin of a healthy adult can freeze. */
export function frostbite(wci: number | null): string | null {
  if (wci === null || wci > -28) return null;
  const t = wci <= -55 ? "under 2 minutes" : wci <= -48 ? "2-5 minutes" : wci <= -40 ? "5-10 minutes" : "10-30 minutes";
  return `exposed skin can freeze in ${t} (healthy adults; children and older people sooner)`;
}

/** WHO UV index bands; protection is advised from 3. */
export function uvLevel(uv: number): string {
  return uv < 3 ? "low" : uv < 6 ? "moderate: hat and sunscreen" : uv < 8 ? "high: protection needed, shade at midday" : uv < 11 ? "very high: avoid midday sun" : "extreme: stay out of the midday sun";
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Device location (opt-in) or network position, rounded to about 1 km, like get_weather. */
async function where(place: string, ctx: ToolContext): Promise<{ name: string; lat: number; lng: number }> {
  const at = place ? null : (ctx.device.location ?? ctx.approxLocation);
  if (at) return { name: ctx.city || "your location", lat: Math.round(at.lat * 100) / 100, lng: Math.round(at.lng * 100) / 100 };
  const q = place || ctx.city || "";
  if (!q) throw new Error(NO_PLACE);
  return openMeteoGeocode(q);
}

interface Hourly {
  time: string[];
  temperature_2m: number[];
  apparent_temperature: number[];
  precipitation: number[];
  snowfall: number[];
  weather_code: number[];
  visibility: number[];
  wind_speed_10m: number[];
  wind_gusts_10m: number[];
  uv_index: number[];
}

export const outdoorCheck: Tool = {
  name: "outdoor_check",
  label: { mn: "Гадаа гарах", en: "Going out" },
  description:
    "Is it safe to go out now or at a given hour (up to 48 hours ahead), anywhere: ice risk on roads and pavements, frostbite time from wind chill, UV index, and that hour's temperature, feels-like, wind gusts, rain, snow and visibility. Use it for 'is it icy', 'can I walk to the shop', 'is it safe to drive at 5:30', 'can the kids play outside' (also call get_air_quality for that). Never say there is no ice or that it is safe: if there is no ice signal, say pavements can still be icy and to walk carefully.",
  parameters: {
    type: "object",
    properties: {
      place: { type: "string", description: "City name in English. Empty string = where the person is." },
      hour: { type: "string", description: "Local time at the place as YYYY-MM-DDTHH:MM within the next 48 hours, e.g. '2026-11-22T05:30'. Empty string = now." },
    },
    required: ["place", "hour"],
  },
  async run(input, ctx) {
    const place = str(input.place, 80);
    const hour = str(input.hour, 16);
    if (hour && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(hour)) return { error: "hour must be YYYY-MM-DDTHH:MM local time, or empty for now" };
    if (!place && !ctx.device.location && !ctx.approxLocation && !ctx.city) return { error: NO_PLACE };
    const loc = await where(place, ctx);
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lng}` +
        "&hourly=temperature_2m,apparent_temperature,precipitation,snowfall,weather_code,visibility,wind_speed_10m,wind_gusts_10m,uv_index" +
        "&daily=uv_index_max&timezone=auto&past_days=1&forecast_days=3",
      { redirect: "error", headers: { "User-Agent": UA }, signal: AbortSignal.timeout(10_000) },
    );
    if (!res.ok) throw new Error(`api.open-meteo.com returned ${res.status}`);
    const d = (await res.json()) as { utc_offset_seconds?: number; hourly?: Hourly; daily?: { time: string[]; uv_index_max: number[] } };
    const h = d.hourly;
    if (!h?.time?.length) return { place: loc.name, error: "No forecast for this place right now" };

    // The place's local clock, as Open-Meteo labels its hours ("2026-11-22T05:00").
    const localNow = new Date(ctx.now.getTime() + (d.utc_offset_seconds ?? 0) * 1000).toISOString().slice(0, 13);
    const want = (hour || localNow).slice(0, 13);
    const nowIdx = h.time.findIndex((t) => t.startsWith(localNow));
    const i = h.time.findIndex((t) => t.startsWith(want));
    if (nowIdx < 0 || i < nowIdx || i > nowIdx + 48) return { error: "hour must be within the next 48 hours (local time at the place)" };

    const num = (a: number[] | undefined, k: number) => (typeof a?.[k] === "number" && Number.isFinite(a[k]) ? a[k] : null);
    const temp = num(h.temperature_2m, i);
    const code = num(h.weather_code, i);
    const wind = num(h.wind_speed_10m, i);
    if (temp === null || code === null) return { place: loc.name, error: "No forecast for that hour" };
    let prior6h = 0;
    for (let k = Math.max(0, i - 6); k <= i; k++) prior6h += num(h.precipitation, k) ?? 0;
    const wci = wind === null ? null : windChill(temp, wind);
    const uv = num(h.uv_index, i);
    const dayIdx = d.daily?.time?.indexOf(want.slice(0, 10)) ?? -1;
    const uvMax = dayIdx >= 0 ? num(d.daily?.uv_index_max, dayIdx) : null;

    return {
      place: loc.name,
      localTime: h.time[i],
      tempC: temp,
      feelsLikeC: num(h.apparent_temperature, i),
      windKmh: wind,
      gustsKmh: num(h.wind_gusts_10m, i),
      precipitationMm: num(h.precipitation, i),
      snowfallCm: num(h.snowfall, i),
      wmoWeatherCode: code,
      visibilityM: num(h.visibility, i),
      ice: iceRisk(code, temp, prior6h) ?? "no ice signal in the forecast; pavements can still be icy",
      windChillC: wci,
      frostbite: frostbite(wci),
      uvIndex: uv === null ? null : r1(uv),
      uvLevel: uv === null ? "unknown" : uvLevel(uv),
      uvMaxToday: uvMax === null ? null : r1(uvMax),
      uvMaxLevel: uvMax === null ? "unknown" : uvLevel(uvMax),
      source: "open-meteo (model forecast, not a road report)",
    };
  },
};

export const outdoorTools: Tool[] = [outdoorCheck];
