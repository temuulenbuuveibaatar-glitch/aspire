// Erdenet's live buses from the city's open feed (Orkhon ТКХДТ, https://dedtuv.erdenet.mn/transit).
// Server only. Static network cached 6 h, vehicle positions 10 s, one request in flight at a time.
// Never calls /api/transit/nats-creds (their client's private credentials).
//
// Feed facts (verified against samples): stations are GeoJSON [lng, lat]; routePaths.coords are
// [lat, lng]; vehicle `speed` is metres per second (6.11 = 22 km/h). The site computes stop ETAs
// in the browser (no ETA endpoint), so arrivals() estimates them from live positions.
// Truthfulness: every bus carries ageS (seconds since its own last position); positions older than
// STALE_S are marked stale and never used for an estimate. Routes are matched from position (the feed names none).
import "server-only";
import { ERDENET_CENTER, ERDENET_CREDIT, haversineKm, isErdenet } from "@/lib/geo";
import { UA } from "@/lib/site";

const BASE = "https://dedtuv.erdenet.mn/api";
export const CREDIT = ERDENET_CREDIT;
export { isErdenet };

export interface Route { id: string; name: string; short: string; color: string }
export interface Station { id: string; name: string; lat: number; lng: number; routeIds: string[] }
/** coords are [lat, lng]; color is the first route's. */
export interface Path { name: string; routeIds: string[]; color: string; coords: [number, number][] }
export interface Static { routes: Route[]; stations: Station[]; paths: Path[] }
/** speedKph and heading are null when the feed did not send them (never made up). */
export interface Vehicle { id: string; name: string; lat: number; lng: number; speedKph: number | null; heading: number | null; updatedAt: string; routeId: string | null }
/** A bus as the API and tools show it: its age, and its route's name (destination) when matched. */
export interface LiveVehicle extends Vehicle { ageS: number; stale: boolean; routeName: string | null; routeShort: string | null; routeColor: string | null }
/** `minutes` is always an estimate from live positions (the feed publishes no ETAs); ageS is the bus's data age; stopped: standing still now. */
export interface Arrival { route: string; routeName: string; color: string; minutes: number; bus: string; ageS: number; stopped?: true }
export interface TripOption { route: string; color: string; waitMinutes: number | null; rideMinutes: number; bus: string | null; ageS: number | null }

/** A position older than this (seconds) is stale: shown as such, never used for an estimate. */
export const STALE_S = 60;
/** Moving: the feed sent a speed of at least 3 km/h (an unknown speed counts as stopped). */
export const moving = (kph: number | null): kph is number => kph !== null && kph >= 3;


// ---- fetch + cache ------------------------------------------------------------------------------

export type Slot<T> = { at: number; failedAt: number; value?: T; pending?: Promise<T> };
const staticSlot: Slot<Static> = { at: 0, failedAt: 0 };
const vehicleSlot: Slot<Vehicle[]> = { at: 0, failedAt: 0 };

/**
 * Fresh value, else one shared upstream call; on failure the last value if younger than maxStale.
 * After a failure the feed is left alone for 10 s (polite to a struggling server). Shared with erdenet-city.
 */
export function cached<T>(slot: Slot<T>, ttl: number, maxStale: number, load: () => Promise<T>): Promise<T> {
  const fallback = () => {
    if (slot.value !== undefined && Date.now() - slot.at < maxStale) return slot.value;
    throw new Error("erdenet feed unavailable");
  };
  if (slot.value !== undefined && Date.now() - slot.at < ttl) return Promise.resolve(slot.value);
  if (Date.now() - slot.failedAt < 10_000) return Promise.resolve().then(fallback);
  slot.pending ??= load()
    .then((v) => ((slot.value = v), (slot.at = Date.now()), v))
    .catch(() => ((slot.failedAt = Date.now()), fallback()))
    .finally(() => (slot.pending = undefined));
  return slot.pending;
}

/** GET https://dedtuv.erdenet.mn/api/<path> as JSON (8 s limit, never cached by fetch). */
export async function erdenetJson(path: string): Promise<unknown> {
  const res = await fetch(`${BASE}/${path}`, { redirect: "error", headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(8000), cache: "no-store" });
  if (!res.ok) throw new Error(`erdenet ${path} ${res.status}`);
  return res.json();
}

// ---- parsing (the feed is untrusted input) ------------------------------------------------------

const arr = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter((x) => x && typeof x === "object") : []);
const text = (v: unknown, max = 80) => (typeof v === "string" || typeof v === "number" ? String(v).trim().slice(0, max) : "");
const num = (v: unknown) => (typeof v === "number" || typeof v === "string" ? Number(v) : NaN);
const okLat = (n: number) => Number.isFinite(n) && Math.abs(n) <= 90;
const okLng = (n: number) => Number.isFinite(n) && Math.abs(n) <= 180;
const colour = (v: unknown) => (typeof v === "string" && /^#[0-9a-f]{3,8}$/i.test(v) ? v : "#7fe3ff");

export function parseStatic(raw: unknown): Static {
  const r = (raw ?? {}) as Record<string, unknown>;
  const routes = arr(r.routes)
    .filter((x) => num(x.tagId) > 0)
    .sort((a, b) => num(a.order) - num(b.order))
    .map((x) => ({ id: String(num(x.tagId)), name: text(x.name), short: text(x.busName, 20) || text(x.name, 20), color: colour(x.color) }));
  const known = new Set(routes.map((x) => x.id));
  const ids = (v: unknown) => (Array.isArray(v) ? v.map((t) => String(num(t))).filter((t) => known.has(t)) : []);
  const stations = arr(r.stations).flatMap((x) => {
    const c = (x.location as { coordinates?: unknown } | undefined)?.coordinates;
    const [lng, lat] = Array.isArray(c) ? c.map(num) : [];
    const id = text(x._id, 40);
    return id && okLat(lat) && okLng(lng) ? [{ id, name: text(x.name), lat, lng, routeIds: ids(x.tagIds) }] : [];
  });
  const paths = arr(r.routePaths).flatMap((x) => {
    const routeIds = ids(x.tagIds);
    const coords = (Array.isArray(x.coords) ? x.coords : [])
      .map((p) => (Array.isArray(p) ? [num(p[0]), num(p[1])] : [NaN, NaN]) as [number, number])
      .filter(([lat, lng]) => okLat(lat) && okLng(lng));
    const color = routes.find((rt) => rt.id === routeIds[0])?.color ?? colour(null);
    return routeIds.length && coords.length > 1 ? [{ name: text(x.name), routeIds, color, coords }] : [];
  });
  return { routes, stations, paths };
}

export function parseVehicles(raw: unknown, paths: Path[]): Vehicle[] {
  return arr(raw).flatMap((x) => {
    const lat = num(x.lat), lng = num(x.lng), speed = num(x.speed), heading = num(x.heading);
    const t = Date.parse(text(x.updatedAt, 40));
    const id = text(x.id, 40);
    if (!id || x.valid === false || !okLat(lat) || !okLng(lng) || Number.isNaN(t)) return [];
    const speedKph = Number.isFinite(speed) && speed >= 0 ? Math.round(speed * 36) / 10 : null;
    const h = Number.isFinite(heading) ? ((heading % 360) + 360) % 360 : null;
    return [{ id, name: text(x.name, 40), lat, lng, speedKph, heading: h, updatedAt: new Date(t).toISOString(), routeId: routeOf(lat, lng, moving(speedKph) ? (h ?? undefined) : undefined, paths) }];
  });
}

export const getStatic = (): Promise<Static> => cached(staticSlot, 6 * 3600_000, Infinity, async () => parseStatic(await erdenetJson("transit/static")));

export const getVehicles = (): Promise<Vehicle[]> =>
  cached(vehicleSlot, 10_000, 60_000, async () => {
    const [raw, st] = await Promise.all([erdenetJson("transit/vehicles"), getStatic()]);
    return parseVehicles(raw, st.paths);
  });

/** Every bus with its data age and route name joined from the network. */
export async function liveVehicles(): Promise<LiveVehicle[]> {
  const [vs, st] = await Promise.all([getVehicles(), getStatic()]);
  const routes = new Map(st.routes.map((r) => [r.id, r]));
  const now = Date.now();
  return vs.map((v) => {
    const ageS = Math.max(0, Math.round((now - Date.parse(v.updatedAt)) / 1000));
    const r = v.routeId ? routes.get(v.routeId) : undefined;
    return { ...v, ageS, stale: ageS > STALE_S, routeName: r?.name ?? null, routeShort: r?.short ?? null, routeColor: r?.color ?? null };
  });
}

// ---- geometry (flat metres; fine at city scale) -------------------------------------------------

const KX = 111_320 * Math.cos((ERDENET_CENTER.lat * Math.PI) / 180);
const KY = 110_540;
const angle = (a: number, b: number) => Math.abs((((a - b + 180) % 360) + 360) % 360 - 180);
const bearing = (dx: number, dy: number) => ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;

/** Nearest point on a path: metres off it and metres along it. With a heading, only segments going that way. */
function project(coords: [number, number][], lat: number, lng: number, heading?: number) {
  const px = lng * KX, py = lat * KY;
  let off = Infinity, along = 0, total = 0;
  for (let i = 1; i < coords.length; i++) {
    const ax = coords[i - 1][1] * KX, ay = coords[i - 1][0] * KY;
    const dx = coords[i][1] * KX - ax, dy = coords[i][0] * KY - ay;
    const len = Math.hypot(dx, dy);
    if (len > 0 && (heading === undefined || angle(heading, bearing(dx, dy)) <= 90)) {
      const t = Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / len ** 2));
      const d = Math.hypot(ax + t * dx - px, ay + t * dy - py);
      if (d < off) [off, along] = [d, total + t * len];
    }
    total += len;
  }
  return { off, along, total };
}

/**
 * The route of the paths within 150 m (heading-aware when moving), only when one route is clearly nearest:
 * any other route within 25 m of the best (a shared street) makes it null, never a guess.
 */
function routeOf(lat: number, lng: number, heading: number | undefined, paths: Path[]): string | null {
  const near = paths.flatMap((p) => {
    const { off } = project(p.coords, lat, lng, heading);
    return off <= 150 ? p.routeIds.map((id) => ({ id, off })) : [];
  });
  if (!near.length) return null;
  const best = Math.min(...near.map((c) => c.off));
  const ids = new Set(near.filter((c) => c.off <= best + 25).map((c) => c.id));
  return ids.size === 1 ? [...ids][0] : null;
}

type Pt = { lat: number; lng: number; heading?: number };
/** Metres along a path from `a` (moving that way) to `b`, wrapping on loops; null when off the path or behind. */
function along(coords: [number, number][], a: Pt, b: Pt): number | null {
  const pa = project(coords, a.lat, a.lng, a.heading), pb = project(coords, b.lat, b.lng);
  if (pa.off > 150 || pb.off > 100) return null;
  if (pb.along >= pa.along) return pb.along - pa.along;
  const [first, last] = [coords[0], coords[coords.length - 1]];
  const loop = haversineKm({ lat: first[0], lng: first[1] }, { lat: last[0], lng: last[1] }) < 0.3;
  return loop ? pa.total - pa.along + pb.along : null;
}

/** Shortest distance along any path of `routeId` from a to b, in metres. */
function onRoute(st: Static, routeId: string, a: Pt, b: Pt): number | null {
  const ds = st.paths.filter((p) => p.routeIds.includes(routeId)).map((p) => along(p.coords, a, b)).filter((d): d is number => d !== null);
  return ds.length ? Math.min(...ds) : null;
}

// ---- queries ------------------------------------------------------------------------------------

export async function nearestStations(lat: number, lng: number, n: number): Promise<(Station & { distanceM: number })[]> {
  const { stations } = await getStatic();
  return stations
    .map((s) => ({ ...s, distanceM: Math.round(haversineKm({ lat, lng }, s) * 1000) }))
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, Math.max(0, n));
}

const norm = (s: string) => s.toLowerCase().normalize("NFKC").replace(/[^\p{L}\p{N}]+/gu, "");

/** Stations by name (exact, then partial), nearest first when a position is given. */
export async function findStations(query: string, near?: { lat: number; lng: number }): Promise<Station[]> {
  const q = norm(query);
  if (!q) return [];
  const { stations } = await getStatic();
  let hits = stations.filter((s) => norm(s.name) === q);
  if (!hits.length) hits = stations.filter((s) => norm(s.name).includes(q) || (norm(s.name).length > 2 && q.includes(norm(s.name))));
  return near ? hits.sort((a, b) => haversineKm(near, a) - haversineKm(near, b)) : hits;
}

/** Conservative city speed: never above 20 km/h (stops, lights), never below 10. */
const minutesFor = (m: number, kph: number) => Math.max(1, Math.ceil((m / 1000 / Math.min(20, Math.max(10, kph))) * 60));

/** Next buses at a stop, soonest first (at most 6). Estimates from live positions, never timetabled. */
export async function arrivals(stationId: string): Promise<Arrival[]> {
  const [st, vehicles] = await Promise.all([getStatic(), liveVehicles()]);
  const stop = st.stations.find((s) => s.id === stationId);
  if (!stop) return [];
  const out: Arrival[] = [];
  for (const v of vehicles) {
    if (!v.routeId || !v.routeShort || !stop.routeIds.includes(v.routeId) || v.stale) continue;
    // A stopped bus (at a light, at a stop) still counts: projected without a heading, at a slow city speed.
    const go = moving(v.speedKph);
    const at = { lat: v.lat, lng: v.lng, heading: go ? (v.heading ?? undefined) : undefined };
    let m = onRoute(st, v.routeId, at, stop);
    if (m === null) {
      // Moving buses only, same rule as the city's own map: heading toward the stop, 1.4 x the straight line.
      const km = haversineKm(v, stop);
      if (!go || v.heading === null || km > 10 || angle(v.heading, bearing((stop.lng - v.lng) * KX, (stop.lat - v.lat) * KY)) > 80) continue;
      m = 1400 * km;
    }
    const minutes = minutesFor(m, go ? (v.speedKph ?? 15) : 15);
    if (minutes <= 60) out.push({ route: v.routeShort, routeName: v.routeName ?? v.routeShort, color: v.routeColor ?? colour(null), minutes, bus: v.name, ageS: v.ageS, ...(go ? {} : { stopped: true as const }) });
  }
  return out.sort((a, b) => a.minutes - b.minutes).slice(0, 6);
}

/** Buses whose plate matches ("0216" finds "0216 ОРХ"), freshest first; null when under 3 letters or digits. */
export async function findVehicles(plate: string): Promise<LiveVehicle[] | null> {
  const q = norm(plate);
  if (q.length < 3) return null;
  return (await liveVehicles()).filter((v) => norm(v.name).includes(q)).sort((a, b) => a.ageS - b.ageS);
}

/** Direct buses between two stops: wait for the next live bus (null if none seen) and ride time. */
export async function trip(fromId: string, toId: string): Promise<TripOption[]> {
  const st = await getStatic();
  const from = st.stations.find((s) => s.id === fromId);
  const to = st.stations.find((s) => s.id === toId);
  if (!from || !to) return [];
  const next = await arrivals(fromId);
  return st.routes.flatMap((r) => {
    if (!from.routeIds.includes(r.id) || !to.routeIds.includes(r.id)) return [];
    const m = onRoute(st, r.id, from, to);
    if (m === null) return [];
    const bus = next.find((a) => a.route === r.short);
    return [{ route: r.short, color: r.color, waitMinutes: bus?.minutes ?? null, rideMinutes: minutesFor(m, 15), bus: bus?.bus ?? null, ageS: bus?.ageS ?? null }];
  }).sort((a, b) => (a.waitMinutes ?? 99) + a.rideMinutes - ((b.waitMinutes ?? 99) + b.rideMinutes));
}
