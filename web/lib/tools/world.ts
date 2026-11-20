// Tools that look things up in the world. All free APIs, no keys needed.
import { str, type Tool } from "./types";

const UA = { "User-Agent": "Aspire/1.0 (Orkhon Hackathon; https://github.com/temuulenbuuveibaatar-glitch/emee-tovch)" };
const ERDENET = { name: "Erdenet", latitude: 49.0333, longitude: 104.0833 };

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`${new URL(url).host} returned ${res.status}`);
  return (await res.json()) as T;
}

async function locate(place: string) {
  if (!place || /erdenet|эрдэнэт|额尔登特/i.test(place)) return ERDENET;
  const data = await getJson<{ results?: Array<{ name: string; country?: string; latitude: number; longitude: number }> }>(
    `https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&name=${encodeURIComponent(place)}`,
  );
  const r = data.results?.[0];
  if (!r) throw new Error(`Place not found: ${place}`);
  return { name: [r.name, r.country].filter(Boolean).join(", "), latitude: r.latitude, longitude: r.longitude };
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

export const weather: Tool = {
  name: "get_weather",
  label: { icon: "☁️", mn: "Цаг агаар", en: "Weather" },
  description:
    "Current weather and the next 3 days for a place (default Erdenet): temperature, feels-like, wind, snow/rain chance. Use for any weather or 'what should I wear' question.",
  parameters: {
    type: "object",
    properties: { place: { type: "string", description: "City name in English, e.g. 'Ulaanbaatar'. Empty for Erdenet." } },
    required: ["place"],
  },
  async run(input) {
    const loc = await locate(str(input.place, 80));
    const d = await getJson<{
      current: Record<string, number>;
      daily: { time: string[]; temperature_2m_max: number[]; temperature_2m_min: number[]; weather_code: number[]; precipitation_probability_max: number[] };
    }>(
      `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}` +
        "&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m" +
        "&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max&timezone=auto&forecast_days=3",
    );
    return {
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
    };
  },
};

export const airQuality: Tool = {
  name: "get_air_quality",
  label: { icon: "🌫️", mn: "Агаарын бохирдол", en: "Air quality" },
  description:
    "Current air pollution (PM2.5, PM10, US AQI) for a place (default Erdenet). Winter smog is a real health risk in Mongolia: use it for 'is the air bad', 'can I go outside', and give simple advice (mask, stay inside) when AQI > 100.",
  parameters: {
    type: "object",
    properties: { place: { type: "string", description: "City name in English. Empty for Erdenet." } },
    required: ["place"],
  },
  async run(input) {
    const loc = await locate(str(input.place, 80));
    const d = await getJson<{ current: { pm2_5: number; pm10: number; us_aqi: number } }>(
      `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${loc.latitude}&longitude=${loc.longitude}&current=pm2_5,pm10,us_aqi`,
    );
    const aqi = d.current.us_aqi;
    const level =
      aqi <= 50 ? "good" : aqi <= 100 ? "moderate" : aqi <= 150 ? "unhealthy for sensitive groups (elderly)" : aqi <= 200 ? "unhealthy" : "very unhealthy";
    return { place: loc.name, usAqi: aqi, level, pm2_5: d.current.pm2_5, pm10: d.current.pm10 };
  },
};

let ratesCache: { at: number; rates: Record<string, number> } | null = null;

export const currency: Tool = {
  name: "convert_currency",
  label: { icon: "💱", mn: "Ханш", en: "Exchange rate" },
  description: "Convert money between currencies with today's rate, e.g. USD to MNT (tögrög), CNY, RUB, EUR, KRW.",
  parameters: {
    type: "object",
    properties: {
      amount: { type: "number", description: "Amount to convert, e.g. 100" },
      from: { type: "string", description: "3-letter currency code, e.g. USD" },
      to: { type: "string", description: "3-letter currency code, e.g. MNT" },
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
  label: { icon: "📚", mn: "Нэвтэрхий толь", en: "Encyclopedia" },
  description:
    "Look up a person, place, history, science or culture topic on Wikipedia and get a short summary. Good for stable facts; use web search for news and prices.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "What to look up, e.g. 'Chinggis Khaan'" },
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
  label: { icon: "🧮", mn: "Тооцоолол", en: "Calculator" },
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
