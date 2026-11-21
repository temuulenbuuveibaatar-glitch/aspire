// Server side of the live "world around you" snapshot (GET /api/ambient): sky, weather, air,
// traffic, stops, taxis (map only), the next bus and a photo of the place, for any city. Every source
// is optional and fetched in parallel; Google first (key only in a header, via lib/maps.ts),
// Open-Meteo as the free fallback, in Erdenet the city's live bus feed (Орхон ТКХДТ), and where
// Google has no stops or bus, Transitous (open data, worldwide; lib/transitous.ts, 30 s), and where
// nothing has departures, the bare stops from OpenStreetMap (lib/osm-stops.ts; no times, a day).
// The precise position (4 decimals, from the device) is used for this answer only and never
// stored: caches are keyed by a coarse cell (2 decimals, about 1 km), only that cell goes to
// Google and Open-Meteo, and distances are measured from the precise point. Numbers are fetched
// once per cell and only the words are localised per request. Current conditions 10 minutes,
// forecast 3 hours, air 30 minutes, traffic 20 minutes, next bus 10 minutes; stops, taxis, the
// city centre, a typed city and the photo for a day.
import type { Ambient, AmbientAir, AmbientHour, AmbientSource, AmbientNextBus, AmbientPhoto, AmbientSky, AmbientStop, AmbientTaxi, AmbientTraffic, AmbientWeather, SkyKind, TrafficLevel } from "@/lib/ambient-types";
import { aqiCategory } from "@/lib/ambient-types";
import { arrivals, isErdenet, nearestStations } from "@/lib/erdenet-transit";
import type { Lang } from "@/lib/lang";
import { UA } from "@/lib/site";
import { streetAddress } from "@/lib/address";
import {
  airQualityNow,
  cityCentre,
  drivingTraffic,
  geocode,
  googleHourly,
  haversineKm,
  type LatLng,
  mapsConfigured,
  nearbyTaxis,
  nearbyTransitStops,
  openMeteoHourly,
  reverseLocality,
  transitOptions,
  weatherCurrent,
  weatherDays,
} from "@/lib/maps";
import { hourIn, validTimeZone } from "@/lib/tools/time";
import { nearbyStops, resetOsmStops } from "@/lib/osm-stops";
import { departuresNear } from "@/lib/transitous";
import { type AirDetail, airDetail } from "@/lib/tools/air";
import { openMeteoGeocode } from "@/lib/tools/world";

// ---- location ---------------------------------------------------------------------------------
export interface Located {
  /** Device: 4 decimals (about 11 m). City: the geocoded city. Network: 2 decimals. */
  coords: LatLng | null;
  locatedBy: "device" | "city" | "network" | null;
  /** The town to name and search for: the typed city, or the network (Vercel IP) city. */
  city: string | null;
  /** A typed city's English name from the geocoder (the city photo is searched by it). */
  english?: string | null;
  /** That city's country in English, from the geocoder ("Mongolia": the photo search names it). */
  englishCountry?: string | null;
  country: string | null;
  timeZone: string | null;
}

const round = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;
/** The coarse cell every cache is keyed by (2 decimals, about 1 km). */
const coarse = (p: LatLng): LatLng => ({ lat: round(p.lat, 2), lng: round(p.lng, 2) });

function coord(v: string | null | undefined, max: number): number | null {
  const s = (v ?? "").trim();
  if (!s || s.length > 24 || !/^-?\d{1,3}(?:\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) && Math.abs(n) <= max ? n : null;
}

function pair(lat: string | null | undefined, lng: string | null | undefined, decimals: number): LatLng | null {
  const a = coord(lat, 90);
  const b = coord(lng, 180);
  return a === null || b === null ? null : { lat: round(a, decimals), lng: round(b, decimals) };
}

/** A city the person typed: letters (any script), digits, spaces and . , ' ( ) - only; 80 chars. */
export function cityParam(v: string | null | undefined): string | null {
  const s = (v ?? "").trim().replace(/\s+/g, " ");
  return s.length <= 80 && /\p{L}/u.test(s) && /^[\p{L}\p{M}\p{N} .,'()-]+$/u.test(s) ? s : null;
}

function headerText(v: string | null, max: number): string | null {
  if (!v) return null;
  let s = v;
  try {
    s = decodeURIComponent(v);
  } catch {
    // keep as sent
  }
  s = s.replace(/[\u0000-\u001f\u007f<>]/g, "").trim().slice(0, max);
  return s || null;
}

/**
 * Where the person is: the device's lat/lng (opt-in, 4 decimals) -> the city they set (`city=`,
 * geocoded once a day) -> Vercel's IP geolocation headers (approximate, 2 decimals) -> nothing.
 */
export async function locate(params: URLSearchParams, headers: Headers): Promise<Located> {
  const city = headerText(headers.get("x-vercel-ip-city"), 80);
  const country = headerText(headers.get("x-vercel-ip-country"), 8);
  const timeZone = validTimeZone(headers.get("x-vercel-ip-timezone"));
  const network = pair(headers.get("x-vercel-ip-latitude"), headers.get("x-vercel-ip-longitude"), 2);
  const device = pair(params.get("lat"), params.get("lng"), 4);
  if (device) {
    // The network city/time zone only describe the device position when they are close.
    const near = network !== null && haversineKm(device, network) <= 50;
    return { coords: device, locatedBy: "device", city: near ? city : null, country: near ? country : null, timeZone: near ? timeZone : null };
  }
  const typed = cityParam(params.get("city"));
  if (typed) {
    // Google first; without a key, over quota or on error, Open-Meteo (free): a typed city is never ignored.
    const find = async () => (mapsConfigured() ? await geocode(typed, "en", BG).catch(() => openMeteoGeocode(typed)) : openMeteoGeocode(typed));
    const [g, gn] = await Promise.all([
      memo(`geo:${typed.toLowerCase()}`, DAY_MS, find).catch(() => null),
      memoDay(`geonames:${typed.toLowerCase()}`, () => geoNames(typed), (v) => !v, null),
    ]);
    // GeoNames knows the city's country and time zone: used when both name the same place (40 km).
    // Google's point is the precise one, unless it is over 3 km from the city's own point: then it
    // is the middle of a whole region ("Singapore", "Tokyo") and GeoNames' centre is used.
    const same = g && gn && haversineKm(g, gn) <= 40 ? gn : null;
    const at = g && same && haversineKm(g, same) > 3 ? same : g;
    // The typed text stays the label; the geocoder's English name and country (asked in English,
    // "Darkhan, Mongolia") find the photo.
    const parts = (g?.name ?? "").split(",").map((s) => s.replace(/\b\d[\d-]*\b/g, " ").replace(/\s+/g, " ").trim());
    const english = parts[0] || null;
    const englishCountry = parts.length > 1 ? parts[parts.length - 1] || null : null;
    if (at) return { coords: { lat: round(at.lat, 4), lng: round(at.lng, 4) }, locatedBy: "city", city: typed, country: same?.country ?? null, timeZone: same?.timeZone ?? null, ...(english ? { english } : {}), ...(englishCountry ? { englishCountry } : {}) };
  }
  if (network) return { coords: network, locatedBy: "network", city, country, timeZone };
  return { coords: null, locatedBy: null, city: null, country: null, timeZone };
}

/** A city by name from GeoNames (Open-Meteo's free geocoder): its centre point, ISO country and time zone. */
async function geoNames(name: string): Promise<(LatLng & { country: string | null; timeZone: string | null }) | null> {
  const d = await getJson<{ results?: Array<Record<string, unknown>> }>(`https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&name=${encodeURIComponent(name)}`);
  const r = d.results?.[0] ?? {};
  const lat = finite(r.latitude), lng = finite(r.longitude);
  if (lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  const cc = typeof r.country_code === "string" && /^[A-Z]{2}$/.test(r.country_code) ? r.country_code : null;
  return { lat, lng, country: cc, timeZone: validTimeZone(r.timezone) };
}

// ---- condition mapping ------------------------------------------------------------------------
export interface SkyState {
  kind: SkyKind;
  intensity: number;
}

/** [kind, intensity, "KEY KEY ..."] rows -> { KEY: { kind, intensity } }. */
const table = (rows: [SkyKind, number, string][]): Record<string, SkyState> =>
  Object.fromEntries(rows.flatMap(([kind, intensity, keys]) => keys.split(" ").map((k) => [k, { kind, intensity }])));

const GOOGLE_SKY = table([
  ["clear", 0, "CLEAR VERY_HOT"],
  ["partly", 0.25, "MOSTLY_CLEAR"],
  ["partly", 0.5, "PARTLY_CLOUDY"],
  ["cloudy", 0.75, "MOSTLY_CLOUDY"],
  ["cloudy", 1, "CLOUDY"],
  ["fog", 0.7, "FOG"],
  ["fog", 0.4, "HAZE"],
  ["drizzle", 0.3, "CHANCE_OF_SHOWERS"],
  ["rain", 0.35, "LIGHT_RAIN_SHOWERS LIGHT_RAIN"],
  ["rain", 0.4, "SCATTERED_SHOWERS"],
  ["rain", 0.45, "LIGHT_TO_MODERATE_RAIN"],
  ["rain", 0.6, "RAIN_SHOWERS RAIN"],
  ["rain", 0.7, "WIND_AND_RAIN"],
  ["rain", 0.75, "MODERATE_TO_HEAVY_RAIN RAIN_PERIODICALLY_HEAVY"],
  ["rain", 0.9, "HEAVY_RAIN_SHOWERS HEAVY_RAIN"],
  ["rain", 1, "HEAVY_RAIN_TO_RAINSTORM"],
  ["snow", 0.25, "CHANCE_OF_SNOW_SHOWERS"],
  ["snow", 0.35, "LIGHT_SNOW_SHOWERS LIGHT_SNOW"],
  ["snow", 0.4, "SCATTERED_SNOW_SHOWERS"],
  ["snow", 0.45, "LIGHT_TO_MODERATE_SNOW"],
  ["snow", 0.6, "SNOW_SHOWERS SNOW"],
  ["snow", 0.75, "MODERATE_TO_HEAVY_SNOW SNOW_PERIODICALLY_HEAVY"],
  ["snow", 0.8, "BLOWING_SNOW"],
  ["snow", 0.9, "HEAVY_SNOW_SHOWERS HEAVY_SNOW"],
  ["snow", 1, "SNOWSTORM HEAVY_SNOW_STORM"],
  ["sleet", 0.6, "RAIN_AND_SNOW SLEET"],
  ["hail", 0.6, "HAIL_SHOWERS"],
  ["hail", 0.7, "HAIL"],
  ["storm", 0.5, "LIGHT_THUNDERSTORM_RAIN"],
  ["storm", 0.6, "SCATTERED_THUNDERSTORMS"],
  ["storm", 0.7, "THUNDERSHOWER"],
  ["storm", 0.8, "THUNDERSTORM"],
  ["storm", 1, "HEAVY_THUNDERSTORM"],
]);

/** Open-Meteo WMO weather_code table. */
const WMO_SKY = table([
  ["clear", 0, "0"],
  ["partly", 0.25, "1"],
  ["partly", 0.5, "2"],
  ["cloudy", 1, "3"],
  ["fog", 0.6, "45"],
  ["fog", 0.8, "48"],
  ["drizzle", 0.25, "51"],
  ["drizzle", 0.4, "53"],
  ["drizzle", 0.6, "55"],
  ["sleet", 0.35, "56"],
  ["sleet", 0.5, "66"],
  ["sleet", 0.6, "57"],
  ["sleet", 0.8, "67"],
  ["rain", 0.35, "61"],
  ["rain", 0.4, "80"],
  ["rain", 0.6, "63 81"],
  ["rain", 0.9, "65"],
  ["rain", 1, "82"],
  ["snow", 0.3, "77"],
  ["snow", 0.35, "71"],
  ["snow", 0.5, "85"],
  ["snow", 0.6, "73"],
  ["snow", 0.9, "75 86"],
  ["storm", 0.8, "95"],
  ["storm", 0.9, "96"],
  ["hail", 0.9, "99"],
]);

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const DRY = new Set<SkyKind>(["clear", "partly", "cloudy"]);

/** Clear / partly / cloudy from a 0..100 cloud cover. */
function fromClouds(cloudCover: number | null): SkyState {
  if (cloudCover === null) return { kind: "partly", intensity: 0.4 };
  const c = clamp01(cloudCover / 100);
  return { kind: c < 0.2 ? "clear" : c < 0.7 ? "partly" : "cloudy", intensity: round(c, 2) };
}

/** A dry kind takes its intensity from the cloud cover when it is known. */
const refine = (s: SkyState, cloudCover: number | null): SkyState =>
  DRY.has(s.kind) && cloudCover !== null ? { kind: s.kind, intensity: round(clamp01(cloudCover / 100), 2) } : s;

/**
 * Google WeatherCondition.Type -> sky kind + intensity. The many compound forecast types
 * ("CLOUDY_WITH_PERIODIC_RAIN", "SNOW_LATER_CLEAR"...) are read by their leading part.
 */
export function googleSky(type: string | null | undefined, cloudCover: number | null = null): SkyState {
  const t = (type ?? "").toUpperCase();
  if (t === "WINDY" || t === "" || t === "TYPE_UNSPECIFIED") return fromClouds(cloudCover);
  if (GOOGLE_SKY[t]) return refine(GOOGLE_SKY[t], cloudCover);
  // What happens now comes first: "RAIN_LATER_BECOMING_CLEAR" -> "RAIN".
  const head = t.split(/_(?:BUT|LATER|AFTER|FROM|TURNING|BECOMING|IN_THE|ALONG)(?:_|$)/)[0];
  const brief = /BRIEF|PERIODIC|THAT_PERIODICALLY_STOPS|MIX/.test(head);
  const level = brief ? 0.35 : 0.6;
  if (/THUNDER|LIGHTNING/.test(head)) return { kind: "storm", intensity: brief ? 0.5 : 0.8 };
  if (/HAIL/.test(head)) return { kind: "hail", intensity: 0.6 };
  if (/SLEET|RAINSNOW|SNOWRAIN/.test(head) || (/RAIN/.test(head) && /SNOW/.test(head))) return { kind: "sleet", intensity: level };
  if (/SNOW/.test(head)) return { kind: "snow", intensity: level };
  if (/RAIN|SHOWER/.test(head)) return { kind: "rain", intensity: level };
  if (/FOG|HAZE|MIST/.test(head)) return { kind: "fog", intensity: 0.6 };
  if (/CLOUDY/.test(head)) return { kind: "cloudy", intensity: cloudCover !== null ? clamp01(cloudCover / 100) : 0.8 };
  if (/CLEAR|SUNNY|HOT/.test(head)) return { kind: "clear", intensity: 0 };
  return fromClouds(cloudCover);
}

/** Open-Meteo WMO weather_code -> sky kind + intensity. */
export function wmoSky(code: number | null | undefined, cloudCover: number | null = null): SkyState {
  const s = typeof code === "number" ? WMO_SKY[code] : undefined;
  return s ? refine(s, cloudCover) : fromClouds(cloudCover);
}

// ---- localized words (no emojis) ---------------------------------------------------------------
type Words = Record<SkyKind | "lightRain" | "heavyRain" | "lightSnow" | "heavySnow", string>;

const SKY_TEXT: Record<Lang, Words> = {
  mn: {
    clear: "Цэлмэг", partly: "Багавтар үүлтэй", cloudy: "Үүлэрхэг", fog: "Манантай", drizzle: "Шиврээ бороо", rain: "Бороотой",
    storm: "Аянга цахилгаантай", snow: "Цастай", sleet: "Нойтон цас", hail: "Мөндөртэй",
    lightRain: "Бага зэргийн бороо", heavyRain: "Хүчтэй бороо", lightSnow: "Бага зэргийн цас", heavySnow: "Их цас",
  },
  zh: {
    clear: "晴", partly: "局部多云", cloudy: "多云", fog: "雾", drizzle: "毛毛雨", rain: "雨", storm: "雷暴", snow: "雪", sleet: "雨夹雪",
    hail: "冰雹", lightRain: "小雨", heavyRain: "大雨", lightSnow: "小雪", heavySnow: "大雪",
  },
  en: {
    clear: "Clear", partly: "Partly cloudy", cloudy: "Cloudy", fog: "Fog", drizzle: "Drizzle", rain: "Rain", storm: "Thunderstorm",
    snow: "Snow", sleet: "Sleet", hail: "Hail", lightRain: "Light rain", heavyRain: "Heavy rain", lightSnow: "Light snow", heavySnow: "Heavy snow",
  },
  ru: {
    clear: "Ясно", partly: "Переменная облачность", cloudy: "Облачно", fog: "Туман", drizzle: "Морось", rain: "Дождь", storm: "Гроза",
    snow: "Снег", sleet: "Мокрый снег", hail: "Град", lightRain: "Небольшой дождь", heavyRain: "Сильный дождь",
    lightSnow: "Небольшой снег", heavySnow: "Сильный снег",
  },
  de: {
    clear: "Klar", partly: "Teilweise bewölkt", cloudy: "Bewölkt", fog: "Nebel", drizzle: "Nieselregen", rain: "Regen", storm: "Gewitter",
    snow: "Schnee", sleet: "Schneeregen", hail: "Hagel", lightRain: "Leichter Regen", heavyRain: "Starker Regen",
    lightSnow: "Leichter Schnee", heavySnow: "Starker Schneefall",
  },
};

/** A short condition phrase in the person's language, e.g. "Light snow". */
export function skyText(s: SkyState, lang: Lang): string {
  const w = SKY_TEXT[lang] ?? SKY_TEXT.en;
  if (s.kind === "rain") return s.intensity < 0.4 ? w.lightRain : s.intensity >= 0.8 ? w.heavyRain : w.rain;
  if (s.kind === "snow") return s.intensity < 0.4 ? w.lightSnow : s.intensity >= 0.8 ? w.heavySnow : w.snow;
  return w[s.kind];
}

// ---- traffic ------------------------------------------------------------------------------------
export function trafficLevel(ratio: number): TrafficLevel {
  return ratio < 1.15 ? "light" : ratio < 1.4 ? "moderate" : "heavy";
}

/** A point `km` east of `p` (used when the person is already in the centre). */
function eastOf(p: LatLng, km: number): LatLng {
  const cos = Math.max(0.2, Math.cos((p.lat * Math.PI) / 180));
  return { lat: p.lat, lng: round(p.lng + km / (111.32 * cos), 4) };
}

// ---- weather and air --------------------------------------------------------------------------
const UA_HEADERS = { "User-Agent": UA };
/** Every Google call made here is a background call: it never eats the quota kept for questions. */
const BG = { background: true } as const;

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { redirect: "error", headers: UA_HEADERS, signal: AbortSignal.timeout(8_000) });
  if (!res.ok) throw new Error(`${new URL(url).host} returned ${res.status}`);
  return (await res.json()) as T;
}

/** 0..23 in a known zone, else null. */
const hourAt = (timeZone: string | null, now: Date): number | null => (timeZone ? hourIn(now, timeZone) : null);
const daylight = (hour: number) => hour >= 6 && hour < 18;
/** Day or night from the place's clock when the provider does not say. */
const isDayAt = (timeZone: string | null, now: Date) => daylight(hourAt(timeZone, now) ?? now.getUTCHours());
const finite = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const isDate = (d: unknown): d is string => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d);

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
  source: "google" | "open-meteo";
  /** When the provider was asked (ms). */
  at: number;
  sky: AmbientSky;
  state: SkyState;
  tempC: number;
  feelsC: number;
  textEn: string;
  days: RawDay[];
  /** Language-neutral; empty when unknown. */
  hourly: AmbientHour[];
  /** Who gave the hourly strip (Google's strip falls back to Open-Meteo). */
  hourlySource: AmbientSource;
  timeZone: string | null;
}

/** The person's words for a language-neutral snapshot. Google's own text only for English. */
function localiseWeather(w: WeatherPart, lang: Lang): AmbientWeather {
  const words = (state: SkyState, en: string) => (lang === "en" && en.trim() ? en.trim().slice(0, 80) : skyText(state, lang));
  return {
    source: w.source,
    at: new Date(w.at).toISOString(),
    tempC: w.tempC,
    feelsC: w.feelsC,
    text: words(w.state, w.textEn),
    days: w.days.map((d) => ({ date: d.date, minC: d.minC, maxC: d.maxC, text: words(d.state, d.textEn), kind: d.state.kind, precipChance: d.precipChance })),
    ...(w.hourly.length ? { hourly: w.hourly, hourlySource: w.hourlySource } : {}),
  };
}

/** The hero's hourly strip: Open-Meteo (free); never fails the weather part. */
const openMeteoHours = (p: LatLng): Promise<AmbientHour[]> =>
  openMeteoHourly(p.lat, p.lng)
    .then((hs) => hs.map((h) => ({ time: h.time, tempC: h.tempC, kind: wmoSky(h.code).kind, precipChance: h.precipChance })))
    .catch(() => []);

async function googleWeather(p: LatLng): Promise<WeatherPart> {
  // Current conditions every snapshot; the 3-day forecast changes slowly, so it is memoised per
  // ~10 km cell for 3 hours. Both are asked in English and localised per request.
  // The hourly strip is memoised per ~10 km cell for an hour (the client drops hours that have ended);
  // Google with no hours falls back to Open-Meteo for the strip only.
  const [w, rawDays, strip] = await Promise.all([
    weatherCurrent(p.lat, p.lng, "en", BG),
    memo(`days:${cell10(p)}`, 3 * HOUR_MS, () => weatherDays(p.lat, p.lng, "en", BG)).catch(() => []),
    memo(`hours:${cell10(p)}`, HOUR_MS, () => googleHourly(p.lat, p.lng, BG))
      .then((hs) => hs.map((h): AmbientHour => ({ time: h.time, tempC: h.tempC, kind: googleSky(h.type, null).kind, precipChance: h.precipChance })))
      .catch((): AmbientHour[] => [])
      .then(async (hs) => (hs.length ? { hours: hs, source: "google" as const } : { hours: await openMeteoHours(p), source: "open-meteo" as const })),
  ]);
  const s = googleSky(w.type, w.cloudCover);
  const timeZone = validTimeZone(w.timeZone);
  const days = rawDays.flatMap((d): RawDay[] =>
    d.minC === null || d.maxC === null || !isDate(d.date)
      ? []
      : [{ date: d.date, minC: d.minC, maxC: d.maxC, state: googleSky(d.type, null), textEn: d.text, precipChance: d.precipChance }],
  );
  return {
    source: "google",
    at: Date.now(),
    sky: { kind: s.kind, intensity: s.intensity, isDay: w.isDaytime ?? isDayAt(timeZone, new Date()), windKph: w.windKph, cloudCover: w.cloudCover },
    state: s,
    tempC: w.tempC,
    feelsC: w.feelsC,
    textEn: w.text,
    days,
    hourly: strip.hours,
    hourlySource: strip.source,
    timeZone,
  };
}

async function openMeteoWeather(p: LatLng): Promise<WeatherPart> {
  const hourly = openMeteoHours(p);
  const d = await getJson<{
    timezone?: string;
    current?: Record<string, number>;
    daily?: Partial<Record<"time" | "temperature_2m_max" | "temperature_2m_min" | "weather_code" | "precipitation_probability_max", unknown[]>>;
  }>(
    `https://api.open-meteo.com/v1/forecast?latitude=${p.lat}&longitude=${p.lng}` +
      "&current=temperature_2m,apparent_temperature,weather_code,is_day,cloud_cover,wind_speed_10m" +
      "&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max&timezone=auto&forecast_days=3",
  );
  const c = d.current ?? {};
  const tempC = finite(c.temperature_2m);
  if (tempC === null) throw new Error("No weather data here");
  const cloud = finite(c.cloud_cover);
  const s = wmoSky(finite(c.weather_code), cloud);
  const timeZone = validTimeZone(d.timezone);
  const daily = d.daily ?? {};
  const days = (daily.time ?? []).slice(0, 3).flatMap((date, i): RawDay[] => {
    const minC = finite(daily.temperature_2m_min?.[i]);
    const maxC = finite(daily.temperature_2m_max?.[i]);
    if (minC === null || maxC === null || !isDate(date)) return [];
    return [{ date, minC, maxC, state: wmoSky(finite(daily.weather_code?.[i])), textEn: "", precipChance: finite(daily.precipitation_probability_max?.[i]) }];
  });
  return {
    source: "open-meteo",
    at: Date.now(),
    sky: {
      kind: s.kind,
      intensity: s.intensity,
      isDay: c.is_day === 1 ? true : c.is_day === 0 ? false : isDayAt(timeZone, new Date()),
      windKph: finite(c.wind_speed_10m),
      cloudCover: cloud,
    },
    state: s,
    tempC,
    feelsC: finite(c.apparent_temperature) ?? tempC,
    textEn: "",
    days,
    hourly: await hourly,
    hourlySource: "open-meteo",
    timeZone,
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

/** The air card's reading plus, when Open-Meteo has them, each pollutant, the dominant one and the next days. */
export type AmbientAirDetail = AmbientAir & Partial<Pick<AirDetail, "pollutants" | "dominant" | "forecast">>;

async function airPart(p: LatLng): Promise<AmbientAirDetail> {
  // Open-Meteo (keyless) gives the detail either way, and the reading itself without a Google key.
  const detail = airDetail(p.lat, p.lng).catch(() => null);
  const extra = (d: AirDetail | null) => (d ? { pollutants: d.pollutants, dominant: d.dominant, forecast: d.forecast } : {});
  if (mapsConfigured()) {
    try {
      const a = await airQualityNow(p.lat, p.lng, BG);
      const aqi = Math.round(a.usAqi);
      return { aqi, category: aqiCategory(aqi), pm25: a.pm2_5, source: "google", at: new Date().toISOString(), ...extra(await detail) };
    } catch {
      // -> Open-Meteo
    }
  }
  const d = await detail;
  if (!d) throw new Error("No air quality data here");
  return { aqi: d.aqi, category: aqiCategory(d.aqi), pm25: d.pollutants.pm25, source: "open-meteo", at: new Date().toISOString(), ...extra(d) };
}

// ---- slow-changing parts: small per-instance memo ----------------------------------------------
// Failures are never memoised.
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const memos = new Map<string, { at: number; ttl: number; value: unknown }>();

async function memo<T>(key: string, ttl: number, fn: () => Promise<T>): Promise<T> {
  const hit = memos.get(key);
  if (hit && Date.now() - hit.at < hit.ttl) return hit.value as T;
  const value = await fn();
  memos.delete(key);
  memos.set(key, { at: Date.now(), ttl, value });
  if (memos.size > 500) memos.delete(memos.keys().next().value!);
  return value;
}

/** The ~10 km cell a position falls in (centre searches are biased to 30 km anyway). */
const cell10 = (p: LatLng) => `${round(p.lat, 1)},${round(p.lng, 1)}`;

const stripTags = (h: string) => h.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

/** A memo for lookups that may come back empty: a hit is kept a day, a miss or a failure an hour (not retried every refresh). */
async function memoDay<T>(key: string, fn: () => Promise<T>, missed: (v: T) => boolean, onError: T): Promise<T> {
  const v = await memo(key, DAY_MS, () => fn().catch(() => onError));
  const hit = memos.get(key);
  if (hit && missed(v)) hit.ttl = HOUR_MS;
  return v;
}

/** What the city photo should show, by the hour and the weather: a night view after dark, a winter one in snow or deep cold. */
export type PhotoVariant = "night" | "winter";
const VARIANT_WORDS: Record<PhotoVariant, RegExp> = {
  night: /\b(?:night|nacht|dusk|evening|twilight|blue hour)\b/i,
  winter: /\b(?:winter|snow\w*|frost\w*)\b/i,
};
const SUMMER = /\bsummer\b/i;

/**
 * Night after dark, winter when it snows, sleets, hails or is -5 C or colder (both can hold); []
 * on a mild day; null when no weather backs the sky (then no preference either way).
 */
export function photoVariants(sky: AmbientSky | null | undefined, tempC: number | null | undefined): PhotoVariant[] | null {
  if (!sky || sky.known === false) return null;
  const winter = sky.kind === "snow" || sky.kind === "sleet" || sky.kind === "hail" || (typeof tempC === "number" && tempC <= -5);
  return [...(sky.isDay ? [] : ["night" as const]), ...(winter ? ["winter" as const] : [])];
}

// What the owner wants is the WHOLE city, seen from the ground or a hill. Never a shot from a plane
// (wing, window), never one building, monument, vehicle or nature subject, never a map, flag or logo.
const FROM_PLANE = /\b(?:air ?planes?|aeroplanes?|aircraft|planes?|wings?|windows?|flights?|in-flight|from the air|aerial|airborne|on ?board|boeing|airbus|airlines?|airways)\b/i;
const NOT_PHOTO = /\b(?:maps?|plans?|flags?|logos?|emblems?|coats? of arms|banners?|seals?|diagrams?|charts?|locator|symbols?|icons?|stamps?|posters?|postcards?)\b/i;
const ONE_THING = /\b(?:hotels?|buildings?|monuments?|memorials?|statues?|sculptures?|busts?|church(?:es)?|cathedrals?|temples?|monaster(?:y|ies)|mosques?|buddha|mines?|mining|plants?|factor(?:y|ies)|stations?|stadiums?|museums?|malls?|markets?|towers?|bridges?|gates?|parks?|squares?|airports?|hospitals?|universit(?:y|ies)|campus|schools?|offices?|theat(?:er|re)s?|palaces?|parliament|cars?|volga|gaz|bus(?:es)?|trains?|trams?|locomotives?|trucks?|vehicles?|portraits?|interiors?|exteriors?|facades?|fa[cç]ades?|entrances?|signs?|people|protests?|marathons?|festivals?|concerts?|near|outskirts|forests?|flowers?|insects?|animals?|horses?)\b/i;
/** Says it shows the city as a whole (title, description, or a category such as "Cityscapes of X"). "Panoramio" is a website. */
const WHOLE_CITY = /\b(?:skylines?|panoram(?:a|as|ic|ics)|pano|cityscapes?|townscapes?|overview|views? (?:of|from|over|on|to|across)|vista|old town|city view|general view)\b/i;
const CITYISH = /\b(?:city|town|downtown|centre|center|view|landscape)\b/i;

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A Commons file as photoScore sees it: title, description, categories and the 1920 px thumbnail's size. */
export interface PhotoCandidate {
  title: string;
  text: string;
  cats: string;
  w: number;
  h: number;
}

/**
 * How well a Commons file shows the whole city, or null when it must not be shown: from a plane, a
 * map or logo, one building, vehicle or nature subject, not about this city, or the wrong shape.
 * Higher is better: whole-city words, a panorama's shape, the city in the title, the wanted variant.
 */
export function photoScore(c: PhotoCandidate, city: string, want: PhotoVariant[] | null): number | null {
  const name = city.split(",")[0].trim();
  if (!name) return null;
  // The city name as a whole word ("Murun" must not match "Muruntau").
  const named = new RegExp(`(^|[^\\p{L}])${escapeRe(name)}([^\\p{L}]|$)`, "iu");
  const title = c.title.replace(/^File:/i, "").replace(/\.[a-z]+$/i, "");
  const all = `${title} | ${c.text} | ${c.cats}`;
  if (!/\.jpe?g$/i.test(c.title) || FROM_PLANE.test(all) || NOT_PHOTO.test(all) || ONE_THING.test(title)) return null;
  const whole = WHOLE_CITY.test(all);
  // One thing named only in the description or a category is still one thing, unless the file
  // says it is a view of the city ("Panorama from the TV tower").
  if (!whole && ONE_THING.test(`${c.text} | ${c.cats}`)) return null;
  const ratio = c.w / Math.max(1, c.h);
  if (c.w < 1200 || c.h < 400 || ratio < 1.3) return null;
  let view = WHOLE_CITY.test(title) ? 3 : whole ? 2 : 0;
  if (CITYISH.test(`${title} | ${c.text}`)) view += 1;
  if (ratio >= 2.2) view += 3;
  // "Erdenet 01", "Darkhan (2019)": a file named just for the city is usually a view of it.
  if (new RegExp(`^${escapeRe(name)}[\\s\\d()_.,-]*$`, "iu").test(title)) view += 1;
  const inTitle = named.test(title);
  // Named only in a category: only a clear view of the city counts.
  if (!view || (!inTitle && !named.test(c.text) && (!named.test(c.cats) || view < 2))) return null;
  let score = view + (inTitle ? 1 : 0);
  if (want) {
    for (const v of ["night", "winter"] as const) {
      if (VARIANT_WORDS[v].test(all)) score += want.includes(v) ? 4 : v === "night" ? -3 : -2;
    }
    if (want.includes("winter") && SUMMER.test(all)) score -= 2;
  }
  return score;
}

type Candidate = PhotoCandidate & { index: number; url: string; uri: string; artist: string; licence: string };

/** One Commons file search, memoised a day; an empty answer or a failure is kept an hour. */
async function commonsSearch(search: string, limit: number): Promise<Candidate[]> {
  type Info = { thumburl?: string; thumbwidth?: number; thumbheight?: number; descriptionurl?: string; extmetadata?: Record<string, { value?: unknown }> };
  type Page = { title?: string; index?: number; imageinfo?: Info[] };
  const q = new URLSearchParams({
    action: "query", format: "json", origin: "*", generator: "search", gsrnamespace: "6", gsrlimit: String(limit),
    gsrsearch: `${search} filetype:bitmap`, prop: "imageinfo", iiprop: "url|extmetadata", iiurlwidth: "1920",
    iiextmetadatafilter: "Artist|LicenseShortName|ImageDescription|Categories", iiextmetadatalanguage: "en",
  });
  return memoDay(`commons:${search.toLowerCase()}`, async () => {
    const data = await getJson<{ query?: { pages?: Record<string, Page> } }>(`https://commons.wikimedia.org/w/api.php?${q}`);
    return Object.values(data.query?.pages ?? {}).flatMap((pg): Candidate[] => {
      const i = pg.imageinfo?.[0];
      const url = i?.thumburl ?? "";
      if (!pg.title || !/^https:\/\/(upload|thumb)\.wikimedia\.org\//.test(url)) return [];
      const field = (k: string, max: number) => { const v = i?.extmetadata?.[k]?.value; return typeof v === "string" ? stripTags(v).slice(0, max) : ""; };
      const uri = i?.descriptionurl && /^https:\/\/commons\.wikimedia\.org\//.test(i.descriptionurl) ? i.descriptionurl : "https://commons.wikimedia.org";
      return [{
        title: pg.title, index: pg.index ?? 99, url, uri, w: i?.thumbwidth ?? 0, h: i?.thumbheight ?? 0,
        text: field("ImageDescription", 400), cats: field("Categories", 400).replace(/\|/g, " | "),
        artist: field("Artist", 40), licence: field("LicenseShortName", 30),
      }];
    });
  }, (v) => !v.length, []);
}

/**
 * A WHOLE-CITY photo (skyline, panorama, city view) from Wikimedia Commons, searched by the city's
 * English name and its country ("Darkhan Mongolia": no other Darkhan), as a 1920 px thumbnail
 * credited with author and licence. The best by photoScore wins, so a night or winter view is
 * preferred when that is what the sky shows. null when nothing fits: no photo beats a wrong one.
 * Never throws (each search is memoised: a day, or an hour when it found nothing or failed).
 */
export async function cityPhoto(city: string, want: PhotoVariant[] | null = null, country: string | null = null): Promise<AmbientPhoto | null> {
  const name = city.split(",")[0].trim();
  if (!name) return null;
  const base = [name, country?.trim()].filter(Boolean).join(" ");
  const seen = new Set<string>();
  let best = null as Candidate | null; // (assigned inside pick: keep the declared type)
  let bestScore = -Infinity;
  // In search order: a tie goes to the earlier search and the higher rank.
  const pick = (lists: Candidate[][]) => {
    for (const list of lists) {
      for (const c of [...list].sort((a, b) => a.index - b.index)) {
        if (seen.has(c.title)) continue;
        seen.add(c.title);
        const score = c.artist && c.licence ? photoScore(c, name, want) : null;
        if (score !== null && score > bestScore) [best, bestScore] = [c, score];
      }
    }
  };
  pick(await Promise.all([
    commonsSearch(base, 50),
    commonsSearch(`${base} panorama`, 20),
    commonsSearch(`${base} skyline`, 20),
    ...(want ?? []).map((v) => commonsSearch(`${base} ${v}`, 20)),
  ]));
  // Small towns: the page may not name the country (or names it differently), so one more search by
  // the name alone (photoScore still demands the name as a whole word).
  if (!best && base !== name) pick([await commonsSearch(name, 50)]);
  return best ? { url: best.url, attribution: { name: `${best.artist} / ${best.licence} (Wikimedia Commons)`, uri: best.uri } } : null;
}

const cell = (p: LatLng) => `${p.lat},${p.lng}`;

type Centre = { city: string | null } & LatLng;

/** The town's centre around a coarse cell (and its name in the person's language), once a day. */
async function centreFor(c: LatLng, city: string | null, lang: Lang): Promise<Centre | null> {
  const found = await memo(`centre:${cell10(c)}:${city ?? ""}:${lang}`, DAY_MS, () => cityCentre(c, city, lang, BG));
  // A "centre" further than 40 km is a wrong match (or open country): probe nearby roads instead.
  return found && haversineKm(c, found) <= 40 ? found : null;
}

/** The centre to head for, or null when there is none or the person is already in it. */
const awayTo = (c: LatLng, centre: Centre | null) => (centre && haversineKm(c, centre) >= 1.5 ? centre : null);

async function trafficPart(c: LatLng, centre: Centre | null): Promise<AmbientTraffic | null> {
  const target = awayTo(c, centre);
  const dest = target ? { lat: target.lat, lng: target.lng } : eastOf(c, 4);
  // The probe itself is language-neutral and the costly part: memoised per cell.
  const t = await memo(`traffic:${cell(c)}`, 20 * 60_000, async () => {
    const r = await drivingTraffic(c, dest, BG);
    return r && { ...r, at: new Date().toISOString() };
  });
  if (!t) return null;
  return {
    level: trafficLevel(round(t.durationS / t.staticS, 2)),
    delayMin: Math.max(0, Math.round((t.durationS - t.staticS) / 60)),
    at: t.at,
  };
}

const metres = (a: LatLng, b: LatLng) => Math.round(haversineKm(a, b) * 1000);

/** Google's stops around the cell, measured from the precise position. */
async function stopsPart(c: LatLng, p: LatLng, lang: Lang): Promise<AmbientStop[]> {
  const stops = await memo(`stops:${cell(c)}:${lang}`, DAY_MS, () => nearbyTransitStops(c, lang, BG));
  return stops
    .map((s) => ({ name: s.name.slice(0, 80), distanceM: metres(p, s), lat: s.lat, lng: s.lng }))
    .sort((a, b) => a.distanceM - b.distanceM);
}

async function taxisPart(c: LatLng, p: LatLng, lang: Lang): Promise<AmbientTaxi[]> {
  const taxis = await memo(`taxis:${cell(c)}:${lang}`, DAY_MS, () => nearbyTaxis(c, lang, BG));
  return taxis
    .map((t) => ({ name: t.name.slice(0, 80), phone: t.phone, distanceM: metres(p, t), lat: t.lat, lng: t.lng }))
    .filter((t) => t.distanceM <= 10_000)
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, 4);
}

/** The soonest Google transit departure from the cell towards the centre (memoised; minutes recounted). */
async function googleBus(c: LatLng, centre: Centre | null, lang: Lang, now: Date): Promise<AmbientNextBus | null> {
  const target = awayTo(c, centre);
  if (!target) return null;
  const got = await memo(`bus:${cell(c)}:${lang}`, 10 * 60_000, async () => ({
    at: now.getTime(),
    options: await transitOptions({ from: cell(c), to: cell(target), now, lang, background: true }),
  }));
  const gone = Math.floor((now.getTime() - got.at) / 60_000);
  const o = got.options.find((x) => x.waitMinutes - gone >= 0 && (x.line || x.lineName));
  if (!o) return null;
  return { line: (o.line || o.lineName).slice(0, 40), departsInMin: o.waitMinutes - gone, source: "google", kind: "scheduled", at: now.toISOString() };
}

/** Transitous: the nearest stops with their next departures, and the soonest of them (live or scheduled). */
async function transitousPart(p: LatLng, now: Date, timeZone: string | null): Promise<{ stops: AmbientStop[]; nextBus: AmbientNextBus | null }> {
  const deps = await departuresNear(p, now, { timeZone: timeZone ?? undefined });
  const byStop = new Map<string, AmbientStop>();
  for (const d of [...deps].sort((a, b) => a.distanceM - b.distanceM)) {
    const s = byStop.get(d.stop) ?? { name: d.stop, distanceM: d.distanceM, lat: d.lat, lng: d.lng, lines: [] };
    if (s.lines!.length < 4) s.lines!.push({ route: d.route, minutes: d.minutes, live: d.live });
    byStop.set(d.stop, s);
  }
  const stops = [...byStop.values()].slice(0, 10);
  // The soonest departure at the three nearest stops.
  const near = new Set(stops.slice(0, 3).map((s) => s.name));
  const soon = deps.find((d) => near.has(d.stop));
  return {
    stops,
    nextBus: soon ? { line: soon.route, departsInMin: soon.minutes, source: "transitous", kind: soon.live ? "live" : "scheduled", at: now.toISOString(), stop: soon.stop } : null,
  };
}

/**
 * A stop known only from OpenStreetMap: a position and a name, never departure times. `kind: "stop"`
 * tells the UI to say "no timetable data"; `source: "osm"` that the credit is OpenStreetMap
 * contributors (ODbL, lib/osm-stops.ts OSM_CREDIT).
 */
export type OsmAmbientStop = AmbientStop & { kind: "stop"; source: "osm" };

/** OpenStreetMap: the nearest named bus stops (only the ~1 km cell is sent; a day per cell). */
async function osmPart(p: LatLng, lang: Lang): Promise<OsmAmbientStop[]> {
  // Kept short: the whole snapshot (weather, air, photo) waits for it. A miss is not cached, so a
  // later refresh asks again (after osm-stops' short back-off).
  const stops = await nearbyStops(p, { lang, max: 10, budgetMs: 6_000 });
  return stops.map((s) => ({ name: s.name, distanceM: s.distanceM, lat: s.lat, lng: s.lng, kind: "stop", source: "osm" }));
}

/** Erdenet: the nearest stations of the city's live feed with their next buses (no Google calls). */
async function erdenetPart(p: LatLng, now: Date): Promise<{ stops: AmbientStop[]; nextBus: AmbientNextBus | null }> {
  const stations = await nearestStations(p.lat, p.lng, 6);
  // A vehicles outage still leaves the real stops, just without arrivals.
  const next = await Promise.all(stations.map((s) => arrivals(s.id).catch(() => [])));
  const stops = stations.map(
    (s, i): AmbientStop => ({
      name: s.name,
      distanceM: s.distanceM,
      lat: s.lat,
      lng: s.lng,
      ...(next[i].length ? { lines: next[i].slice(0, 4).map((a) => ({ route: a.route, minutes: a.minutes })) } : {}),
    }),
  );
  // The soonest bus at any of them (the nearest stop wins a tie).
  const soon = stations.flatMap((s, i) => next[i].slice(0, 1).map((a) => ({ ...a, stop: s.name }))).sort((x, y) => x.minutes - y.minutes)[0];
  // Arrival minutes are inferred from live positions: an estimate.
  return { stops, nextBus: soon ? { line: soon.route, departsInMin: soon.minutes, source: "erdenet-live", kind: "estimate", at: now.toISOString(), stop: soon.stop } : null };
}

// ---- snapshot + cache ----------------------------------------------------------------------------
/** The language-neutral part of a snapshot, cached per coarse cell. */
interface World {
  at: number;
  /** How long this snapshot may be served: a minute when the weather could not be fetched, else ten. */
  ttl: number;
  weather: WeatherPart | null;
  air: AmbientAir | null;
}

const cache = new Map<string, World>();
const inflight = new Map<string, Promise<World>>();

/** Tests only. */
export function resetAmbientCache(): void {
  cache.clear();
  inflight.clear();
  memos.clear();
  resetOsmStops();
}

async function fetchWorld(p: LatLng): Promise<World> {
  const [w, a] = await Promise.allSettled([weatherPart(p), memo(`air:${cell(p)}`, HOUR_MS / 2, () => airPart(p))]);
  const weather = w.status === "fulfilled" ? w.value : null;
  return {
    at: Date.now(),
    ttl: weather ? 10 * 60_000 : 60_000,
    weather,
    air: a.status === "fulfilled" ? a.value : null,
  };
}

async function worldFor(p: LatLng): Promise<World> {
  const key = cell(p);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < hit.ttl) return hit;
  const pending = inflight.get(key);
  if (pending) return pending;
  const job = fetchWorld(p)
    .then((world) => {
      cache.delete(key);
      cache.set(key, world);
      if (cache.size > 500) cache.delete(cache.keys().next().value!);
      return world;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, job);
  return job;
}

const value = <T>(r: PromiseSettledResult<T>, fallback: T): T => (r.status === "fulfilled" ? r.value : fallback);

/** Everything around the person in their language (all memoised; failures are not, and never throw). */
async function localFor(loc: Located & { coords: LatLng }, lang: Lang, now: Date, world: Promise<World>) {
  const p = loc.coords;
  const c = coarse(p);
  const google = mapsConfigured();
  // A network (IP) position can be far off: no "nearest stop" or "next bus from here" for it.
  // A typed city counts: its coords are the geocoded city centre, so stops and departures are the
  // centre's ("Berlin" shows Berlin's), while the UI never offers a walk from it.
  const precise = loc.locatedBy !== "network";
  const [centreR, taxisR, erdR] = await Promise.allSettled([
    google ? centreFor(c, loc.city, lang) : null,
    google ? taxisPart(c, p, lang) : [],
    // In Erdenet the city's own feed gives the real stops and buses.
    precise && isErdenet(p.lat, p.lng) ? erdenetPart(p, now) : null,
  ]);
  const centre = value(centreR, null);
  const city = centre?.city ?? loc.city;
  const erd = value(erdR, null);
  // Google's stops and transit elsewhere, or in Erdenet when its feed is down.
  const googleTransit = google && precise && !erd;
  const [trafficR, stopsR, busR] = await Promise.allSettled([
    google ? trafficPart(c, centre) : null,
    googleTransit ? stopsPart(c, p, lang) : [],
    googleTransit ? googleBus(c, centre, lang, now) : null,
  ]);
  const gStops = value(stopsR, []);
  const gBus = value(busR, null);
  // Where Google has no stops or bus (no key, no transit data, quota), Transitous; never for a network position.
  const open = precise && !erd && (!gStops.length || !gBus) ? await transitousPart(p, now, loc.timeZone).catch(() => null) : null;
  // Stops chain: Erdenet live feed > Google > Transitous (departures) > OpenStreetMap (stops only).
  const osm = precise && !erd && !gStops.length && !open?.stops.length ? await osmPart(p, lang).catch(() => []) : [];
  // OSM stops carry their own `source`; stopsSource stays unset for them (it names a departures source).
  const stopsSource: Ambient["stopsSource"] = erd?.stops.length ? "erdenet-live" : gStops.length ? "google" : open?.stops.length ? "transitous" : undefined;
  const [where, w] = await Promise.all([photoPlace(loc, c, lang === "en" ? (centre?.city ?? null) : null), world]);
  return {
    traffic: value(trafficR, null),
    city,
    stops: erd ? erd.stops : gStops.length ? gStops : open?.stops.length ? open.stops : osm,
    ...(stopsSource ? { stopsSource } : {}),
    // Map pins only: no "nearest taxi" readout.
    taxis: value(taxisR, []),
    // The WHOLE city only (skyline / panorama / cityscape from Commons). No landmark or hotel photos (owner).
    // A night or winter view when the sky shows one.
    photo: where ? await cityPhoto(where.name, photoVariants(w.weather?.sky, w.weather?.tempC), where.country) : null,
    nextBus: erd ? erd.nextBus : (gBus ?? open?.nextBus ?? null),
  };
}

const COMMONS_COUNTRY: Record<string, string> = { "Türkiye": "Turkey", Czechia: "Czech Republic" };

/** "MN" -> "Mongolia" (English: Commons is searched in English). */
function countryEn(iso: string | null): string | null {
  if (!iso || !/^[A-Z]{2}$/.test(iso)) return null;
  try {
    const name = new Intl.DisplayNames(["en"], { type: "region", fallback: "none" }).of(iso);
    if (!name || name === iso) return null;
    // The forms Commons uses: "Myanmar (Burma)" -> "Myanmar", "Hong Kong SAR China" -> "Hong Kong".
    return COMMONS_COUNTRY[name] ?? name.replace(/\s*\(.*\)$/, "").replace(/ SAR China$/, "");
  } catch {
    return null;
  }
}

/**
 * The English town and country around a coarse cell: Google reverse geocoding (locality), else
 * OpenStreetMap Nominatim at city zoom (10). Only the ~1 km cell is sent. A day; a miss an hour.
 */
async function placeAt(c: LatLng): Promise<{ city: string | null; country: string | null }> {
  const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 80) : null);
  return memoDay(`place:${cell(c)}`, async () => {
    const g = mapsConfigured() ? await reverseLocality(c, BG).catch(() => null) : null;
    if (g?.city && g.country) return g;
    const q = new URLSearchParams({ format: "jsonv2", lat: String(c.lat), lon: String(c.lng), zoom: "10", addressdetails: "1", "accept-language": "en" });
    const a = (await getJson<{ address?: Record<string, unknown> }>(`https://nominatim.openstreetmap.org/reverse?${q}`).catch(() => null))?.address ?? {};
    return { city: g?.city ?? text(a.city) ?? text(a.town) ?? text(a.village), country: g?.country ?? text(a.country) };
  }, (v) => !v.city, { city: null, country: null });
}

/**
 * The name and country Commons is searched by, both in English (never the typed or local text:
 * "Эрдэнэт" matches no Commons title): a typed city's from the geocoder, the network city and
 * country when they describe this position, Google's centre (English), else reverse geocoding.
 */
async function photoPlace(loc: Located, c: LatLng, centreEn: string | null): Promise<{ name: string; country: string | null } | null> {
  const name = loc.english ?? (loc.locatedBy === "city" ? null : loc.city) ?? centreEn;
  const country = loc.englishCountry ?? countryEn(loc.country);
  const at = name && country ? null : await placeAt(c);
  const found = name ?? at?.city ?? null;
  return found ? { name: found, country: country ?? at?.country ?? null } : null;
}

/** "Erdenet" + "MN" -> "Erdenet, Mongolia" (the country in the person's language). */
export function placeName(city: string | null, country: string | null, lang: Lang): string | null {
  if (!city) return null;
  if (!country || !/^[A-Z]{2}$/.test(country)) return city;
  try {
    const name = new Intl.DisplayNames([lang, "en"], { type: "region", fallback: "none" }).of(country);
    return name && name !== country && !city.includes(name) ? `${city}, ${name}` : city;
  } catch {
    return city;
  }
}

/** No weather behind it: `known: false` tells the client this sky is a placeholder, not a claim. */
const clearSky = (isDay: boolean): AmbientSky => ({ kind: "clear", intensity: 0, isDay, windKph: null, cloudCover: null, known: false });

/** The live snapshot for a located person. Never throws: every part is optional. */
export async function getAmbient(loc: Located, lang: Lang, now: Date = new Date()): Promise<Ambient> {
  if (!loc.coords) {
    const localHour = hourAt(loc.timeZone, now);
    return {
      place: null,
      coords: null,
      locatedBy: null,
      sky: clearSky(daylight(localHour ?? now.getUTCHours())),
      weather: null,
      air: null,
      traffic: null,
      stops: [],
      photo: null,
      taxis: [],
      nextBus: null,
      timeZone: loc.timeZone,
      localHour,
    };
  }
  const p = loc.coords;
  const worldP = worldFor(coarse(p));
  const [world, local, address] = await Promise.all([
    worldP,
    localFor({ ...loc, coords: p }, lang, now, worldP),
    // The exact street address only for a device position (never for an IP guess).
    loc.locatedBy === "device" ? streetAddress(p, lang) : null,
  ]);
  const timeZone = world.weather?.timeZone ?? loc.timeZone;
  const localHour = hourAt(timeZone, now);
  // An IP-derived position stays here: it never goes back to the browser.
  const approx = loc.locatedBy === "network";
  return {
    // Google's locality is in the person's language; the network city header is in English.
    place: placeName(local.city, loc.country, lang),
    country: loc.country && /^[A-Z]{2}$/.test(loc.country) ? loc.country : null,
    address,
    coords: approx ? null : { lat: p.lat, lng: p.lng },
    locatedBy: loc.locatedBy,
    sky: world.weather?.sky ?? clearSky(daylight(localHour ?? now.getUTCHours())),
    weather: world.weather ? localiseWeather(world.weather, lang) : null,
    air: world.air,
    traffic: local.traffic,
    stops: local.stops,
    ...(local.stopsSource ? { stopsSource: local.stopsSource } : {}),
    photo: local.photo,
    taxis: local.taxis,
    nextBus: local.nextBus,
    timeZone,
    localHour,
  };
}
