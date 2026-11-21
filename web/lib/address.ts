// The exact street address of a device position, like ride-hailing apps show it ("Кувейтийн гудамж 6-1,
// Баян-Өндөр"). Google's reverse geocoding first; where Google only knows a plus code (much of Mongolia)
// OpenStreetMap's Nominatim gives the street and house number. Server only; cached per ~11 m for a day.
import "server-only";
import type { Lang } from "@/lib/lang";
import { UA } from "@/lib/site";

type LatLng = { lat: number; lng: number };
const DAY_MS = 24 * 3600_000;
const cache = new Map<string, { at: number; value: string | null }>();
const PLUS_CODE = /^[23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,3}\b/i;
const clean = (s: unknown, max = 120) => (typeof s === "string" ? s.replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, max) : "");

async function getJson(url: string, headers: Record<string, string>): Promise<unknown> {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(6_000) });
  if (!res.ok) throw new Error(`${new URL(url).host} returned ${res.status}`);
  return res.json();
}

/** Google Geocoding (v4) street-level address, or "" when Google only has a plus code or nothing. */
async function google(p: LatLng, lang: Lang): Promise<string> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return "";
  const q = new URLSearchParams({ "location.latitude": String(p.lat), "location.longitude": String(p.lng), languageCode: lang });
  const d = (await getJson(`https://geocode.googleapis.com/v4beta/geocode/location?${q}`, { "X-Goog-Api-Key": key })) as {
    results?: Array<{ formattedAddress?: string }>;
  };
  const first = clean(d.results?.[0]?.formattedAddress);
  return PLUS_CODE.test(first) ? "" : first;
}

/** OpenStreetMap Nominatim: "<street> <house>, <district>" (policy: UA, caching, low volume). */
async function osm(p: LatLng, lang: Lang): Promise<string> {
  const q = new URLSearchParams({ format: "jsonv2", lat: String(p.lat), lon: String(p.lng), zoom: "18", addressdetails: "1", "accept-language": lang });
  const d = (await getJson(`https://nominatim.openstreetmap.org/reverse?${q}`, { "User-Agent": UA })) as {
    address?: Record<string, string>;
  };
  const a = d.address ?? {};
  const street = [clean(a.road ?? a.pedestrian ?? a.footway, 60), clean(a.house_number, 12)].filter(Boolean).join(" ");
  const area = clean(a.suburb ?? a.neighbourhood ?? a.quarter ?? a.city_district, 60);
  const city = clean(a.city ?? a.town ?? a.village, 60);
  return [street, area, street ? "" : city].filter(Boolean).join(", ");
}

/** The street address at a device position, or null when none is known. Never throws. */
export async function streetAddress(p: LatLng, lang: Lang, now = Date.now()): Promise<string | null> {
  const at = { lat: Math.round(p.lat * 1e4) / 1e4, lng: Math.round(p.lng * 1e4) / 1e4 };
  const key = `${at.lat},${at.lng}:${lang}`;
  const hit = cache.get(key);
  if (hit && now - hit.at < DAY_MS) return hit.value;
  const value = (await google(at, lang).catch(() => "")) || (await osm(at, lang).catch(() => "")) || null;
  if (cache.size > 2000) cache.clear(); // ponytail: crude bound; an LRU if this ever matters
  cache.set(key, { at: now, value });
  return value;
}

export const resetAddressCache = () => cache.clear();
