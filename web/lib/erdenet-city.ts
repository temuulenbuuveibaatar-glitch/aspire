// Erdenet's open city feeds (Orkhon ТКХДТ, https://dedtuv.erdenet.mn): traffic cameras, parking, fuel.
// Server only. Public endpoints only (never /api/parking, /api/stream/*, /api/transit/nats-creds).
// Cached per instance: traffic 30 s, parking 60 s, fuel 5 min; one request in flight per feed.
//
// Truth rules: every item keeps its own timestamp (parking has none per lot, so the time we read the
// stream is given); unknown values are null or "unknown", never filled in. Parking counts come from
// camera vision (approximate). Fuel "UNAVAILABLE" is the feed's nightly default with no one reporting,
// so it reads as "unknown", not "sold out".
import "server-only";
import { ERDENET_CREDIT, haversineKm, isErdenet, type LatLng } from "@/lib/geo";
import { cached, erdenetJson as json, type Slot } from "@/lib/erdenet-transit";
import { UA } from "@/lib/site";

const BASE = "https://dedtuv.erdenet.mn/api";
export const CREDIT = ERDENET_CREDIT;

export type Load = "low" | "medium" | "high";
export interface Camera { id: string; name: string; lat: number; lng: number; vehicles: number | null; load: Load | null; detectedAt: string }
/** level is null when no camera reported in the last STALE_TRAFFIC_S; busiest: up to 3 camera names, high load first. */
export interface TrafficSummary { level: Load | null; busiest: string[]; updatedAt: string | null }
export interface Traffic { cameras: Camera[]; summary: TrafficSummary }
/** free is null when the feed's counts do not add up. distanceM only when a position was given. */
export interface Lot { id: string; name: string; lat: number; lng: number; total: number; free: number | null; distanceM?: number }
/** updatedAt: when the stream was read (the feed gives no per-lot time). */
export interface Parking { lots: Lot[]; updatedAt: string }
export type FuelStatus = "selling" | "sold_out" | "unknown";
/** source "community" = drivers' votes (only when the station itself says nothing); queue: drivers' queue report (at queueAt, under 2 h old when read). */
export interface Fuel { type: string; status: FuelStatus; updatedAt: string | null; queue?: string; queueAt?: string; source?: "community" }
export interface Station { id: string; name: string; org: string; lat: number; lng: number; fuels: Fuel[]; distanceM?: number }
export interface FuelData { stations: Station[] }
export type CameraLink = { kind: "embed"; url: "https://dedtuv.erdenet.mn/live"; credit: "Орхон ТКХДТ" } | { kind: "link"; url: "https://ubtraffic.mn"; credit: "ЗХУТ" };
export type Feed = "traffic" | "parking" | "fuel";
export interface CityData {
  traffic: Traffic | null;
  parking: Parking | null;
  fuel: FuelData | null;
  cameras: CameraLink | null;
  credit: string | null;
  /** Feeds that should have answered here but did not (said, never shown as empty). */
  down?: Feed[];
}

/** A camera count older than this is left out of the summary (still listed with its own time). */
export const STALE_TRAFFIC_S = 600;
const UB: LatLng = { lat: 47.92, lng: 106.92 };
const ERDENET_CAMERAS: CameraLink = { kind: "embed", url: "https://dedtuv.erdenet.mn/live", credit: "Орхон ТКХДТ" };
const UB_CAMERAS: CameraLink = { kind: "link", url: "https://ubtraffic.mn", credit: "ЗХУТ" };

/** Which city's feeds apply at a point: Erdenet within 30 km, Ulaanbaatar within 40 km, else none. */
export function cityAt(lat: number, lng: number): "erdenet" | "ulaanbaatar" | null {
  if (isErdenet(lat, lng)) return "erdenet";
  return haversineKm({ lat, lng }, UB) <= 40 ? "ulaanbaatar" : null;
}

// ---- fetch + cache ------------------------------------------------------------------------------

const slots = { traffic: { at: 0, failedAt: 0 }, parking: { at: 0, failedAt: 0 }, fuel: { at: 0, failedAt: 0 } } as {
  traffic: Slot<Camera[]>;
  parking: Slot<Parking>;
  fuel: Slot<Station[]>;
};

const MAX_SSE = 256 * 1024;

/** The first `data:` event of the parking stream, then the connection is closed (8 s limit overall). */
async function firstEvent(): Promise<unknown> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 8000);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const res = await fetch(`${BASE}/parking/stream`, { redirect: "error", headers: { "User-Agent": UA, Accept: "text/event-stream" }, signal: ctl.signal, cache: "no-store" });
    if (!res.ok || !res.body) throw new Error(`erdenet parking ${res.status}`);
    reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (value) buf += dec.decode(value, { stream: true });
      const data = sseData(buf, done);
      if (data !== null) return JSON.parse(data);
      if (done || buf.length > MAX_SSE) throw new Error("erdenet parking: no event");
    }
  } finally {
    clearTimeout(timer);
    ctl.abort(); // close the stream: one event is all we read
    reader?.cancel().catch(() => {});
  }
}

/** The data of the first complete SSE event in `buf` (multi-line data joined), else null. */
export function sseData(buf: string, ended = false): string | null {
  const events = buf.replace(/\r\n?/g, "\n").split("\n\n");
  const complete = ended ? events : events.slice(0, -1);
  for (const ev of complete) {
    const lines = ev.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).replace(/^ /, ""));
    if (lines.length) return lines.join("\n");
  }
  return null;
}

// ---- parsing (the feeds are untrusted input) ----------------------------------------------------

const arr = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter((x) => x && typeof x === "object") : []);
const text = (v: unknown, max = 80) =>
  typeof v === "string" || typeof v === "number" ? String(v).replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max) : "";
const id = (v: unknown) => (typeof v === "string" && /^[\w-]{1,64}$/.test(v) ? v : "");
const count = (v: unknown, max: number) => (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= max ? v : null);
const okLat = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= 90;
const okLng = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= 180;
const iso = (v: unknown) => {
  const t = typeof v === "string" ? Date.parse(v) : NaN;
  return Number.isNaN(t) ? null : new Date(t).toISOString();
};

const LOADS: Record<string, Load> = { LOW: "low", MEDIUM: "medium", HIGH: "high" };

export function parseTraffic(raw: unknown): Camera[] {
  return arr(raw).flatMap((x) => {
    const cid = id(x.id), detectedAt = iso(x.detectedAt);
    if (!cid || !detectedAt || !okLat(x.lat) || !okLng(x.lng)) return [];
    const load = typeof x.loadLevel === "string" ? (LOADS[x.loadLevel] ?? null) : null;
    return [{ id: cid, name: text(x.name), lat: x.lat, lng: x.lng, vehicles: count(x.vehicleCount, 10_000), load, detectedAt }];
  });
}

/** City level from the fresh cameras: mean of low 0 / medium 1 / high 2, under 0.5 low, under 1.25 medium, else high. */
export function summarize(cameras: Camera[], now = Date.now()): TrafficSummary {
  // Fresh: seen in the last STALE_TRAFFIC_S (a time more than a minute ahead of our clock is not trusted).
  const fresh = cameras.filter((c) => {
    const age = now - Date.parse(c.detectedAt);
    return c.load && age <= STALE_TRAFFIC_S * 1000 && age >= -60_000;
  });
  const score = { low: 0, medium: 1, high: 2 };
  const mean = fresh.reduce((s, c) => s + score[c.load!], 0) / (fresh.length || 1);
  const busiest = [...fresh]
    .filter((c) => c.load !== "low" && c.name)
    .sort((a, b) => score[b.load!] - score[a.load!] || (b.vehicles ?? 0) - (a.vehicles ?? 0))
    .slice(0, 3)
    .map((c) => c.name);
  const updatedAt = cameras.reduce<string | null>((m, c) => (!m || c.detectedAt > m ? c.detectedAt : m), null);
  return { level: fresh.length ? (mean < 0.5 ? "low" : mean < 1.25 ? "medium" : "high") : null, busiest, updatedAt };
}

export function parseParking(raw: unknown, readAt: string): Parking {
  const lots = arr((raw as { lots?: unknown } | null)?.lots).flatMap((x) => {
    const lid = id(x.id), total = count(x.total, 10_000);
    if (!lid || total === null || !okLat(x.lat) || !okLng(x.lng)) return [];
    const avail = count(x.available, total), occ = count(x.occupied, total);
    // Trust `available` when it agrees with `occupied` (or occupied is missing); otherwise unknown.
    const free = avail !== null && (occ === null || avail + occ === total) ? avail : avail === null && occ !== null ? total - occ : null;
    return [{ id: lid, name: text(x.name), lat: x.lat, lng: x.lng, total, free }];
  });
  return { lots, updatedAt: readAt };
}

const SELLING = new Set(["ALWAYS_AVAILABLE", "AVAILABLE", "SELLING", "IN_STOCK"]);
const SOLD_OUT = new Set(["SOLD_OUT", "OUT_OF_STOCK", "NO_DELIVERY"]);
const statusOf = (v: unknown): FuelStatus => (typeof v !== "string" ? "unknown" : SELLING.has(v) ? "selling" : SOLD_OUT.has(v) ? "sold_out" : "unknown");

/** A drivers' queue report older than this when read is dropped (a queue changes fast). */
const QUEUE_MAX_MS = 2 * 3600_000;

export function parseFuel(raw: unknown, now = Date.now()): Station[] {
  return arr(raw).flatMap((x) => {
    const sid = id(x.id);
    if (!sid || x.active === false || !okLat(x.lat) || !okLng(x.lng)) return [];
    const community = (x.community && typeof x.community === "object" ? x.community : {}) as Record<string, Record<string, unknown> | null>;
    const seen = new Set<string>();
    const fuels = arr(x.availability).flatMap((a): Fuel[] => {
      const type = typeof a.fuelType === "string" && /^[A-Z0-9_]{1,12}$/.test(a.fuelType) ? a.fuelType : "";
      if (!type || seen.has(type)) return [];
      seen.add(type);
      const c = community[type] && typeof community[type] === "object" ? community[type]! : {};
      const votedAt = iso(c.updatedAt);
      const recent = votedAt !== null && Math.abs(now - Date.parse(votedAt)) <= QUEUE_MAX_MS;
      const queue = recent && typeof c.queueLevel === "string" && /^[A-Z_]{1,20}$/.test(c.queueLevel) ? c.queueLevel.toLowerCase() : undefined;
      let status = statusOf(a.status), updatedAt = iso(a.updatedAt), source: "community" | undefined;
      // Drivers' votes count only when the station says nothing, at least two voted, and the vote has a time.
      if (status === "unknown" && votedAt && statusOf(c.status) !== "unknown" && (count(c.totalVotes, 1e6) ?? 0) >= 2) {
        [status, updatedAt, source] = [statusOf(c.status), votedAt, "community"];
      }
      return [{ type, status, updatedAt, ...(queue ? { queue, queueAt: votedAt! } : {}), ...(source ? { source } : {}) }];
    });
    return [{ id: sid, name: text(x.name), org: text(x.organization, 60), lat: x.lat, lng: x.lng, fuels }];
  });
}

// ---- feeds --------------------------------------------------------------------------------------

export const getTraffic = async (now = Date.now()): Promise<Traffic> => {
  const cameras = await cached(slots.traffic, 30_000, 120_000, async () => parseTraffic(await json("traffic")));
  return { cameras, summary: summarize(cameras, now) };
};

export const getParking = (): Promise<Parking> =>
  cached(slots.parking, 60_000, 300_000, async () => parseParking(await firstEvent(), new Date().toISOString()));

export const getFuel = (): Promise<Station[]> => cached(slots.fuel, 300_000, 1_800_000, async () => parseFuel(await json("fuel-stations")));

/** Items nearest first, each with its distance in metres. */
export const byDistance = <T extends LatLng>(items: T[], at: LatLng) =>
  items.map((x) => ({ ...x, distanceM: Math.round(haversineKm(at, x) * 1000) })).sort((a, b) => a.distanceM - b.distanceM);

/** Everything the city card needs at a point (see app/api/city/route.ts). Never throws for a feed failure. */
export async function cityData(lat: number, lng: number): Promise<CityData> {
  const city = cityAt(lat, lng);
  if (city !== "erdenet") return { traffic: null, parking: null, fuel: null, cameras: city ? UB_CAMERAS : null, credit: city ? UB_CAMERAS.credit : null };
  const [traffic, parking, fuel] = await Promise.allSettled([getTraffic(), getParking(), getFuel()]);
  const at = { lat, lng };
  const down = (["traffic", "parking", "fuel"] as const).filter((_, i) => [traffic, parking, fuel][i].status === "rejected");
  return {
    traffic: traffic.status === "fulfilled" ? traffic.value : null,
    parking: parking.status === "fulfilled" ? { ...parking.value, lots: byDistance(parking.value.lots, at) } : null,
    fuel: fuel.status === "fulfilled" ? { stations: byDistance(fuel.value, at) } : null,
    cameras: ERDENET_CAMERAS,
    credit: CREDIT,
    ...(down.length ? { down } : {}),
  };
}
