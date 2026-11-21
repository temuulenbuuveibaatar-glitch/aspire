// Tools that look things up in the world. Free APIs, no keys needed; weather and air quality
// use Google Maps Platform first when GOOGLE_MAPS_API_KEY is set, and fall back to Open-Meteo.
// With no place named, they use where the person is: the shared device location first, then the
// network city. There is no default city: Aspire serves every country.
import { airQualityAt, currentWeather, geocode, mapsConfigured } from "@/lib/maps";
import type { SkyKind } from "@/lib/ambient-types";
import { UA } from "@/lib/site";
import { str, type Tool, type ToolContext, type WeatherCardDay } from "./types";

const UA_HEADERS = { "User-Agent": UA };

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: UA_HEADERS, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`${new URL(url).host} returned ${res.status}`);
  return (await res.json()) as T;
}

interface Loc {
  name: string;
  lat: number;
  lng: number;
}

export const NO_PLACE = "Location unknown: ask which city they mean, or suggest turning on 'Use my location' in Settings.";

/**
 * Where the person is, without any lookup: device location (opt-in) first, then the network
 * position. Rounded to 2 decimals (about 1 km): weather and air quality need no more, and the
 * privacy page promises no more for Open-Meteo and the Google Weather / Air Quality APIs.
 */
function hereOf(ctx: ToolContext): Loc | null {
  const at = ctx.device.location ?? ctx.approxLocation;
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return at ? { name: ctx.city || "your location", lat: r2(at.lat), lng: r2(at.lng) } : null;
}

/** Can a place-less question be answered at all? */
const knowsWhere = (place: string, ctx: ToolContext) => Boolean(place || hereOf(ctx) || ctx.city);

/** Open-Meteo geocoding (free, no key). */
export async function openMeteoGeocode(place: string): Promise<Loc> {
  const data = await getJson<{ results?: Array<{ name: string; country?: string; latitude: number; longitude: number }> }>(
    `https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&name=${encodeURIComponent(place)}`,
  );
  const r = data.results?.[0];
  if (!r) throw new Error(`Place not found: ${place}`);
  return { name: [r.name, r.country].filter(Boolean).join(", "), lat: r.latitude, lng: r.longitude };
}

async function locate(place: string, ctx: ToolContext, viaGoogle: boolean): Promise<Loc> {
  const here = place ? null : hereOf(ctx);
  if (here) return here;
  const q = place || ctx.city || "";
  if (!q) throw new Error(NO_PLACE);
  if (viaGoogle) {
    const g = await geocode(q, ctx.lang ?? "en");
    return { name: g.name, lat: g.lat, lng: g.lng };
  }
  return openMeteoGeocode(q);
}

/** Google's answer for a place, or null to fall back to Open-Meteo (no key, quota, error, no data). */
async function viaGoogle<T>(place: string, ctx: ToolContext, get: (lat: number, lng: number) => Promise<T>): Promise<({ place: string } & T) | null> {
  if (!mapsConfigured()) return null;
  try {
    const loc = await locate(place, ctx, true);
    return { place: loc.name, ...(await get(loc.lat, loc.lng)) };
  } catch {
    return null;
  }
}

// WMO weather codes -> words (the model translates them).
const WMO: Record<number, string> = {
  0: "clear sky", 1: "mainly clear", 2: "partly cloudy", 3: "overcast", 45: "fog", 48: "freezing fog",
  51: "light drizzle", 53: "drizzle", 55: "heavy drizzle", 56: "freezing drizzle", 57: "freezing drizzle",
  61: "light rain", 63: "rain", 65: "heavy rain", 66: "freezing rain", 67: "freezing rain",
  71: "light snow", 73: "snow", 75: "heavy snow", 77: "snow grains", 80: "rain showers", 81: "rain showers",
  82: "violent rain showers", 85: "snow showers", 86: "heavy snow showers", 95: "thunderstorm",
  96: "thunderstorm with hail", 99: "thunderstorm with hail",
};

/** Condition words (Google's English text or the WMO words above) to a sky kind for the card. */
export function kindFromWords(text: unknown): SkyKind {
  const t = typeof text === "string" ? text.toLowerCase() : "";
  if (/thunder|storm/.test(t)) return "storm";
  if (/hail/.test(t)) return "hail";
  if (/sleet|freezing|ice pellet|wintry/.test(t)) return "sleet";
  if (/snow|flurr|blizzard/.test(t)) return "snow";
  if (/drizzle/.test(t)) return "drizzle";
  if (/rain|shower/.test(t)) return "rain";
  if (/fog|mist|haze/.test(t)) return "fog";
  if (/partly|mostly clear|mainly clear|mostly sunny|partly sunny/.test(t)) return "partly";
  if (/cloud|overcast/.test(t)) return "cloudy";
  return "clear";
}

const fin = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Adds the weather card for a tool result (both sources share this shape). */
function pushWeatherCard(
  ctx: ToolContext,
  out: {
    place: string;
    now: { temperatureC: number; feelsLikeC?: number; conditions?: string };
    days?: { date: string; minC: number; maxC: number; conditions?: string; precipitationChancePct?: number }[];
  },
): void {
  if (!fin(out.now.temperatureC)) return;
  const days: WeatherCardDay[] = (out.days ?? [])
    .filter((d) => d && fin(d.minC) && fin(d.maxC) && /^\d{4}-\d{2}-\d{2}$/.test(String(d.date)))
    .slice(0, 3)
    .map((d) => ({
      date: d.date,
      minC: d.minC,
      maxC: d.maxC,
      kind: kindFromWords(d.conditions),
      precipChance: fin(d.precipitationChancePct) ? d.precipitationChancePct : null,
    }));
  ctx.actions.push({
    type: "weather",
    place: String(out.place).slice(0, 80),
    tempC: out.now.temperatureC,
    feelsC: fin(out.now.feelsLikeC) ? out.now.feelsLikeC : null,
    kind: kindFromWords(out.now.conditions),
    days,
  });
}

export const weather: Tool = {
  name: "get_weather",
  label: { mn: "Цаг агаар", en: "Weather" },
  description:
    "Current weather and the next 3 days for any place in the world: temperature, feels-like, wind, rain or snow chance. With an empty place it uses where the person is (shared location, else their network city). Use for any weather or 'what should I wear' question.",
  parameters: {
    type: "object",
    properties: { place: { type: "string", description: "City name in English, e.g. 'Lagos' or 'Berlin'. Empty string = where the person is." } },
    required: ["place"],
  },
  async run(input, ctx) {
    const place = str(input.place, 80);
    if (!knowsWhere(place, ctx)) return { error: NO_PLACE };
    const google = await viaGoogle(place, ctx, currentWeather);
    if (google) {
      pushWeatherCard(ctx, google);
      return { ...google, source: "google" };
    }
    const loc = await locate(place, ctx, false);
    const d = await getJson<{
      current: Record<string, number>;
      daily: { time: string[]; temperature_2m_max: number[]; temperature_2m_min: number[]; weather_code: number[]; precipitation_probability_max: number[] };
    }>(
      `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lng}` +
        "&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m" +
        "&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max&timezone=auto&forecast_days=3",
    );
    const result = {
      place: loc.name,
      now: {
        temperatureC: d.current.temperature_2m,
        feelsLikeC: d.current.apparent_temperature,
        conditions: WMO[d.current.weather_code] ?? `code ${d.current.weather_code}`,
        windKmh: d.current.wind_speed_10m,
        humidityPct: d.current.relative_humidity_2m,
      },
      days: d.daily.time.map((date, i) => ({
        date,
        minC: d.daily.temperature_2m_min[i],
        maxC: d.daily.temperature_2m_max[i],
        conditions: WMO[d.daily.weather_code[i]] ?? "",
        precipitationChancePct: d.daily.precipitation_probability_max[i],
      })),
      source: "open-meteo",
    };
    pushWeatherCard(ctx, result);
    return result;
  },
};

const aqiLevel = (aqi: number) =>
  aqi <= 50 ? "good" : aqi <= 100 ? "moderate" : aqi <= 150 ? "unhealthy for sensitive groups (elderly)" : aqi <= 200 ? "unhealthy" : aqi <= 300 ? "very unhealthy" : "hazardous";

export const airQuality: Tool = {
  name: "get_air_quality",
  label: { mn: "Агаарын бохирдол", en: "Air quality" },
  description:
    "Current air pollution (PM2.5, PM10, US AQI) for any place in the world. With an empty place it uses where the person is (shared location, else their network city). Use it for 'is the air bad', 'can I go for a run', and give simple advice (mask, stay inside) when AQI > 100; smog is a real health risk for elderly people and children.",
  parameters: {
    type: "object",
    properties: { place: { type: "string", description: "City name in English. Empty string = where the person is." } },
    required: ["place"],
  },
  async run(input, ctx) {
    const place = str(input.place, 80);
    if (!knowsWhere(place, ctx)) return { error: NO_PLACE };
    const google = await viaGoogle(place, ctx, airQualityAt);
    if (google) {
      return { place: google.place, usAqi: google.usAqi, level: aqiLevel(google.usAqi), pm2_5: google.pm2_5, pm10: google.pm10, universalAqi: google.universalAqi, source: "google" };
    }
    const loc = await locate(place, ctx, false);
    const d = await getJson<{ current?: { pm2_5?: number | null; pm10?: number | null; us_aqi?: number | null } }>(
      `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${loc.lat}&longitude=${loc.lng}&current=pm2_5,pm10,us_aqi`,
    );
    const aqi = d.current?.us_aqi;
    // A missing index must not read as "good".
    if (typeof aqi !== "number" || !Number.isFinite(aqi)) return { place: loc.name, error: "No air quality data for this place right now" };
    return { place: loc.name, usAqi: aqi, level: aqiLevel(aqi), pm2_5: d.current?.pm2_5 ?? null, pm10: d.current?.pm10 ?? null, source: "open-meteo" };
  },
};

let ratesCache: { at: number; rates: Record<string, number> } | null = null;

export const currency: Tool = {
  name: "convert_currency",
  label: { mn: "Ханш", en: "Exchange rate" },
  description:
    "Convert money between any currencies with today's rate (USD, EUR, GBP, CNY, JPY, RUB, MNT, INR, NGN, BRL...). If the person does not name their own currency, use the one of their country.",
  parameters: {
    type: "object",
    properties: {
      amount: { type: "number", description: "Amount to convert, e.g. 100" },
      from: { type: "string", description: "3-letter currency code, e.g. USD" },
      to: { type: "string", description: "3-letter currency code, e.g. EUR" },
    },
    required: ["amount", "from", "to"],
  },
  async run(input) {
    const from = str(input.from, 3).toUpperCase();
    const to = str(input.to, 3).toUpperCase();
    const amount = Number(input.amount);
    if (!Number.isFinite(amount)) return { error: "amount must be a number" };
    if (!ratesCache || Date.now() - ratesCache.at > 3_600_000) {
      const d = await getJson<{ rates: Record<string, number> }>("https://open.er-api.com/v6/latest/USD");
      ratesCache = { at: Date.now(), rates: d.rates };
    }
    const r = ratesCache.rates;
    if (!r[from] || !r[to]) return { error: `Unknown currency ${!r[from] ? from : to}` };
    const result = (amount / r[from]) * r[to];
    return { amount, from, to, result: Math.round(result * 100) / 100, rate: Math.round((r[to] / r[from]) * 10000) / 10000, source: "open.er-api.com" };
  },
};

const WIKI_LANGS = new Set(["mn", "zh", "en", "ru", "de"]);

export const encyclopedia: Tool = {
  name: "encyclopedia",
  label: { mn: "Нэвтэрхий толь", en: "Encyclopedia" },
  description:
    "Look up a person, place, history, science or culture topic on Wikipedia and get a short summary. Good for stable facts; use web search for news and prices.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "What to look up, e.g. 'Marie Curie'" },
      lang: { type: "string", description: "Wikipedia language", enum: ["mn", "zh", "en", "ru", "de"] },
    },
    required: ["query", "lang"],
  },
  async run(input) {
    const lang = WIKI_LANGS.has(str(input.lang)) ? str(input.lang) : "en";
    const q = str(input.query, 120);
    const search = await getJson<{ query?: { search?: Array<{ title: string }> } }>(
      `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=1&srsearch=${encodeURIComponent(q)}`,
    );
    const title = search.query?.search?.[0]?.title;
    if (!title) return { error: `Nothing found for "${q}"` };
    const page = await getJson<{ title: string; extract?: string }>(
      `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
    );
    return { title: page.title, summary: (page.extract ?? "").slice(0, 1500), source: `${lang}.wikipedia.org` };
  },
};

/** Safe arithmetic: digits and operators only, no names, so nothing can run but math. */
export function calculate(expression: string): number {
  const expr = expression.replace(/×/g, "*").replace(/÷/g, "/").replace(/,/g, ".").replace(/\s+/g, "");
  if (!expr || expr.length > 120 || !/^[0-9+\-*/().%^]+$/.test(expr)) throw new Error("Only numbers and + - * / ^ % ( ) are allowed");
  const js = expr.replace(/\^/g, "**").replace(/(\d+(?:\.\d+)?)%/g, "($1/100)");
  const value = Function(`"use strict"; return (${js});`)() as unknown;
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("Not a finite number");
  return Math.round(value * 1e10) / 1e10;
}

export const calculator: Tool = {
  name: "calculate",
  label: { mn: "Тооцоолол", en: "Calculator" },
  description: "Exact arithmetic: prices, change, pension amounts, percentages, unit math. Use instead of computing in your head.",
  parameters: {
    type: "object",
    properties: { expression: { type: "string", description: "Arithmetic only, e.g. '3*4500 + 1200' or '15% * 80000'" } },
    required: ["expression"],
  },
  async run(input) {
    try {
      return { expression: str(input.expression, 120), result: calculate(str(input.expression, 120)) };
    } catch (e) {
      return { error: e instanceof Error ? e.message : "invalid expression" };
    }
  },
};
