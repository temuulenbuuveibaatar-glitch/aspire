// Transitous (https://transitous.org): the free, community-run public transport router (MOTIS) built
// from open GTFS and GTFS-RT feeds worldwide. Aspire asks it where Erdenet's own feed does not apply
// and Google has no transit. Server side only. Their usage policy: say who you are (a User-Agent with
// a contact), cache, and keep route planning low. So: stop times are cached 30 s, plans 5 minutes
// (keyed by endpoints rounded to about 100 m), place lookups a day, and /plan stays under 700 calls a
// day per instance. Departure searches send only the ~1 km cell, never the precise position.
// `live` is Transitous' realTime flag: true is a real-time (GTFS-RT) time, false is the timetable.
// Vehicle positions (vehiclesNear) are what Transitous' own map shows: each bus is placed along its
// route shape by the time between two stops (real-time times when `live`), not a GPS fix: say "about".
// Credit: "Transit data: Transitous and sources" linking to TRANSITOUS_SOURCES.
import { haversineKm, type LatLng } from "@/lib/maps";
import { SITE } from "@/lib/site";
import { clockIn, validTimeZone, zoneOr } from "@/lib/tools/time";

const API = "https://api.transitous.org/api";
export const TRANSITOUS_CREDIT = "Transitous and sources";
export const TRANSITOUS_SOURCES = "https://transitous.org/sources/";
const CONTACT = (SITE.repoUrl || (SITE.contactEmail && `mailto:${SITE.contactEmail}`) || "https://aspire-mn.vercel.app").replace(/[^\x21-\x7e]/g, "").slice(0, 120);
export const TRANSITOUS_UA = `Aspire/6 (+${CONTACT})`;
export const PLAN_DAILY_LIMIT = 700;

/** One departure near a point (soonest first). */
export interface Departure {
  route: string;
  headsign: string;
  stop: string;
  lat: number;
  lng: number;
  /** From the asked (precise) point. */
  distanceM: number;
  minutes: number;
  /** HH:MM in the stop's own time zone. */
  time: string;
  /** true: real-time; false: timetable only ("Scheduled"). */
  live: boolean;
  mode: string;
}

/** One way there by public transport (Google TransitOption's shape plus `live`). */
export interface PlanOption {
  line: string;
  lineName: string;
  headsign: string;
  stop: string;
  departs: string;
  arrives: string;
  waitMinutes: number;
  rideMinutes: number;
  stops: number;
  live: boolean;
}

// ---- untrusted JSON -> typed values ------------------------------------------------------------
type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const text = (v: unknown, max = 80) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f<>]/g, "").trim().slice(0, max) : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const when = (v: unknown) => (typeof v === "string" && Number.isFinite(Date.parse(v)) ? Date.parse(v) : null);
function point(v: unknown): LatLng | null {
  const o = obj(v);
  const lat = num(o.lat), lng = num(o.lon);
  return lat !== null && lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}
const round = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;
const ll = (p: LatLng, d: number) => `${round(p.lat, d)},${round(p.lng, d)}`;
const minutesFrom = (at: number, now: Date) => Math.round((at - now.getTime()) / 60_000);
const clock = (at: number, tz: unknown, fallback?: string) => clockIn(new Date(at), validTimeZone(tz) ?? zoneOr(fallback));

// ---- polite fetch + per-instance cache (failures are never cached) -------------------------------
async function get(path: string, q: Record<string, string>): Promise<unknown> {
  const res = await fetch(`${API}${path}?${new URLSearchParams(q)}`, { redirect: "error", headers: { "User-Agent": TRANSITOUS_UA, Accept: "application/json" }, signal: AbortSignal.timeout(6_000) });
  if (!res.ok) throw new Error(`Transitous returned ${res.status}`);
  return res.json();
}

const memos = new Map<string, { at: number; ttl: number; value: unknown }>();
async function memo<T>(key: string, ttl: number, fn: () => Promise<T>): Promise<T> {
  const hit = memos.get(key);
  if (hit && Date.now() - hit.at < hit.ttl) return hit.value as T;
  const value = await fn();
  memos.delete(key);
  memos.set(key, { at: Date.now(), ttl, value });
  if (memos.size > 300) memos.delete(memos.keys().next().value!);
  return value;
}

let plans = { day: "", count: 0 };

/** Tests only. */
export function resetTransitous(): void {
  memos.clear();
  plans = { day: "", count: 0 };
}

// ---- departures ---------------------------------------------------------------------------------
type RawDeparture = Omit<Departure, "distanceM" | "minutes" | "time"> & { at: number; tz: unknown };

/** Departures further off than this are no "next bus": a feed with a gap (Moscow's, by days) would say "in 2604 min". */
export const AHEAD_MIN = 6 * 60;

/** The next departures within about 1 km of `p` and AHEAD_MIN (cancelled and gone ones dropped), soonest first. */
export async function departuresNear(p: LatLng, now: Date, opts: { timeZone?: string } = {}): Promise<Departure[]> {
  const c = ll(p, 2);
  const raw = await memo(`st:${c}`, 30_000, async () => {
    const data = obj(await get("/v5/stoptimes", { center: c, radius: "1000", n: "40" }));
    return list(data.stopTimes).flatMap((v): RawDeparture[] => {
      const s = obj(v);
      const place = obj(s.place);
      const at = when(place.departure) ?? when(place.scheduledDeparture);
      const where = point(place);
      const route = text(s.routeShortName, 40) || text(s.displayName, 40) || text(s.routeLongName, 40);
      const stop = text(place.name);
      // Cancelled, or no boarding here (e.g. the last stop): not a departure anyone can take.
      if (at === null || !where || !route || !stop || s.cancelled === true || s.tripCancelled === true || s.pickupDropoffType === "NOT_ALLOWED") return [];
      return [{ route, headsign: text(s.headsign), stop, ...where, mode: text(s.mode, 20), live: s.realTime === true, at, tz: place.tz }];
    });
  });
  return raw
    .map(({ at, tz, ...d }) => ({ ...d, distanceM: Math.round(haversineKm(p, d) * 1000), minutes: minutesFrom(at, now), time: clock(at, tz, opts.timeZone) }))
    .filter((d) => d.minutes >= 0 && d.minutes <= AHEAD_MIN && d.distanceM <= 1500)
    .sort((a, b) => a.minutes - b.minutes || a.distanceM - b.distanceM);
}

// ---- trip planning ------------------------------------------------------------------------------
const NOT_TRANSIT = /^(WALK|BIKE|RENTAL|CAR|CAR_PARKING|CAR_DROPOFF|ODM|FLEX|RIDE_SHARING|DEBUG_.*)$/;

type RawOption = Omit<PlanOption, "departs" | "arrives" | "waitMinutes"> & { dep: number; arr: number; tz: unknown; tzArr: unknown };

/** Public transport options from `from` to `to`, soonest first. Throws past the daily /plan budget. */
export async function planTrip(from: LatLng, to: LatLng, now: Date, opts: { timeZone?: string } = {}): Promise<PlanOption[]> {
  const bucket = Math.floor(now.getTime() / 300_000);
  const raw = await memo(`plan:${ll(from, 3)}:${ll(to, 3)}:${bucket}`, 5 * 60_000, async () => {
    const day = now.toISOString().slice(0, 10);
    if (plans.day !== day) plans = { day, count: 0 };
    if (plans.count >= PLAN_DAILY_LIMIT) throw new Error("Transitous daily plan budget used up");
    plans.count++;
    const data = obj(await get("/v5/plan", { fromPlace: ll(from, 3), toPlace: ll(to, 3), time: now.toISOString() }));
    return list(data.itineraries).flatMap((v): RawOption[] => {
      const rides = list(obj(v).legs).map(obj).filter((l) => typeof l.mode === "string" && !NOT_TRANSIT.test(l.mode));
      if (!rides.length) return [];
      const first = rides[0], last = rides[rides.length - 1];
      const a = obj(first.from), b = obj(last.to);
      const dep = when(first.startTime) ?? when(a.departure), arr = when(last.endTime) ?? when(b.arrival);
      const line = text(first.routeShortName, 40) || text(first.displayName, 40);
      if (dep === null || arr === null || arr < dep || !line) return [];
      return [{
        line,
        lineName: text(first.routeLongName) || line,
        headsign: text(first.headsign),
        stop: text(a.name),
        dep,
        arr,
        tz: a.tz,
        tzArr: b.tz,
        rideMinutes: Math.round((arr - dep) / 60_000),
        stops: rides.reduce((n, l) => n + list(l.intermediateStops).length + 1, 0),
        live: rides.some((l) => l.realTime === true),
      }];
    });
  });
  return raw
    .map(({ dep, arr, tz, tzArr, ...o }) => ({ ...o, departs: clock(dep, tz, opts.timeZone), arrives: clock(arr, tzArr ?? tz, opts.timeZone), waitMinutes: minutesFrom(dep, now) }))
    .filter((o) => o.waitMinutes >= 0)
    .sort((x, y) => x.waitMinutes - y.waitMinutes);
}

// ---- place lookup -------------------------------------------------------------------------------
/**
 * A stop, address or place by name, biased to `near` when known. A match over 50 km from `near` is
 * another town with the same name: null (never a guess).
 */
export async function findPlace(query: string, near?: LatLng | null): Promise<{ name: string } & LatLng | null> {
  const q = text(query, 120);
  if (!q) return null;
  const bias = near ? ll(near, 2) : "";
  return memo(`geo:${q.toLowerCase()}:${bias}`, 24 * 60 * 60_000, async () => {
    const data = await get("/v1/geocode", { text: q, numResults: "5", ...(bias ? { place: bias, placeBias: "5" } : {}) });
    for (const m of list(data)) {
      const where = point(m);
      if (where && (!near || haversineKm(near, where) <= 50)) return { name: text(obj(m).name) || q, ...where };
    }
    return null;
  });
}

// ---- vehicles on the road -----------------------------------------------------------------------
/** A bus, tram or coach near the asked point right now, placed along its route by the clock. */
export interface Vehicle {
  route: string;
  mode: string;
  /** The stop it is heading for. */
  nextStop: string;
  lat: number;
  lng: number;
  /** From the asked (precise) point. */
  distanceM: number;
  /** true: positioned by real-time times; false: by the timetable. Always an estimate either way. */
  live: boolean;
}

const ROAD = new Set(["BUS", "COACH", "TRAM", "TROLLEYBUS"]);

/** Google's encoded polyline (precision 5, as MOTIS sends it) -> points. Bad input stops early. */
export function decodePolyline(s: string): LatLng[] {
  const out: LatLng[] = [];
  let i = 0, lat = 0, lng = 0;
  while (i < s.length && out.length < 20_000) {
    const d: number[] = [];
    for (let k = 0; k < 2; k++) {
      let r = 0, shift = 0, b: number;
      do {
        b = s.charCodeAt(i++) - 63;
        r |= (b & 31) << shift;
        shift += 5;
      } while (b >= 32 && i < s.length && shift < 35);
      d.push(r & 1 ? ~(r >> 1) : r >> 1);
    }
    lat += d[0];
    lng += d[1];
    out.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return out;
}

/** The point `f` (0..1) of the way along a line, by distance. */
export function along(line: LatLng[], f: number): LatLng | null {
  if (!line.length) return null;
  const legs = line.slice(1).map((q, i) => haversineKm(line[i], q));
  let left = Math.min(1, Math.max(0, f)) * legs.reduce((a, b) => a + b, 0);
  for (let i = 0; i < legs.length; i++) {
    if (left <= legs[i] && legs[i] > 0) {
      const t = left / legs[i], a = line[i], b = line[i + 1];
      return { lat: round(a.lat + (b.lat - a.lat) * t, 5), lng: round(a.lng + (b.lng - a.lng) * t, 5) };
    }
    left -= legs[i];
  }
  return line[line.length - 1];
}

type Segment = { route: string; mode: string; nextStop: string; dep: number; arr: number; live: boolean; line: LatLng[]; trip: string };

/**
 * Buses, trams and coaches within about 1.5 km of `p` now, nearest first (at most `max`, 30). Asks
 * Transitous for the trips crossing the ~1 km cell's box in the next two minutes (cached 30 s per
 * cell, only the cell is sent) and places each between its two stops by the clock. Empty where no
 * open feed covers the city (Ulaanbaatar, Beijing). Throws when Transitous cannot be reached.
 */
export async function vehiclesNear(p: LatLng, now: Date, max = 30): Promise<Vehicle[]> {
  const c = { lat: round(p.lat, 2), lng: round(p.lng, 2) };
  const dLat = 0.015, dLng = 0.015 / Math.max(0.2, Math.cos((c.lat * Math.PI) / 180));
  const box = (s: number) => `${round(c.lat + s * dLat, 4)},${round(c.lng + s * dLng, 4)}`;
  const bucket = Math.floor(now.getTime() / 30_000);
  const segs = await memo(`veh:${ll(c, 2)}:${bucket}`, 30_000, async () => {
    const from = new Date(bucket * 30_000);
    const data = await get("/v5/map/trips", { min: box(-1), max: box(1), startTime: from.toISOString(), endTime: new Date(from.getTime() + 120_000).toISOString(), zoom: "16" });
    return list(data).flatMap((v): Segment[] => {
      const s = obj(v);
      const mode = text(s.mode, 20);
      const trip = obj(list(s.trips)[0]);
      const route = text(trip.routeShortName, 40) || text(trip.displayName, 40);
      const dep = when(s.departure), arr = when(s.arrival);
      if (!ROAD.has(mode) || !route || dep === null || arr === null || arr < dep || typeof s.polyline !== "string" || s.polyline.length > 200_000) return [];
      const line = decodePolyline(s.polyline);
      if (line.length < 2) return [];
      return [{ route, mode, nextStop: text(obj(s.to).name), dep, arr, live: s.realTime === true, line, trip: text(trip.tripId, 120) || `${route}:${dep}` }];
    });
  });
  const t = now.getTime();
  const seen = new Set<string>();
  const out: Vehicle[] = [];
  // A trip shows once: on the segment it is on now (or waiting at the stop it leaves next).
  for (const s of [...segs].sort((a, b) => a.dep - b.dep)) {
    if (t > s.arr || s.dep - t > 90_000 || seen.has(s.trip)) continue;
    const at = along(s.line, s.arr === s.dep ? 1 : (t - s.dep) / (s.arr - s.dep));
    if (!at) continue;
    const distanceM = Math.round(haversineKm(p, at) * 1000);
    if (distanceM > 1500) continue;
    seen.add(s.trip);
    out.push({ route: s.route, mode: s.mode, nextStop: s.nextStop, ...at, distanceM, live: s.live });
  }
  return out.sort((a, b) => a.distanceM - b.distanceM).slice(0, max);
}
