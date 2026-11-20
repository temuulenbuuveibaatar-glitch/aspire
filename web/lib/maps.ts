// Google Maps Platform client (server only: the key comes from GOOGLE_MAPS_API_KEY and is
// sent only in the X-Goog-Api-Key header, never in URLs, logs or error messages).
// APIs used: Routes API (computeRoutes), Places API (New) (searchText), Weather API, Air Quality API.
import type { Lang } from "@/lib/lang";

export class MapsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MapsError";
  }
}

export const NOT_SET_UP = "Maps is not set up";
const TIMEOUT_MS = 10_000;
const DEFAULT_DAILY_LIMIT = 500;

const apiKey = () => process.env.GOOGLE_MAPS_API_KEY?.trim() ?? "";
export const mapsConfigured = (): boolean => apiKey() !== "";

// ---- per-process daily cap (every Google call counts) -----------------------------------
let usage = { day: "", count: 0 };

/** Tests only. */
export function resetMapsUsage(): void {
  usage = { day: "", count: 0 };
}

function dailyLimit(): number {
  const n = Number(process.env.MAPS_DAILY_LIMIT);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_DAILY_LIMIT;
}

function takeQuota(): void {
  const day = new Date().toISOString().slice(0, 10);
  if (usage.day !== day) usage = { day, count: 0 };
  if (usage.count >= dailyLimit()) throw new MapsError("Maps daily limit reached");
  usage.count++;
}

async function google<T>(url: string, opts: { body?: unknown; fieldMask?: string } = {}): Promise<T> {
  const key = apiKey();
  if (!key) throw new MapsError(NOT_SET_UP);
  takeQuota();
  const headers: Record<string, string> = { "X-Goog-Api-Key": key };
  if (opts.fieldMask) headers["X-Goog-FieldMask"] = opts.fieldMask;
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.body !== undefined ? "POST" : "GET",
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    throw new MapsError(e instanceof Error && e.name === "TimeoutError" ? "Google Maps timed out" : "Google Maps is unreachable");
  }
  if (!res.ok) {
    // Only Google's status word (e.g. PERMISSION_DENIED): its message can echo request details.
    const body = (await res.json().catch(() => null)) as { error?: { status?: unknown } } | null;
    const status = typeof body?.error?.status === "string" && /^[A-Z_]{1,40}$/.test(body.error.status) ? ` (${body.error.status})` : "";
    throw new MapsError(`Google Maps error ${res.status}${status}`);
  }
  return (await res.json()) as T;
}

// ---- helpers ------------------------------------------------------------------------------
export interface LatLng {
  lat: number;
  lng: number;
}

const GOOGLE_LANG: Record<Lang, string> = { mn: "mn", zh: "zh-CN", en: "en", ru: "ru", de: "de" };
export const googleLanguage = (lang: Lang): string => GOOGLE_LANG[lang] ?? "en";

/** "49.03,104.08" -> coordinates; anything else -> null (free text). */
export function parseLatLng(s: string): LatLng | null {
  const m = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/.exec(s);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}

const waypoint = (s: string) => {
  const p = parseLatLng(s);
  return p ? { location: { latLng: { latitude: p.lat, longitude: p.lng } } } : { address: s };
};

export function haversineKm(a: LatLng, b: LatLng): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const seconds = (d: unknown) => (typeof d === "string" ? parseFloat(d) || 0 : 0);
const meters = (m: number) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${round1(m / 1000)} km`);

/** ISO instant -> "HH:MM" in a time zone. */
function clock(iso: string | undefined, timeZone = "Asia/Ulaanbaatar"): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  try {
    return new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
  } catch {
    return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Ulaanbaatar", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
  }
}

// ---- Routes API ---------------------------------------------------------------------------
export type TravelMode = "transit" | "walk" | "drive";
const ROUTES_MODE: Record<TravelMode, string> = { transit: "TRANSIT", walk: "WALK", drive: "DRIVE" };
const URL_MODE: Record<TravelMode, string> = { transit: "transit", walk: "walking", drive: "driving" };

export function directionsUrl(origin: string, destination: string, mode: TravelMode): string {
  const enc = encodeURIComponent;
  return `https://www.google.com/maps/dir/?api=1&origin=${enc(origin)}&destination=${enc(destination)}&travelmode=${URL_MODE[mode]}`;
}

const ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";
const STEP = "routes.legs.steps";
const ROUTE_FIELDS = [
  "routes.duration",
  "routes.distanceMeters",
  `${STEP}.travelMode`,
  `${STEP}.distanceMeters`,
  `${STEP}.staticDuration`,
  `${STEP}.navigationInstruction.instructions`,
  `${STEP}.transitDetails.stopDetails`,
  `${STEP}.transitDetails.localizedValues`,
  `${STEP}.transitDetails.headsign`,
  `${STEP}.transitDetails.stopCount`,
  `${STEP}.transitDetails.transitLine.name`,
  `${STEP}.transitDetails.transitLine.nameShort`,
  `${STEP}.transitDetails.transitLine.vehicle.name`,
  `${STEP}.transitDetails.transitLine.vehicle.type`,
].join(",");

interface LocalizedTime {
  time?: { text?: string };
  timeZone?: string;
}
interface GStep {
  travelMode?: string;
  distanceMeters?: number;
  staticDuration?: string;
  navigationInstruction?: { instructions?: string };
  transitDetails?: {
    stopDetails?: { departureStop?: { name?: string }; arrivalStop?: { name?: string }; departureTime?: string; arrivalTime?: string };
    localizedValues?: { departureTime?: LocalizedTime; arrivalTime?: LocalizedTime };
    headsign?: string;
    stopCount?: number;
    transitLine?: { name?: string; nameShort?: string; vehicle?: { name?: { text?: string }; type?: string } };
  };
}
interface GRoute {
  duration?: string;
  distanceMeters?: number;
  legs?: Array<{ steps?: GStep[] }>;
}

export interface RouteStep {
  kind: "walk" | "transit" | "drive";
  text: string;
  line?: string;
  from?: string;
  to?: string;
  departs?: string;
  arrives?: string;
  stops?: number;
}

export interface RouteResult {
  durationMin: number;
  distanceKm: number;
  departure?: string;
  arrival?: string;
  steps: RouteStep[];
  mapsUrl: string;
}

export const MAX_STEPS = 8;

async function requestRoutes(opts: { origin: string; destination: string; mode: TravelMode; departureTime?: string; lang: Lang; alternatives?: boolean }) {
  const body: Record<string, unknown> = {
    origin: waypoint(opts.origin),
    destination: waypoint(opts.destination),
    travelMode: ROUTES_MODE[opts.mode],
    languageCode: googleLanguage(opts.lang),
  };
  if (opts.departureTime && opts.mode !== "walk") body.departureTime = opts.departureTime;
  if (opts.alternatives) body.computeAlternativeRoutes = true;
  const data = await google<{ routes?: GRoute[] }>(ROUTES_URL, { body, fieldMask: ROUTE_FIELDS });
  return data.routes ?? [];
}

const allSteps = (r: GRoute) => (r.legs ?? []).flatMap((l) => l.steps ?? []);

function transitStep(s: GStep): RouteStep {
  const t = s.transitDetails ?? {};
  const line = t.transitLine?.nameShort || t.transitLine?.name;
  const vehicle = t.transitLine?.vehicle?.name?.text || "Transit";
  const lv = t.localizedValues;
  return {
    kind: "transit",
    text: s.navigationInstruction?.instructions || [vehicle, line, t.headsign && `towards ${t.headsign}`].filter(Boolean).join(" "),
    line,
    from: t.stopDetails?.departureStop?.name,
    to: t.stopDetails?.arrivalStop?.name,
    departs: lv?.departureTime?.time?.text || clock(t.stopDetails?.departureTime, lv?.departureTime?.timeZone),
    arrives: lv?.arrivalTime?.time?.text || clock(t.stopDetails?.arrivalTime, lv?.arrivalTime?.timeZone),
    stops: t.stopCount,
  };
}

function mapSteps(raw: GStep[], mode: TravelMode): RouteStep[] {
  const out: RouteStep[] = [];
  let walkM = 0;
  let walkS = 0;
  const flushWalk = () => {
    if (walkM > 0 || walkS > 0) out.push({ kind: "walk", text: `Walk ${meters(walkM)} (about ${Math.max(1, Math.round(walkS / 60))} min)` });
    walkM = 0;
    walkS = 0;
  };
  for (const s of raw) {
    if (s.travelMode === "TRANSIT" && s.transitDetails) {
      flushWalk();
      out.push(transitStep(s));
    } else if (mode === "transit") {
      // In transit routes the many small walking turns become one "walk" line.
      walkM += s.distanceMeters ?? 0;
      walkS += seconds(s.staticDuration);
    } else {
      out.push({ kind: mode === "drive" ? "drive" : "walk", text: s.navigationInstruction?.instructions || meters(s.distanceMeters ?? 0) });
    }
  }
  flushWalk();
  return out.slice(0, MAX_STEPS);
}

/** One route from A to B. Origins/destinations are free text or "lat,lng". */
export async function computeRoute(opts: { origin: string; destination: string; mode: TravelMode; departureTime?: string; lang: Lang }): Promise<RouteResult> {
  const [route] = await requestRoutes(opts);
  if (!route) throw new MapsError("No route found");
  const steps = mapSteps(allSteps(route), opts.mode);
  const transit = steps.filter((s) => s.kind === "transit");
  return {
    durationMin: Math.round(seconds(route.duration) / 60),
    distanceKm: round1((route.distanceMeters ?? 0) / 1000),
    ...(transit.length ? { departure: transit[0].departs, arrival: transit[transit.length - 1].arrives } : {}),
    steps,
    mapsUrl: directionsUrl(opts.origin, opts.destination, opts.mode),
  };
}

export interface TransitOption {
  line: string;
  lineName: string;
  vehicle: string;
  headsign: string;
  /** Stop where the person boards. */
  stop: string;
  departs: string; // HH:MM local
  arrives: string; // HH:MM local, at the last stop of the trip
  waitMinutes: number;
  rideMinutes: number;
  stops: number;
}

/** Real departures by public transport (soonest first). Empty when Google has no transit here. */
export async function transitOptions(opts: { from: string; to: string; now: Date; lang: Lang }): Promise<TransitOption[]> {
  const routes = await requestRoutes({ origin: opts.from, destination: opts.to, mode: "transit", departureTime: opts.now.toISOString(), lang: opts.lang, alternatives: true });
  const out: TransitOption[] = [];
  for (const r of routes) {
    const rides = allSteps(r).filter((s) => s.travelMode === "TRANSIT" && s.transitDetails?.stopDetails?.departureTime);
    if (!rides.length) continue;
    const first = rides[0].transitDetails!;
    const last = rides[rides.length - 1].transitDetails!;
    const dep = new Date(first.stopDetails!.departureTime!);
    const arr = new Date(last.stopDetails?.arrivalTime ?? first.stopDetails!.departureTime!);
    const tz = first.localizedValues?.departureTime?.timeZone;
    out.push({
      line: first.transitLine?.nameShort || first.transitLine?.name || "",
      lineName: first.transitLine?.name || first.transitLine?.nameShort || "",
      vehicle: first.transitLine?.vehicle?.type || "TRANSIT",
      headsign: first.headsign ?? "",
      stop: first.stopDetails?.departureStop?.name ?? "",
      departs: clock(dep.toISOString(), tz) ?? "",
      arrives: clock(arr.toISOString(), last.localizedValues?.arrivalTime?.timeZone ?? tz) ?? "",
      waitMinutes: Math.max(0, Math.round((dep.getTime() - opts.now.getTime()) / 60_000)),
      rideMinutes: Math.max(0, Math.round((arr.getTime() - dep.getTime()) / 60_000)),
      stops: rides.reduce((n, s) => n + (s.transitDetails?.stopCount ?? 0), 0),
    });
  }
  return out.sort((a, b) => a.waitMinutes - b.waitMinutes);
}

// ---- Places API (New) ---------------------------------------------------------------------
const PLACES_URL = "https://places.googleapis.com/v1/places:searchText";
const PLACE_FIELDS =
  "places.displayName,places.formattedAddress,places.location,places.googleMapsUri,places.rating,places.currentOpeningHours.openNow";

interface GPlace {
  displayName?: { text?: string };
  formattedAddress?: string;
  rating?: number;
  currentOpeningHours?: { openNow?: boolean };
  location?: { latitude?: number; longitude?: number };
  googleMapsUri?: string;
}

export interface Place {
  name: string;
  address: string;
  rating?: number;
  openNow?: boolean;
  distanceKm?: number;
  mapsUrl: string;
}

export async function searchPlaces(opts: { query: string; near?: LatLng; openNow?: boolean; lang: Lang; max?: number }): Promise<Place[]> {
  const body: Record<string, unknown> = {
    textQuery: opts.query,
    languageCode: googleLanguage(opts.lang),
    pageSize: Math.min(5, Math.max(1, Math.round(opts.max ?? 5))),
  };
  if (opts.openNow) body.openNow = true;
  if (opts.near) body.locationBias = { circle: { center: { latitude: opts.near.lat, longitude: opts.near.lng }, radius: 5000 } };
  const data = await google<{ places?: GPlace[] }>(PLACES_URL, { body, fieldMask: PLACE_FIELDS });
  return (data.places ?? []).slice(0, 5).map((p) => {
    const place: Place = { name: p.displayName?.text ?? "", address: p.formattedAddress ?? "", mapsUrl: p.googleMapsUri ?? "" };
    if (typeof p.rating === "number") place.rating = p.rating;
    if (typeof p.currentOpeningHours?.openNow === "boolean") place.openNow = p.currentOpeningHours.openNow;
    const { latitude, longitude } = p.location ?? {};
    if (opts.near && typeof latitude === "number" && typeof longitude === "number") {
      place.distanceKm = round1(haversineKm(opts.near, { lat: latitude, lng: longitude }));
    }
    return place;
  });
}

/** Place name -> coordinates (Places Text Search, Pro fields only). */
export async function geocode(query: string, lang: Lang = "en"): Promise<{ name: string } & LatLng> {
  const data = await google<{ places?: GPlace[] }>(PLACES_URL, {
    body: { textQuery: query, languageCode: googleLanguage(lang), pageSize: 1 },
    fieldMask: "places.displayName,places.formattedAddress,places.location",
  });
  const p = data.places?.[0];
  if (typeof p?.location?.latitude !== "number" || typeof p.location.longitude !== "number") throw new MapsError(`Place not found: ${query}`);
  return { name: p.formattedAddress || p.displayName?.text || query, lat: p.location.latitude, lng: p.location.longitude };
}

// ---- Weather API --------------------------------------------------------------------------
export interface WeatherNow {
  temperatureC: number;
  feelsLikeC: number;
  conditions: string;
  windKmh: number;
  humidityPct: number;
}
export interface WeatherDay {
  date: string;
  minC: number;
  maxC: number;
  conditions: string;
  precipitationChancePct: number;
}

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : NaN);
const words = (v: unknown) => (typeof v === "string" ? v.toLowerCase() : "");
const pad = (n: number | undefined) => String(n ?? 0).padStart(2, "0");

/** Current conditions + 3 days, in the same shape the weather tool always returned. Metric units. */
export async function currentWeather(lat: number, lng: number): Promise<{ now: WeatherNow; days: WeatherDay[] }> {
  const where = `location.latitude=${lat}&location.longitude=${lng}&languageCode=en`;
  const [c, f] = await Promise.all([
    google<{
      temperature?: { degrees?: number };
      feelsLikeTemperature?: { degrees?: number };
      weatherCondition?: { description?: { text?: string } };
      wind?: { speed?: { value?: number } };
      relativeHumidity?: number;
    }>(`https://weather.googleapis.com/v1/currentConditions:lookup?${where}`),
    google<{
      forecastDays?: Array<{
        displayDate?: { year?: number; month?: number; day?: number };
        maxTemperature?: { degrees?: number };
        minTemperature?: { degrees?: number };
        daytimeForecast?: { weatherCondition?: { description?: { text?: string } }; precipitation?: { probability?: { percent?: number } } };
      }>;
    }>(`https://weather.googleapis.com/v1/forecast/days:lookup?${where}&days=3&pageSize=3`),
  ]);
  const now: WeatherNow = {
    temperatureC: num(c.temperature?.degrees),
    feelsLikeC: num(c.feelsLikeTemperature?.degrees),
    conditions: words(c.weatherCondition?.description?.text),
    windKmh: num(c.wind?.speed?.value),
    humidityPct: num(c.relativeHumidity),
  };
  if (Number.isNaN(now.temperatureC)) throw new MapsError("No weather data here");
  const days: WeatherDay[] = (f.forecastDays ?? []).slice(0, 3).map((d) => ({
    date: `${d.displayDate?.year ?? ""}-${pad(d.displayDate?.month)}-${pad(d.displayDate?.day)}`,
    minC: num(d.minTemperature?.degrees),
    maxC: num(d.maxTemperature?.degrees),
    conditions: words(d.daytimeForecast?.weatherCondition?.description?.text),
    precipitationChancePct: num(d.daytimeForecast?.precipitation?.probability?.percent),
  }));
  return { now, days };
}

// ---- Air Quality API ----------------------------------------------------------------------
// US EPA breakpoints (PM2.5 as revised in 2024, PM10), used when Google gives no usa_epa index.
const PM25: Array<[number, number, number, number]> = [
  [0, 9, 0, 50], [9.1, 35.4, 51, 100], [35.5, 55.4, 101, 150], [55.5, 125.4, 151, 200], [125.5, 225.4, 201, 300], [225.5, 325.4, 301, 500],
];
const PM10: Array<[number, number, number, number]> = [
  [0, 54, 0, 50], [55, 154, 51, 100], [155, 254, 101, 150], [255, 354, 151, 200], [355, 424, 201, 300], [425, 604, 301, 500],
];

function epaIndex(c: number, table: Array<[number, number, number, number]>): number | null {
  if (!Number.isFinite(c) || c < 0) return null;
  const top = table[table.length - 1];
  if (c > top[1]) return 500;
  const row = table.find(([lo, hi]) => c >= lo && c <= hi) ?? table.find(([, hi]) => c < hi)!;
  const [cl, ch, il, ih] = row;
  return Math.round(((ih - il) / (ch - cl)) * (Math.max(c, cl) - cl) + il);
}

export async function airQualityAt(lat: number, lng: number): Promise<{ usAqi: number; universalAqi: number | null; pm2_5: number | null; pm10: number | null }> {
  const data = await google<{
    indexes?: Array<{ code?: string; aqi?: number }>;
    pollutants?: Array<{ code?: string; concentration?: { value?: number } }>;
  }>("https://airquality.googleapis.com/v1/currentConditions:lookup", {
    body: {
      location: { latitude: lat, longitude: lng },
      universalAqi: true,
      extraComputations: ["LOCAL_AQI", "POLLUTANT_CONCENTRATION"],
      // Mongolia's local index -> US EPA, so the numbers match what people know.
      customLocalAqis: [{ regionCode: "MN", aqi: "usa_epa" }],
      languageCode: "en",
    },
  });
  const index = (code: string) => data.indexes?.find((i) => i.code === code)?.aqi;
  const pollutant = (code: string) => {
    const v = data.pollutants?.find((p) => p.code === code)?.concentration?.value;
    return typeof v === "number" && Number.isFinite(v) ? Math.round(v * 10) / 10 : null;
  };
  const pm2_5 = pollutant("pm25");
  const pm10 = pollutant("pm10");
  const fromPm = Math.max(
    pm2_5 === null ? -1 : (epaIndex(Math.floor(pm2_5 * 10) / 10, PM25) ?? -1),
    pm10 === null ? -1 : (epaIndex(Math.floor(pm10), PM10) ?? -1),
  );
  const epa = index("usa_epa");
  const usAqi = typeof epa === "number" ? epa : fromPm >= 0 ? fromPm : null;
  if (usAqi === null) throw new MapsError("No air quality data here");
  const uaqi = index("uaqi");
  return { usAqi, universalAqi: typeof uaqi === "number" ? uaqi : null, pm2_5, pm10 };
}
