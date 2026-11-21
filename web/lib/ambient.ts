// Server side of the live "world around you" snapshot (GET /api/ambient): sky, weather, air,
// traffic and nearby stops for any city. Every source is optional and fetched in parallel;
// Google first (key only in a header, via lib/maps.ts), Open-Meteo as the free fallback.
// Positions are rounded to 2 decimals (about 1 km) and never stored or linked to a person;
// results are cached in memory per rounded position (per server instance), never per language:
// numbers are fetched once and only the words are localised per request. Current conditions for
// 10 minutes, the 3-day forecast for 3 hours, air quality for 30 minutes, the traffic probe for
// 20 minutes, nearby stops and the city centre for a day.
import type { Ambient, AmbientAir, AmbientSky, AmbientStop, AmbientTraffic, AmbientWeather, SkyKind, TrafficLevel } from "@/lib/ambient-types";
import { aqiCategory } from "@/lib/ambient-types";
import type { Lang } from "@/lib/lang";
import {
  airQualityNow,
  cityCentre,
  drivingTraffic,
  haversineKm,
  type LatLng,
  mapsConfigured,
  nearbyTransitStops,
  weatherCurrent,
  weatherDays,
} from "@/lib/maps";
import { allStops, findStop, localMinutes, nextArrivals } from "@/lib/transit";

// ---- location ---------------------------------------------------------------------------------
export interface Located {
  coords: LatLng | null;
  locatedBy: "device" | "network" | null;
  /** City from the network (Vercel IP headers), when known. */
  city: string | null;
  country: string | null;
  timeZone: string | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function coord(v: string | null | undefined, max: number): number | null {
  if (v == null) return null;
  const s = v.trim();
  if (!s || s.length > 24 || !/^-?\d{1,3}(?:\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) && Math.abs(n) <= max ? n : null;
}

function pair(lat: string | null | undefined, lng: string | null | undefined): LatLng | null {
  const a = coord(lat, 90);
  const b = coord(lng, 180);
  return a === null || b === null ? null : { lat: round2(a), lng: round2(b) };
}

export function validTimeZone(tz: string | null | undefined): string | null {
  if (!tz || tz.length > 64 || !/^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+){0,2}$/.test(tz)) return null;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: tz });
    return tz;
  } catch {
    return null;
  }
}

function headerText(v: string | null, max: number): string | null {
  if (!v) return null;
  let s = v;
  try {
    s = decodeURIComponent(v);
  } catch {
    // keep as sent
  }
  s = s
    .replace(/[\u0000-\u001f\u007f<>]/g, "")
    .trim()
    .slice(0, max);
  return s || null;
}

/**
 * Where the person is: valid query lat/lng (the device, opt-in) -> Vercel's IP geolocation
 * headers (city level) -> nothing. Coordinates are always rounded to 2 decimals.
 */
export function locate(params: URLSearchParams, headers: Headers): Located {
  const city = headerText(headers.get("x-vercel-ip-city"), 80);
  const country = headerText(headers.get("x-vercel-ip-country"), 8);
  const timeZone = validTimeZone(headers.get("x-vercel-ip-timezone"));
  const device = pair(params.get("lat"), params.get("lng"));
  const network = pair(headers.get("x-vercel-ip-latitude"), headers.get("x-vercel-ip-longitude"));
  if (device) {
    // The network city/time zone only describe the device position when they are close.
    const near = network !== null && haversineKm(device, network) <= 50;
    return {
      coords: device,
      locatedBy: "device",
      city: near ? city : null,
      country: near ? country : null,
      timeZone: near ? timeZone : null,
    };
  }
  if (network) return { coords: network, locatedBy: "network", city, country, timeZone };
  return { coords: null, locatedBy: null, city: null, country: null, timeZone };
}

// ---- condition mapping ------------------------------------------------------------------------
export interface SkyState {
  kind: SkyKind;
  intensity: number;
}

const GOOGLE_SKY: Record<string, SkyState> = {
  CLEAR: { kind: "clear", intensity: 0 },
  VERY_HOT: { kind: "clear", intensity: 0 },
  MOSTLY_CLEAR: { kind: "partly", intensity: 0.25 },
  PARTLY_CLOUDY: { kind: "partly", intensity: 0.5 },
  MOSTLY_CLOUDY: { kind: "cloudy", intensity: 0.75 },
  CLOUDY: { kind: "cloudy", intensity: 1 },
  FOG: { kind: "fog", intensity: 0.7 },
  HAZE: { kind: "fog", intensity: 0.4 },
  WIND_AND_RAIN: { kind: "rain", intensity: 0.7 },
  CHANCE_OF_SHOWERS: { kind: "drizzle", intensity: 0.3 },
  LIGHT_RAIN_SHOWERS: { kind: "rain", intensity: 0.35 },
  SCATTERED_SHOWERS: { kind: "rain", intensity: 0.4 },
  RAIN_SHOWERS: { kind: "rain", intensity: 0.6 },
  HEAVY_RAIN_SHOWERS: { kind: "rain", intensity: 0.9 },
  LIGHT_RAIN: { kind: "rain", intensity: 0.35 },
  LIGHT_TO_MODERATE_RAIN: { kind: "rain", intensity: 0.45 },
  RAIN: { kind: "rain", intensity: 0.6 },
  MODERATE_TO_HEAVY_RAIN: { kind: "rain", intensity: 0.75 },
  RAIN_PERIODICALLY_HEAVY: { kind: "rain", intensity: 0.75 },
  HEAVY_RAIN: { kind: "rain", intensity: 0.9 },
  HEAVY_RAIN_TO_RAINSTORM: { kind: "rain", intensity: 1 },
  CHANCE_OF_SNOW_SHOWERS: { kind: "snow", intensity: 0.25 },
  LIGHT_SNOW_SHOWERS: { kind: "snow", intensity: 0.35 },
  SCATTERED_SNOW_SHOWERS: { kind: "snow", intensity: 0.4 },
  SNOW_SHOWERS: { kind: "snow", intensity: 0.6 },
  HEAVY_SNOW_SHOWERS: { kind: "snow", intensity: 0.9 },
  LIGHT_SNOW: { kind: "snow", intensity: 0.35 },
  LIGHT_TO_MODERATE_SNOW: { kind: "snow", intensity: 0.45 },
  SNOW: { kind: "snow", intensity: 0.6 },
  MODERATE_TO_HEAVY_SNOW: { kind: "snow", intensity: 0.75 },
  SNOW_PERIODICALLY_HEAVY: { kind: "snow", intensity: 0.75 },
  BLOWING_SNOW: { kind: "snow", intensity: 0.8 },
  HEAVY_SNOW: { kind: "snow", intensity: 0.9 },
  SNOWSTORM: { kind: "snow", intensity: 1 },
  HEAVY_SNOW_STORM: { kind: "snow", intensity: 1 },
  RAIN_AND_SNOW: { kind: "sleet", intensity: 0.6 },
  SLEET: { kind: "sleet", intensity: 0.6 },
  HAIL: { kind: "hail", intensity: 0.7 },
  HAIL_SHOWERS: { kind: "hail", intensity: 0.6 },
  LIGHT_THUNDERSTORM_RAIN: { kind: "storm", intensity: 0.5 },
  SCATTERED_THUNDERSTORMS: { kind: "storm", intensity: 0.6 },
  THUNDERSHOWER: { kind: "storm", intensity: 0.7 },
  THUNDERSTORM: { kind: "storm", intensity: 0.8 },
  HEAVY_THUNDERSTORM: { kind: "storm", intensity: 1 },
};

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** Clear / partly / cloudy from a 0..100 cloud cover. */
function fromClouds(cloudCover: number | null): SkyState {
  if (cloudCover === null) return { kind: "partly", intensity: 0.4 };
  const c = clamp01(cloudCover / 100);
  return {
    kind: c < 0.2 ? "clear" : c < 0.7 ? "partly" : "cloudy",
    intensity: Math.round(c * 100) / 100,
  };
}

/**
 * Google WeatherCondition.Type -> sky kind + intensity. The many compound forecast types
 * ("CLOUDY_WITH_PERIODIC_RAIN", "SNOW_LATER_CLEAR"...) are read by their leading part.
 */
export function googleSky(type: string | null | undefined, cloudCover: number | null = null): SkyState {
  const t = (type ?? "").toUpperCase();
  if (t === "WINDY" || t === "" || t === "TYPE_UNSPECIFIED") return fromClouds(cloudCover);
  const exact = GOOGLE_SKY[t];
  if (exact) {
    // Cloud cover refines the dry kinds when Google gives it.
    if ((exact.kind === "clear" || exact.kind === "partly" || exact.kind === "cloudy") && cloudCover !== null) {
      return {
        kind: exact.kind,
        intensity: Math.round(clamp01(cloudCover / 100) * 100) / 100,
      };
    }
    return exact;
  }
  // What happens now comes first: "RAIN_LATER_BECOMING_CLEAR" -> "RAIN".
  const head = t.split(/_(?:BUT|LATER|AFTER|FROM|TURNING|BECOMING|IN_THE|ALONG)(?:_|$)/)[0];
  const brief = /BRIEF|PERIODIC|THAT_PERIODICALLY_STOPS|MIX/.test(head);
  const level = brief ? 0.35 : 0.6;
  if (/THUNDER|LIGHTNING/.test(head)) return { kind: "storm", intensity: brief ? 0.5 : 0.8 };
  if (/HAIL/.test(head)) return { kind: "hail", intensity: 0.6 };
  if (/SLEET|RAINSNOW|SNOWRAIN|RAIN_AND_SNOW|SNOW_AND_RAIN/.test(head) || (/RAIN/.test(head) && /SNOW/.test(head))) return { kind: "sleet", intensity: level };
  if (/SNOW/.test(head)) return { kind: "snow", intensity: level };
  if (/RAIN|SHOWER|RAINY/.test(head)) return { kind: "rain", intensity: level };
  if (/FOG|HAZE|MIST/.test(head)) return { kind: "fog", intensity: 0.6 };
  if (/CLOUDY/.test(head))
    return {
      kind: "cloudy",
      intensity: cloudCover !== null ? clamp01(cloudCover / 100) : 0.8,
    };
  if (/CLEAR|SUNNY|HOT/.test(head)) return { kind: "clear", intensity: 0 };
  return fromClouds(cloudCover);
}

const WMO_SKY: Record<number, SkyState> = {
  0: { kind: "clear", intensity: 0 },
  1: { kind: "partly", intensity: 0.25 },
  2: { kind: "partly", intensity: 0.5 },
  3: { kind: "cloudy", intensity: 1 },
  45: { kind: "fog", intensity: 0.6 },
  48: { kind: "fog", intensity: 0.8 },
  51: { kind: "drizzle", intensity: 0.25 },
  53: { kind: "drizzle", intensity: 0.4 },
  55: { kind: "drizzle", intensity: 0.6 },
  56: { kind: "sleet", intensity: 0.35 },
  57: { kind: "sleet", intensity: 0.6 },
  61: { kind: "rain", intensity: 0.35 },
  63: { kind: "rain", intensity: 0.6 },
  65: { kind: "rain", intensity: 0.9 },
  66: { kind: "sleet", intensity: 0.5 },
  67: { kind: "sleet", intensity: 0.8 },
  71: { kind: "snow", intensity: 0.35 },
  73: { kind: "snow", intensity: 0.6 },
  75: { kind: "snow", intensity: 0.9 },
  77: { kind: "snow", intensity: 0.3 },
  80: { kind: "rain", intensity: 0.4 },
  81: { kind: "rain", intensity: 0.6 },
  82: { kind: "rain", intensity: 1 },
  85: { kind: "snow", intensity: 0.5 },
  86: { kind: "snow", intensity: 0.9 },
  95: { kind: "storm", intensity: 0.8 },
  96: { kind: "storm", intensity: 0.9 },
  99: { kind: "hail", intensity: 0.9 },
};

/** Open-Meteo WMO weather_code -> sky kind + intensity. */
export function wmoSky(code: number | null | undefined, cloudCover: number | null = null): SkyState {
  const s = typeof code === "number" ? WMO_SKY[code] : undefined;
  if (!s) return fromClouds(cloudCover);
  if (code! <= 3 && cloudCover !== null)
    return {
      kind: s.kind,
      intensity: Math.round(clamp01(cloudCover / 100) * 100) / 100,
    };
  return s;
}

// ---- localized words (no emojis) ---------------------------------------------------------------
type Words = Record<SkyKind, string> & {
  lightRain: string;
  heavyRain: string;
  lightSnow: string;
  heavySnow: string;
};

const SKY_TEXT: Record<Lang, Words> = {
  mn: {
    clear: "Цэлмэг",
    partly: "Багавтар үүлтэй",
    cloudy: "Үүлэрхэг",
    fog: "Манантай",
    drizzle: "Шиврээ бороо",
    rain: "Бороотой",
    storm: "Аянга цахилгаантай",
    snow: "Цастай",
    sleet: "Нойтон цас",
    hail: "Мөндөртэй",
    lightRain: "Бага зэргийн бороо",
    heavyRain: "Хүчтэй бороо",
    lightSnow: "Бага зэргийн цас",
    heavySnow: "Их цас",
  },
  zh: {
    clear: "晴",
    partly: "局部多云",
    cloudy: "多云",
    fog: "雾",
    drizzle: "毛毛雨",
    rain: "雨",
    storm: "雷暴",
    snow: "雪",
    sleet: "雨夹雪",
    hail: "冰雹",
    lightRain: "小雨",
    heavyRain: "大雨",
    lightSnow: "小雪",
    heavySnow: "大雪",
  },
  en: {
    clear: "Clear",
    partly: "Partly cloudy",
    cloudy: "Cloudy",
    fog: "Fog",
    drizzle: "Drizzle",
    rain: "Rain",
    storm: "Thunderstorm",
    snow: "Snow",
    sleet: "Sleet",
    hail: "Hail",
    lightRain: "Light rain",
    heavyRain: "Heavy rain",
    lightSnow: "Light snow",
    heavySnow: "Heavy snow",
  },
  ru: {
    clear: "Ясно",
    partly: "Переменная облачность",
    cloudy: "Облачно",
    fog: "Туман",
    drizzle: "Морось",
    rain: "Дождь",
    storm: "Гроза",
    snow: "Снег",
    sleet: "Мокрый снег",
    hail: "Град",
    lightRain: "Небольшой дождь",
    heavyRain: "Сильный дождь",
    lightSnow: "Небольшой снег",
    heavySnow: "Сильный снег",
  },
  de: {
    clear: "Klar",
    partly: "Teilweise bewölkt",
    cloudy: "Bewölkt",
    fog: "Nebel",
    drizzle: "Nieselregen",
    rain: "Regen",
    storm: "Gewitter",
    snow: "Schnee",
    sleet: "Schneeregen",
    hail: "Hagel",
    lightRain: "Leichter Regen",
    heavyRain: "Starker Regen",
    lightSnow: "Leichter Schnee",
    heavySnow: "Starker Schneefall",
  },
};

/** A short condition phrase in the person's language, e.g. "Light snow". */
export function skyText(s: SkyState, lang: Lang): string {
  const w = SKY_TEXT[lang] ?? SKY_TEXT.en;
  if (s.kind === "rain") return s.intensity < 0.4 ? w.lightRain : s.intensity >= 0.8 ? w.heavyRain : w.rain;
  if (s.kind === "snow") return s.intensity < 0.4 ? w.lightSnow : s.intensity >= 0.8 ? w.heavySnow : w.snow;
  return w[s.kind];
}

const TOWARDS: Record<Lang, { centre: string; nearby: string }> = {
  mn: { centre: "хотын төв рүү", nearby: "ойролцоох замд" },
  zh: { centre: "前往市中心", nearby: "附近道路" },
  en: { centre: "to the city centre", nearby: "on nearby roads" },
  ru: { centre: "до центра города", nearby: "на ближайших дорогах" },
  de: { centre: "ins Stadtzentrum", nearby: "auf Straßen in der Nähe" },
};

// ---- traffic ------------------------------------------------------------------------------------
export function trafficLevel(ratio: number): TrafficLevel {
  if (ratio < 1.15) return "light";
  if (ratio < 1.4) return "moderate";
  return "heavy";
}

/** A point `km` east of `p` (used when the person is already in the centre). */
function eastOf(p: LatLng, km: number): LatLng {
  const cos = Math.max(0.2, Math.cos((p.lat * Math.PI) / 180));
  return {
    lat: p.lat,
    lng: Math.round((p.lng + km / (111.32 * cos)) * 10000) / 10000,
  };
}

// ---- data sources -----------------------------------------------------------------------------
const UA = { "User-Agent": "Aspire/1.0" };
const OM_TIMEOUT_MS = 8_000;
/** Every Google call made here is a background call: it never eats the quota kept for questions. */
const BG = { background: true } as const;

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: UA,
    signal: AbortSignal.timeout(OM_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`${new URL(url).host} returned ${res.status}`);
  return (await res.json()) as T;
}

/**
 * Optional fields from the data contract (design spec section 17) that lib/ambient-types.ts does
 * not declare yet: they travel in the JSON, and the client reads them as optional.
 */
type SkyOut = AmbientSky & { windDirDeg: number | null };
type AirOut = AmbientAir & { scale: "US_AQI" };

const daylight = (hour: number) => hour >= 6 && hour < 18;

/** Day or night from the place's clock when the provider does not say. */
function isDayAt(timeZone: string | null, now: Date): boolean {
  return daylight(hourIn(timeZone, now) ?? now.getUTCHours());
}

/** A day of the forecast, language-neutral: the words are added per request. */
interface RawDay {
  date: string;
  minC: number;
  maxC: number;
  state: SkyState;
  /** Google's English description, used only for English. */
  textEn: string;
  precipChance: number | null;
}

interface WeatherPart {
  sky: SkyOut;
  state: SkyState;
  tempC: number;
  feelsC: number;
  humidity: number | null;
  textEn: string;
  days: RawDay[];
  timeZone: string | null;
  source: "google" | "open-meteo";
}

/** The person's words for a language-neutral snapshot. Google's own text only for English. */
function localiseWeather(w: WeatherPart, lang: Lang): AmbientWeather {
  const words = (state: SkyState, en: string) => (lang === "en" && en.trim() ? en.trim().slice(0, 80) : skyText(state, lang));
  return {
    tempC: w.tempC,
    feelsC: w.feelsC,
    text: words(w.state, w.textEn),
    humidity: w.humidity,
    days: w.days.map((d) => ({
      date: d.date,
      minC: d.minC,
      maxC: d.maxC,
      text: words(d.state, d.textEn),
      kind: d.state.kind,
      precipChance: d.precipChance,
    })),
  };
}

const FORECAST_TTL_MS = 3 * 60 * 60 * 1000;

async function googleWeather(p: LatLng): Promise<WeatherPart> {
  // Current conditions every snapshot; the 3-day forecast changes slowly, so it is memoised per
  // ~10 km cell for 3 hours. Both are asked in English and localised per request.
  const [w, rawDays] = await Promise.all([
    weatherCurrent(p.lat, p.lng, "en", BG),
    memo(`days:${cell10(p)}`, FORECAST_TTL_MS, () => weatherDays(p.lat, p.lng, "en", BG)).catch(() => []),
  ]);
  const s = googleSky(w.type, w.cloudCover);
  const timeZone = validTimeZone(w.timeZone);
  const days: RawDay[] = [];
  for (const d of rawDays) {
    if (d.minC === null || d.maxC === null || !/^\d{4}-\d{2}-\d{2}$/.test(d.date)) continue;
    days.push({
      date: d.date,
      minC: d.minC,
      maxC: d.maxC,
      state: googleSky(d.type, null),
      textEn: d.text,
      precipChance: d.precipChance,
    });
  }
  return {
    sky: {
      kind: s.kind,
      intensity: s.intensity,
      isDay: w.isDaytime ?? isDayAt(timeZone, new Date()),
      windKph: w.windKph,
      cloudCover: w.cloudCover,
      windDirDeg: w.windDirDeg,
    },
    state: s,
    tempC: w.tempC,
    feelsC: w.feelsC,
    humidity: w.humidity,
    textEn: w.text,
    days,
    timeZone,
    source: "google",
  };
}

async function openMeteoWeather(p: LatLng): Promise<WeatherPart> {
  const d = await getJson<{
    timezone?: string;
    current?: Record<string, number>;
    daily?: {
      time?: string[];
      temperature_2m_max?: number[];
      temperature_2m_min?: number[];
      weather_code?: number[];
      precipitation_probability_max?: Array<number | null>;
    };
  }>(
    `https://api.open-meteo.com/v1/forecast?latitude=${p.lat}&longitude=${p.lng}` +
      "&current=temperature_2m,apparent_temperature,weather_code,is_day,cloud_cover,wind_speed_10m,wind_direction_10m,relative_humidity_2m" +
      "&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max&timezone=auto&forecast_days=3",
  );
  const c = d.current ?? {};
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const tempC = n(c.temperature_2m);
  if (tempC === null) throw new Error("No weather data here");
  const cloud = n(c.cloud_cover);
  const s = wmoSky(n(c.weather_code), cloud);
  const timeZone = validTimeZone(d.timezone);
  const days: RawDay[] = [];
  const daily = d.daily ?? {};
  (daily.time ?? []).slice(0, 3).forEach((date, i) => {
    const minC = n(daily.temperature_2m_min?.[i]);
    const maxC = n(daily.temperature_2m_max?.[i]);
    if (minC === null || maxC === null || typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    days.push({
      date,
      minC,
      maxC,
      state: wmoSky(n(daily.weather_code?.[i])),
      textEn: "",
      precipChance: n(daily.precipitation_probability_max?.[i]),
    });
  });
  return {
    sky: {
      kind: s.kind,
      intensity: s.intensity,
      isDay: c.is_day === 1 ? true : c.is_day === 0 ? false : isDayAt(timeZone, new Date()),
      windKph: n(c.wind_speed_10m),
      cloudCover: cloud,
      windDirDeg: n(c.wind_direction_10m),
    },
    state: s,
    tempC,
    feelsC: n(c.apparent_temperature) ?? tempC,
    humidity: n(c.relative_humidity_2m),
    textEn: "",
    days,
    timeZone,
    source: "open-meteo",
  };
}

async function weatherPart(p: LatLng): Promise<WeatherPart> {
  if (mapsConfigured()) {
    try {
      return await googleWeather(p);
    } catch {
      // quota, error or no data -> Open-Meteo
    }
  }
  return openMeteoWeather(p);
}

async function airPart(p: LatLng): Promise<{ air: AirOut; source: "google" | "open-meteo" }> {
  if (mapsConfigured()) {
    try {
      const a = await airQualityNow(p.lat, p.lng, BG);
      const aqi = Math.round(a.usAqi);
      return {
        air: {
          aqi,
          category: aqiCategory(aqi),
          pm25: a.pm2_5,
          pm10: a.pm10,
          dominant: a.dominant,
          scale: "US_AQI",
        },
        source: "google",
      };
    } catch {
      // -> Open-Meteo
    }
  }
  const d = await getJson<{
    current?: { pm2_5?: number; pm10?: number; us_aqi?: number };
  }>(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${p.lat}&longitude=${p.lng}&current=pm2_5,pm10,us_aqi`);
  const aqi = d.current?.us_aqi;
  if (typeof aqi !== "number" || !Number.isFinite(aqi) || aqi < 0) throw new Error("No air quality data here");
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v * 10) / 10 : null);
  const rounded = Math.round(aqi);
  return {
    air: {
      aqi: rounded,
      category: aqiCategory(rounded),
      pm25: n(d.current?.pm2_5),
      pm10: n(d.current?.pm10),
      dominant: null,
      scale: "US_AQI",
    },
    source: "open-meteo",
  };
}

// ---- slow-changing parts: small per-instance memo ----------------------------------------------
// City centres and bus stops barely move, and air quality is published hourly, so they are kept
// longer than the 10-minute snapshot. That keeps one open screen to about 3 Google calls per
// 10 minutes. Failures are never memoised.
const HOUR_MS = 60 * 60 * 1000;
const CENTRE_TTL_MS = 24 * HOUR_MS;
const STOPS_TTL_MS = 24 * HOUR_MS;
const AIR_TTL_MS = HOUR_MS / 2;
const TRAFFIC_TTL_MS = 20 * 60 * 1000;
const MEMO_MAX = 500;
const memos = new Map<string, { at: number; ttl: number; value: unknown }>();

async function memo<T>(key: string, ttl: number, fn: () => Promise<T>): Promise<T> {
  const hit = memos.get(key);
  if (hit && Date.now() - hit.at < hit.ttl) return hit.value as T;
  const value = await fn();
  memos.delete(key);
  memos.set(key, { at: Date.now(), ttl, value });
  if (memos.size > MEMO_MAX) memos.delete(memos.keys().next().value!);
  return value;
}

/** The ~10 km cell a position falls in (centre searches are biased to 30 km anyway). */
const cell10 = (p: LatLng) => `${Math.round(p.lat * 10) / 10},${Math.round(p.lng * 10) / 10}`;

/** A "city centre" further than this is a wrong match (or open country): probe nearby roads instead. */
const MAX_CENTRE_KM = 40;

/** Traffic plus the probe destination (for the Directions link), with `towards` in the person's language. */
type TrafficOut = AmbientTraffic & { dest: LatLng };

async function trafficPart(p: LatLng, city: string | null, lang: Lang): Promise<{ traffic: TrafficOut | null; city: string | null }> {
  // The centre (and the town's name in the person's language) is looked up once a day per cell.
  const found = await memo(`centre:${cell10(p)}:${city ?? ""}:${lang}`, CENTRE_TTL_MS, () => cityCentre(p, city, lang, BG));
  const centre = found && haversineKm(p, found) <= MAX_CENTRE_KM ? found : null;
  const nearby = !centre || haversineKm(p, centre) < 1.5;
  const dest = nearby ? eastOf(p, 4) : { lat: centre.lat, lng: centre.lng };
  // The probe itself is language-neutral and the costly part: memoised per position.
  const t = await memo(`traffic:${p.lat},${p.lng}`, TRAFFIC_TTL_MS, () => drivingTraffic(p, dest, BG));
  const name = centre?.city ?? city;
  if (!t) return { traffic: null, city: name };
  const ratio = Math.round((t.durationS / t.staticS) * 100) / 100;
  return {
    traffic: {
      level: trafficLevel(ratio),
      delayMin: Math.max(0, Math.round((t.durationS - t.staticS) / 60)),
      ratio,
      towards: (TOWARDS[lang] ?? TOWARDS.en)[nearby ? "nearby" : "centre"],
      dest,
    },
    city: name,
  };
}

const WALK_M_PER_MIN = 80;

async function stopsPart(p: LatLng, lang: Lang): Promise<AmbientStop[]> {
  const stops = await memo(`stops:${p.lat},${p.lng}:${lang}`, STOPS_TTL_MS, () => nearbyTransitStops(p, lang, BG));
  return stops
    .map((s) => {
      const distanceM = Math.round(haversineKm(p, s) * 1000);
      return {
        name: s.name.slice(0, 80),
        distanceM,
        walkMin: Math.max(1, Math.ceil(distanceM / WALK_M_PER_MIN)),
        mapsUrl: s.mapsUrl,
      };
    })
    .sort((a, b) => a.distanceM - b.distanceM);
}

// ---- Erdenet sample timetable -------------------------------------------------------------------
// The only timetable the app ships is a sample for the hackathon city; everywhere else stops come
// without arrivals and the UI says so.
const TIMETABLE_CITY: LatLng = { lat: 49.03, lng: 104.08 };
const TIMETABLE_NAMES = /erdenet|эрдэнэт|额尔登特/i;
const hasTimetable = (p: LatLng, city: string | null) => (city !== null && TIMETABLE_NAMES.test(city)) || haversineKm(p, TIMETABLE_CITY) <= 20;

/**
 * The 1-2 nearest sample-timetable stops with their next arrivals, for when Google returned no
 * matching stop (or there is no Maps key at all), so bus times still show in the demo city.
 */
function timetableStops(p: LatLng, now: Date, lang: Lang): AmbientStop[] {
  try {
    const nowMin = localMinutes(now);
    return allStops()
      .filter((s) => typeof s.lat === "number" && typeof s.lng === "number")
      .map((s) => {
        const at = { lat: s.lat as number, lng: s.lng as number };
        const distanceM = Math.round(haversineKm(p, at) * 1000);
        return { s, at, distanceM };
      })
      .filter((x) => x.distanceM <= 3000)
      .sort((a, b) => a.distanceM - b.distanceM)
      .slice(0, 2)
      .map(({ s, at, distanceM }): AmbientStop => {
        const r = nextArrivals(s.id, nowMin, { limit: 1 });
        const lines = "error" in r ? [] : r.arrivals.slice(0, 4).map((a) => ({ route: a.route, minutes: a.minutes }));
        return {
          name: s.names[lang] ?? s.names.en ?? s.id,
          distanceM,
          walkMin: Math.max(1, Math.ceil(distanceM / WALK_M_PER_MIN)),
          mapsUrl: `https://www.google.com/maps/search/?api=1&query=${at.lat},${at.lng}`,
          ...(lines.length ? { lines } : {}),
        };
      });
  } catch {
    return [];
  }
}

/** Next arrivals from the sample timetable for stops whose name matches a timetable stop. */
function withTimetable(stops: AmbientStop[], now: Date): AmbientStop[] {
  try {
    const nowMin = localMinutes(now);
    return stops.map((s) => {
      const stop = findStop(s.name);
      if (!stop) return s;
      const r = nextArrivals(stop.id, nowMin, { limit: 1 });
      if ("error" in r || !r.arrivals.length) return s;
      return {
        ...s,
        lines: r.arrivals.slice(0, 4).map((a) => ({ route: a.route, minutes: a.minutes })),
      };
    });
  } catch {
    return stops;
  }
}

// ---- snapshot + cache ----------------------------------------------------------------------------
/** The language-neutral part of a snapshot, cached per rounded position. */
interface World {
  at: number;
  /** How long this snapshot may be served: short when the weather could not be fetched. */
  ttl: number;
  weather: WeatherPart | null;
  air: AirOut | null;
  airSource: "google" | "open-meteo" | null;
}

const TTL_MS = 10 * 60 * 1000;
/** A failed fetch (network blip, quota) is retried after a minute, not after ten. */
const FAILED_TTL_MS = 60 * 1000;
const MAX_ENTRIES = 500;
const cache = new Map<string, World>();
const inflight = new Map<string, Promise<World>>();

/** Tests only. */
export function resetAmbientCache(): void {
  cache.clear();
  inflight.clear();
  memos.clear();
}

async function fetchWorld(p: LatLng): Promise<World> {
  const [w, a] = await Promise.allSettled([weatherPart(p), memo(`air:${p.lat},${p.lng}`, AIR_TTL_MS, () => airPart(p))]);
  const weather = w.status === "fulfilled" ? w.value : null;
  return {
    at: Date.now(),
    ttl: weather ? TTL_MS : FAILED_TTL_MS,
    weather,
    air: a.status === "fulfilled" ? a.value.air : null,
    airSource: a.status === "fulfilled" ? a.value.source : null,
  };
}

async function worldFor(p: LatLng): Promise<World> {
  const key = `${p.lat},${p.lng}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < hit.ttl) return hit;
  const pending = inflight.get(key);
  if (pending) return pending;
  const job = fetchWorld(p)
    .then((world) => {
      cache.delete(key);
      cache.set(key, world);
      if (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value!);
      return world;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, job);
  return job;
}

/** Traffic, the town name and stops in the person's language (all memoised; failures are not). */
async function localFor(
  p: LatLng,
  city: string | null,
  lang: Lang,
): Promise<{
  traffic: TrafficOut | null;
  city: string | null;
  stops: AmbientStop[];
}> {
  if (!mapsConfigured()) return { traffic: null, city, stops: [] };
  const [t, s] = await Promise.allSettled([trafficPart(p, city, lang), stopsPart(p, lang)]);
  return {
    traffic: t.status === "fulfilled" ? t.value.traffic : null,
    city: t.status === "fulfilled" ? t.value.city : city,
    stops: s.status === "fulfilled" ? s.value : [],
  };
}

export function hourIn(timeZone: string | null, now: Date): number | null {
  if (!timeZone) return null;
  try {
    const h = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .find((x) => x.type === "hour")?.value;
    const n = Number(h);
    return Number.isInteger(n) && n >= 0 && n <= 23 ? n : null;
  } catch {
    return null;
  }
}

/** "Erdenet" + "MN" -> "Erdenet, Mongolia" (the country in the person's language). */
export function placeName(city: string | null, country: string | null, lang: Lang): string | null {
  if (!city) return null;
  if (!country || !/^[A-Z]{2}$/.test(country)) return city;
  try {
    const name = new Intl.DisplayNames([lang, "en"], {
      type: "region",
      fallback: "none",
    }).of(country);
    return name && name !== country && !city.includes(name) ? `${city}, ${name}` : city;
  } catch {
    return city;
  }
}

function withoutDest(t: TrafficOut): AmbientTraffic {
  const { dest: _dest, ...rest } = t;
  void _dest;
  return rest;
}

/** No weather behind it: `known: false` tells the client this sky is a placeholder, not a claim. */
const clearSky = (isDay: boolean): SkyOut & { known: false } => ({
  kind: "clear",
  intensity: 0,
  isDay,
  windKph: null,
  cloudCover: null,
  windDirDeg: null,
  known: false,
});

/** The live snapshot for a located person. Never throws: every part is optional. */
export async function getAmbient(loc: Located, lang: Lang, now: Date = new Date()): Promise<Ambient> {
  if (!loc.coords) {
    const localHour = hourIn(loc.timeZone, now);
    return {
      place: null,
      coords: null,
      locatedBy: null,
      sky: clearSky(daylight(localHour ?? now.getUTCHours())),
      weather: null,
      air: null,
      traffic: null,
      stops: [],
      timeZone: loc.timeZone,
      localHour,
      source: { weather: null, air: null },
      updatedAt: now.toISOString(),
    };
  }
  const p = loc.coords;
  const [world, local] = await Promise.all([worldFor(p), localFor(p, loc.city, lang)]);
  const timeZone = world.weather?.timeZone ?? loc.timeZone;
  const localHour = hourIn(timeZone, now);
  // Google's locality is in the person's language; the network city header is in English.
  const city = local.city ?? loc.city ?? null;
  const sky: SkyOut = world.weather?.sky ?? clearSky(daylight(localHour ?? now.getUTCHours()));
  let stops = hasTimetable(p, city) ? withTimetable(local.stops, now) : local.stops;
  // Demo city: when Google found no stop that matches the sample timetable (or there is no Maps
  // key), add the nearest timetable stops so bus times still show.
  if (hasTimetable(p, city) && !stops.some((s) => s.lines?.length)) {
    const extra = timetableStops(p, now, lang).filter((t) => !stops.some((s) => s.name === t.name));
    stops = [...stops, ...extra].sort((a, b) => a.distanceM - b.distanceM);
  }
  return {
    place: placeName(city, loc.country, lang),
    // Only a position the person shared goes back to the browser; an IP-derived one stays here.
    coords: loc.locatedBy === "device" ? { lat: p.lat, lng: p.lng } : null,
    locatedBy: loc.locatedBy,
    sky,
    weather: world.weather ? localiseWeather(world.weather, lang) : null,
    air: world.air,
    // The probe destination near an IP-derived position would hint at it: device positions only.
    traffic: local.traffic ? (loc.locatedBy === "device" ? local.traffic : withoutDest(local.traffic)) : null,
    stops,
    timeZone,
    localHour,
    source: { weather: world.weather?.source ?? null, air: world.airSource },
    updatedAt: new Date(world.at).toISOString(),
  };
}
