// Bus stops anywhere in the world from OpenStreetMap (Overpass API), for places no transit feed covers
// (Ulaanbaatar, Beijing, ...). Stops only: OpenStreetMap has no departure times, so the UI must say
// "no timetable data" and never show minutes for them. Server side only.
// Overpass is a shared, free service: the public mirrors are tried in order (12 s each), only the
// ~1 km cell (2 decimals) is sent, never the precise position, every answer is kept a day per cell,
// a cell whose lookup failed is not asked again for 10 minutes, a mirror that says 429/504 rests for
// its Retry-After (default 60 s), and we say who we are (UA from lib/site.ts). Distances are measured from the
// precise point here, after the answer comes back.
// Data (c) OpenStreetMap contributors, ODbL: credit OSM_CREDIT linking to OSM_COPYRIGHT.
import type { Lang } from "@/lib/lang";
import { haversineKm, type LatLng } from "@/lib/maps";
import { UA } from "@/lib/site";

export const OVERPASS_MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
] as const;
export const OSM_CREDIT = "OpenStreetMap contributors";
export const OSM_COPYRIGHT = "https://www.openstreetmap.org/copyright";
export const OSM_RADIUS_M = 800;
const MIRROR_TIMEOUT_MS = 12_000;
const DAY_MS = 24 * 60 * 60_000;
/** A cell whose lookup failed is not asked again for this long. */
export const OVERPASS_FAIL_MS = 10 * 60_000;
const LANGS: readonly Lang[] = ["mn", "zh", "en", "ru", "de"];

/** A named bus stop near the asked point (no departures: OpenStreetMap has none). */
export interface OsmStop {
  /** "osm-node-<id>" */
  id: string;
  name: string;
  lat: number;
  lng: number;
  /** From the asked (precise) point. */
  distanceM: number;
}

/** Language-neutral, as cached per cell: every name the stop has in the languages Aspire speaks. */
interface RawStop {
  id: string;
  lat: number;
  lng: number;
  names: Record<string, string>;
}

// ---- untrusted JSON -> typed values ------------------------------------------------------------
type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const text = (v: unknown) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f<>]/g, "").trim().slice(0, 80) : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const round2 = (n: number) => Math.round(n * 100) / 100;

/** The Overpass QL for bus stops within `radiusM` of a point: highway=bus_stop, and bus platforms. */
export function overpassQuery(c: LatLng, radiusM = OSM_RADIUS_M): string {
  const at = `around:${radiusM},${c.lat},${c.lng}`;
  return `[out:json][timeout:10];(node(${at})[highway=bus_stop];node(${at})[public_transport=platform][bus=yes];);out body qt 200;`;
}

function parse(data: Obj): RawStop[] {
  const out: RawStop[] = [];
  for (const v of Array.isArray(data.elements) ? data.elements : []) {
    const e = obj(v);
    const id = num(e.id), lat = num(e.lat), lng = num(e.lon);
    if (e.type !== "node" || id === null || lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
    const tags = obj(e.tags);
    const names: Record<string, string> = {};
    for (const k of ["name", ...LANGS.map((l) => `name:${l}`)]) {
      const n = text(tags[k]);
      if (n) names[k] = n;
    }
    out.push({ id: `osm-node-${Math.trunc(id)}`, lat, lng, names });
  }
  return out;
}

// ---- mirror back-off (shared with lib/cameras.ts) ----------------------------------------------
const resting = new Map<string, number>();

/** The mirrors not resting after a 429/504, in order. */
export const mirrorsUp = (): string[] => OVERPASS_MIRRORS.filter((u) => (resting.get(u) ?? 0) <= Date.now());

/** A 429 or 504 from a mirror: leave it alone for its Retry-After seconds (60 when not said, at most 10 min). */
export function noteMirror(url: string, res: Response): void {
  if (res.status !== 429 && res.status !== 504) return;
  const after = Number(res.headers.get("retry-after"));
  const s = Number.isFinite(after) && after > 0 ? Math.min(after, 600) : 60;
  resting.set(url, Date.now() + s * 1000);
}

async function ask(url: string, query: string, ms: number): Promise<RawStop[]> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "User-Agent": UA, Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ data: query }).toString(),
    signal: AbortSignal.timeout(ms),
  });
  noteMirror(url, res);
  if (!res.ok) throw new Error(`${new URL(url).host} returned ${res.status}`);
  const data = obj(await res.json());
  if (!Array.isArray(data.elements)) throw new Error(`${new URL(url).host} sent no elements`);
  // A query that hit a runtime error (timeout, memory) still answers 200, with a remark and partial data.
  if (typeof data.remark === "string" && /error|timed out|timeout/i.test(data.remark)) throw new Error(`${new URL(url).host}: ${text(data.remark)}`);
  return parse(data);
}

// ---- per-instance cache (a day per ~1 km cell; a failure 10 minutes) -----------------------------
const cache = new Map<string, { at: number; value: RawStop[] }>();
const inflight = new Map<string, Promise<RawStop[]>>();
const failed = new Map<string, number>();

/** Tests only. */
export function resetOsmStops(): void {
  cache.clear();
  inflight.clear();
  failed.clear();
  resting.clear();
}

/** The mirrors not resting, in order, until one answers; throws when all fail or the budget runs out. */
async function fetchCell(c: LatLng, budgetMs: number): Promise<RawStop[]> {
  const deadline = Date.now() + budgetMs;
  const query = overpassQuery(c);
  let last: unknown = new Error("Overpass mirrors are resting");
  for (const url of mirrorsUp()) {
    const left = deadline - Date.now();
    if (left < 1_000) break;
    try {
      return await ask(url, query, Math.min(MIRROR_TIMEOUT_MS, left));
    } catch (e) {
      last = e;
    }
  }
  throw last;
}

async function cell(c: LatLng, budgetMs: number): Promise<RawStop[]> {
  const key = `${c.lat},${c.lng}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < DAY_MS) return hit.value;
  const pending = inflight.get(key);
  if (pending) return pending;
  const down = failed.get(key);
  if (down !== undefined && Date.now() - down < OVERPASS_FAIL_MS) throw new Error("Overpass failed for this cell recently");
  const job = fetchCell(c, budgetMs)
    .then((value) => {
      failed.delete(key);
      cache.delete(key);
      cache.set(key, { at: Date.now(), value });
      if (cache.size > 300) cache.delete(cache.keys().next().value!);
      return value;
    })
    .catch((e: unknown) => {
      failed.set(key, Date.now());
      if (failed.size > 300) failed.delete(failed.keys().next().value!);
      throw e;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, job);
  return job;
}

/**
 * Up to `max` (5) named bus stops near `p`, nearest first, one per name: the stops on both sides of a
 * road share their local name, and the nearest one stands for them, named in the person's language
 * when any of them has that translation, else by the local name on the sign, else in English.
 * Unnamed stops are left out: a name is never invented. Throws when Overpass cannot be reached (every
 * mirror failed within `budgetMs`, default all three timeouts, or this cell failed in the last 10 min).
 */
export async function nearbyStops(p: LatLng, opts: { lang?: Lang; max?: number; budgetMs?: number } = {}): Promise<OsmStop[]> {
  const raw = await cell({ lat: round2(p.lat), lng: round2(p.lng) }, opts.budgetMs ?? MIRROR_TIMEOUT_MS * OVERPASS_MIRRORS.length);
  const tag = `name:${opts.lang ?? "en"}`;
  const groups = new Map<string, RawStop[]>();
  for (const s of raw) {
    const local = s.names.name || s.names["name:en"];
    if (!local) continue;
    const k = local.toLowerCase();
    groups.set(k, [...(groups.get(k) ?? []), s]);
  }
  return [...groups.values()]
    .map((g) => {
      const near = g.map((s) => ({ s, d: Math.round(haversineKm(p, s) * 1000) })).sort((a, b) => a.d - b.d)[0];
      const name = g.find((s) => s.names[tag])?.names[tag] || near.s.names.name || near.s.names["name:en"];
      return { id: near.s.id, name, lat: near.s.lat, lng: near.s.lng, distanceM: near.d };
    })
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, opts.max ?? 5);
}
