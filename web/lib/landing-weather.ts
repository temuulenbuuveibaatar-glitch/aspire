// The opening page's sky (components/landing): the weather and the hour where the visitor roughly
// is, so the public page looks the way the app would there right now. The page is public and
// crawled, so this is the cheap, anonymous version of lib/ambient.ts:
// - Place: only Vercel's network location headers, read by locate() (the parser the app uses).
//   No headers (local dev, another host) or unusable values: Erdenet, with `local: false`.
// - Weather: Open-Meteo only (free, no key), never Google's paid APIs. The position is rounded to
//   1 decimal (about 11 km) before the call: one request per rounded cell per 10 minutes.
// - Nothing about a visitor is kept: the cache holds readings by cell, never a place name.
// - ?sky= and ?hour= (/?sky=snow&hour=22) replace the sky or the hour, so a look can be checked
//   without waiting for that weather. The answer then says `preview: true`: never call it live.
import "server-only";
import { io } from "next/cache";
import { locate, wmoSky } from "@/lib/ambient";
import { SKY_KINDS, type SkyKind } from "@/lib/ambient-types";
import { UA } from "@/lib/site";
import { hourIn, validTimeZone } from "@/lib/tools/time";

export interface LandingWeather {
  /** The visitor's city from the network location (as Vercel names it), or "Erdenet" when unknown. */
  place: string;
  /** true: from the visitor's network location; false: the Erdenet default. */
  local: boolean;
  /** true when ?sky= or ?hour= replaced part of the real reading: it must not be called live. */
  preview: boolean;
  tempC: number;
  sky: { kind: SkyKind; intensity: number; isDay: boolean; windKph: number | null; cloudCover: number | null };
  /** 0..23 at the place. */
  localHour: number | null;
  timeZone: string | null;
  /** When Open-Meteo gave the reading (ISO). A cached reading keeps its own time. */
  at: string;
  source: "open-meteo";
}

const ERDENET = { place: "Erdenet", lat: 49.0347, lng: 104.0828, timeZone: "Asia/Ulaanbaatar" };
const TTL_MS = 10 * 60_000;
/** A failed read is not asked again for a minute: an outage or a rate limit is not hit by every visit. */
const RETRY_MS = 60_000;
const TIMEOUT_MS = 2_500;
const MAX_CELLS = 500;

interface Reading {
  at: number;
  tempC: number;
  kind: SkyKind;
  intensity: number;
  /** null when Open-Meteo does not say: then the place's clock decides. */
  isDay: boolean | null;
  windKph: number | null;
  cloudCover: number | null;
  timeZone: string | null;
}

// ponytail: per-instance memory. A shared cache ("use cache: remote") if traffic outgrows Open-Meteo's free quota.
const cache = new Map<string, { until: number; reading: Reading | null }>();
const inflight = new Map<string, Promise<Reading | null>>();

/** Tests only. */
export function resetLandingWeather(): void {
  cache.clear();
  inflight.clear();
}

const finite = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
/** One decimal, about 11 km: all Open-Meteo is told and all the cache is keyed by ("49.0", never "-0.0"). */
const oneDecimal = (v: number) => (Math.round(v * 10) / 10).toFixed(1);
/** Day or night from a clock hour when no reading says (as lib/ambient.ts does). */
const daylight = (hour: number) => hour >= 6 && hour < 18;

/** One Open-Meteo call. Throws on a timeout, a redirect, an HTTP error or an answer with no usable temperature. */
async function read(lat: string, lng: string): Promise<Reading> {
  const res = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weather_code,is_day,cloud_cover,wind_speed_10m&timezone=auto`,
    { redirect: "error", headers: { "User-Agent": UA }, signal: AbortSignal.timeout(TIMEOUT_MS) },
  );
  if (!res.ok) throw new Error(`api.open-meteo.com returned ${res.status}`);
  const d = (await res.json()) as { timezone?: unknown; current?: Record<string, unknown> | null } | null;
  const c = d?.current ?? {};
  const tempC = finite(c.temperature_2m);
  // Outside what Earth has ever measured (-89 to 57 C): not a reading.
  if (tempC === null || tempC < -95 || tempC > 65) throw new Error("No weather reading here");
  const cloud = finite(c.cloud_cover);
  const cloudCover = cloud === null ? null : Math.min(100, Math.max(0, cloud));
  const wind = finite(c.wind_speed_10m);
  const s = wmoSky(finite(c.weather_code), cloudCover);
  return {
    at: Date.now(),
    tempC,
    kind: s.kind,
    intensity: s.intensity,
    isDay: c.is_day === 1 ? true : c.is_day === 0 ? false : null,
    windKph: wind === null ? null : Math.max(0, wind),
    cloudCover,
    timeZone: validTimeZone(d?.timezone),
  };
}

/** The reading for a rounded cell: cached 10 minutes (a failure one), shared by visitors who arrive together. Never throws. */
function readingFor(lat: string, lng: string): Promise<Reading | null> {
  const key = `${lat},${lng}`;
  const hit = cache.get(key);
  if (hit && Date.now() < hit.until) return Promise.resolve(hit.reading);
  let job = inflight.get(key);
  if (!job) {
    job = read(lat, lng)
      .catch(() => null)
      .then((reading) => {
        cache.delete(key);
        cache.set(key, { until: Date.now() + (reading ? TTL_MS : RETRY_MS), reading });
        if (cache.size > MAX_CELLS) cache.delete(cache.keys().next().value!);
        return reading;
      })
      .finally(() => inflight.delete(key));
    inflight.set(key, job);
  }
  return job;
}

/** A network city worth showing: it has a letter and no leftover percent escapes (a header that would not decode). */
const cityName = (s: string | null) => (s && /\p{L}/u.test(s) && !/%[0-9a-f]{2}/i.test(s) ? s : null);

/** A repeated query parameter arrives as an array: the first value counts. */
const first = (v: unknown): unknown => (Array.isArray(v) ? v[0] : v);

/**
 * ?sky=: one of the app's sky kinds, else ignored. The same list safeKind (components/aspire/Sky.tsx)
 * checks; that file is a client module, so its functions cannot be called from the server.
 */
function previewKind(raw: unknown): SkyKind | null {
  const v = first(raw);
  const k = typeof v === "string" ? v.slice(0, 16).trim().toLowerCase() : null;
  return (SKY_KINDS as readonly unknown[]).includes(k) ? (k as SkyKind) : null;
}

/** ?hour=: a whole hour 0..23, else ignored. */
function previewHour(raw: unknown): number | null {
  const v = first(raw);
  const n = typeof v === "number" ? v : typeof v === "string" && /^\d{1,2}$/.test(v.trim()) ? Number(v) : NaN;
  return Number.isInteger(n) && n >= 0 && n <= 23 ? n : null;
}

/** A previewed sky is drawn like a moderate real one: the WMO code a reading of that kind would carry. */
const PREVIEW_CODE: Record<SkyKind, number> = { clear: 0, partly: 2, cloudy: 3, fog: 45, drizzle: 53, rain: 63, storm: 95, snow: 73, sleet: 66, hail: 99 };

/**
 * The weather for the opening page: where the visitor's network puts them, else Erdenet.
 * `override` is the page's ?sky= and ?hour= (untrusted). Never throws: null on any failure.
 */
export async function landingWeather(headers: Headers, override?: { sky?: unknown; hour?: unknown }): Promise<LandingWeather | null> {
  try {
    // Request-time work (the clock, an uncached read). io() keeps it out of every prerender of the
    // page, the per-session shell that link prefetching keeps included: Next 16 reports a clock read
    // there as an error. In a real request, and outside Next, it resolves at once.
    await io();
    // No device position and no typed city: the network location only.
    const net = await locate(new URLSearchParams(), headers);
    const city = cityName(net.city);
    const here = net.coords && city ? { place: city, ...net.coords, timeZone: net.timeZone, local: true } : { ...ERDENET, local: false };
    const r = await readingFor(oneDecimal(here.lat), oneDecimal(here.lng));
    if (!r) return null;
    const kind = previewKind(override?.sky);
    const hour = previewHour(override?.hour);
    const now = new Date();
    const timeZone = r.timeZone ?? here.timeZone;
    const localHour = hour ?? (timeZone ? hourIn(now, timeZone) : null);
    // A previewed sky has no cloud figure of its own: the kind implies it.
    const sky = kind ? { ...wmoSky(PREVIEW_CODE[kind]), cloudCover: null } : { kind: r.kind, intensity: r.intensity, cloudCover: r.cloudCover };
    return {
      place: here.place,
      local: here.local,
      preview: kind !== null || hour !== null,
      tempC: r.tempC,
      // A previewed hour sets day or night; otherwise the reading does, else the place's clock.
      sky: { ...sky, isDay: hour !== null ? daylight(hour) : (r.isDay ?? daylight(localHour ?? now.getUTCHours())), windKph: r.windKph },
      localHour,
      timeZone,
      at: new Date(r.at).toISOString(),
      source: "open-meteo",
    };
  } catch {
    return null;
  }
}
