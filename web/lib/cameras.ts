// Public cameras near a place, honest and legal. Only operators' own public feeds and pages:
//   (a) Erdenet city cameras page (Orkhon ТКХДТ), (b) Ulaanbaatar traffic centre page (ЗХУТ),
//   (c) government traffic cameras without keys: London TfL JamCams, Singapore LTA (data.gov.sg),
//       Hong Kong Transport Department snapshot list (data.gov.hk), California Caltrans district
//       lists, New Zealand NZTA list, and the regional open-data lists in REGIONAL (Finland,
//       Norway, Iceland, Queensland, British Columbia, Washington, Oregon, Iowa, Toronto, Austin,
//       Quebec, Taiwan; docs/design/camera-feeds.md). A source that needs a free key is skipped
//       silently until its env var is set,
//   (d) YouTube live streams posted with a location (YouTube Data API v3, same Google key), with
//       game streams (Gaming category, GTA roleplay and the like) and non-camera streams (Music
//       category, no camera word) left out,
//   (e) webcams people mapped on OpenStreetMap (Overpass), as https links only.
// Never Insecam-style lists of private or unsecured cameras. Every URL passes safeCameraUrl.
// A source that fails is named in `unavailable` and simply adds nothing; a regional list or an
// Overpass cell that failed rests 10 minutes, and no source holds the answer past DEADLINE_MS.
// Server only: the Google key goes in the x-goog-api-key header, never in a URL, log or error.
import "server-only";
import { ERDENET_CENTER, ERDENET_CREDIT, haversineKm, type LatLng } from "@/lib/geo";
import { stripHtml } from "@/lib/news";
import { mirrorsUp, noteMirror, OVERPASS_FAIL_MS } from "@/lib/osm-stops";
import { UA } from "@/lib/site";
import { safeCameraUrl, safeImageUrl, type Camera } from "@/lib/tools/camera-types";
import { isVideoId } from "@/lib/tools/types";

export type { Camera, CameraKind } from "@/lib/tools/camera-types";

export interface CameraResult {
  cameras: Camera[];
  /** Everyone whose cameras or data are shown, in order. */
  credit: string[];
  /** Sources that did not answer this time (said plainly, never hidden). */
  unavailable: Camera["source"][];
  updatedAt: string;
}

const UB_CENTER: LatLng = { lat: 47.92, lng: 106.92 };
const LONDON: LatLng = { lat: 51.5074, lng: -0.1278 };
const SINGAPORE: LatLng = { lat: 1.3521, lng: 103.8198 };
const HONG_KONG: LatLng = { lat: 22.3193, lng: 114.1694 };
const GOV_RADIUS_KM = 60;
const DAY = 24 * 60 * 60_000;
const PER_SOURCE = 12;
const MAX_CAMERAS = 40;
const TIMEOUT_MS = 10_000;
/** The longest findCameras waits for every source together (YouTube and TDX make two calls each). */
const DEADLINE_MS = 10_000;
/**
 * All the Overpass mirrors together get this long. The other sources of a place answer in about half a
 * second, so a silent Overpass must not hold the camera panel (it did, for 9 s); after the budget the
 * source is named as not answering and its cell rests 10 minutes.
 */
const OVERPASS_BUDGET_MS = 3_000;

const CREDIT = {
  ub: "ЗХУТ",
  tfl: "Transport for London (Powered by TfL Open Data)",
  sg: "Contains information from Traffic Images from data.gov.sg, made available under the Singapore Open Data Licence v1.0",
  hk: "Transport Department, HKSAR (data.gov.hk)",
  caltrans: "Caltrans",
  nzta: "NZ Transport Agency Waka Kotahi",
  osm: "© OpenStreetMap contributors",
} as const;

// ---- small helpers ----------------------------------------------------------------------------
export const validLatLng = (lat: unknown, lng: unknown): boolean =>
  typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

const km = (a: LatLng, b: LatLng) => Math.round(haversineKm(a, b) * 10) / 10;
const num = (v: unknown): number | null => {
  const n = typeof v === "string" && v.trim() ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};
const text = (v: unknown, max = 120): string => stripHtml(v, max);
const iso = (v: unknown): string | undefined => {
  const t = typeof v === "string" ? Date.parse(v) : NaN;
  return Number.isFinite(t) ? new Date(t).toISOString() : undefined;
};
/** [south, west, north, east] in degrees. */
type Box = readonly [number, number, number, number];
/** Within `radiusKm` of the box (distance to its nearest point; fine for boxes off the antimeridian). */
const nearBox = (at: LatLng, [s, w, n, e]: Box, radiusKm: number) =>
  haversineKm(at, { lat: Math.min(n, Math.max(s, at.lat)), lng: Math.min(e, Math.max(w, at.lng)) }) <= radiusKm;
/** `b` grown to hold every point. */
const widen = (b: Box, ps: LatLng[]): Box =>
  ps.reduce<Box>((x, p) => [Math.min(x[0], p.lat), Math.min(x[1], p.lng), Math.max(x[2], p.lat), Math.max(x[3], p.lng)], b);
/** ~11 km grid cell, so nearby people share one upstream call. */
const cell = (x: number) => Math.round(x * 10) / 10;

type Spot = Omit<Camera, "distanceKm">;

/** The `n` spots nearest `at` within `radiusKm`, with their distance. */
function nearest(spots: Spot[], at: LatLng, radiusKm: number, n = PER_SOURCE): Camera[] {
  return spots
    .map((s) => ({ ...s, distanceKm: km(at, s) }))
    .filter((c) => c.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, n);
}

// ---- cache (per server instance) --------------------------------------------------------------
const cache = new Map<string, { at: number; value: unknown }>();
const inflight = new Map<string, Promise<unknown>>();

/** Tests only. */
export function clearCameraCache(): void {
  cache.clear();
  inflight.clear();
  ytUsage = { day: "", count: 0 };
  ytPerUser.clear();
  caltransBox.clear();
  failed.clear();
}

async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;
  const running = inflight.get(key);
  if (running) return running as Promise<T>;
  const p = load()
    .then((value) => {
      if (cache.size > 500) cache.delete(cache.keys().next().value as string);
      cache.set(key, { at: Date.now(), value });
      return value;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

/** Upstreams that failed lately (a regional list, an Overpass cell): named as unavailable, not asked again for 10 minutes. */
const failed = new Map<string, number>();

function resting<T>(key: string, load: () => Promise<T>): Promise<T> {
  const down = failed.get(key);
  if (down !== undefined && Date.now() - down < OVERPASS_FAIL_MS) return Promise.reject(new Error("failed recently"));
  return load().catch((e: unknown) => {
    failed.set(key, Date.now());
    if (failed.size > 500) failed.delete(failed.keys().next().value as string);
    throw e;
  });
}

async function get(url: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    headers: { "User-Agent": UA, ...(init.headers as Record<string, string>) },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
    redirect: "error", // every endpoint is final; never carry the key header to another host
  });
  if (!res.ok) throw new Error(`camera source ${new URL(url).host} ${res.status}`);
  return res;
}

// ---- (a) (b) city pages -----------------------------------------------------------------------
function cityPages(at: LatLng): Camera[] {
  const out: Camera[] = [];
  if (haversineKm(at, ERDENET_CENTER) <= 30)
    // Mongolian names here; the sheet and the tool show them in the person's language (cameraName).
    out.push({ id: "erdenet-live", name: "Эрдэнэт хотын камерууд", ...ERDENET_CENTER, distanceKm: km(at, ERDENET_CENTER), kind: "embed", url: "https://dedtuv.erdenet.mn/live", source: "erdenet", credit: ERDENET_CREDIT });
  if (haversineKm(at, UB_CENTER) <= 40)
    out.push({ id: "ub-traffic", name: "Улаанбаатар: замын хөдөлгөөний камер", ...UB_CENTER, distanceKm: km(at, UB_CENTER), kind: "link", url: "https://ubtraffic.mn/", source: "ulaanbaatar", credit: CREDIT.ub });
  return out;
}

// ---- (c) government traffic cameras -----------------------------------------------------------
interface TflProp { key?: unknown; value?: unknown; modified?: unknown }
interface TflPlace { id?: unknown; commonName?: unknown; lat?: unknown; lon?: unknown; additionalProperties?: TflProp[] }

export function parseTfl(data: unknown): Spot[] {
  if (!Array.isArray(data)) return [];
  const out: Spot[] = [];
  for (const p of data as TflPlace[]) {
    const lat = num(p?.lat), lng = num(p?.lon);
    const props = Array.isArray(p?.additionalProperties) ? p.additionalProperties : [];
    const prop = (k: string) => props.find((x) => x?.key === k);
    const url = safeImageUrl(prop("imageUrl")?.value);
    if (lat === null || lng === null || !validLatLng(lat, lng) || !url || prop("available")?.value === "false") continue;
    const clip = safeImageUrl(prop("videoUrl")?.value) ?? undefined;
    out.push({
      id: `tfl-${text(p.id, 40)}`, name: text(p.commonName) || "JamCam", lat, lng, kind: "image", url, thumb: url,
      // No updatedAt: TfL rewrites the same .jpg in place, so the list's time is not the picture's.
      ...(clip ? { clip } : {}), source: "tfl", credit: CREDIT.tfl,
    });
  }
  return out;
}

interface SgCamera { camera_id?: unknown; image?: unknown; timestamp?: unknown; location?: { latitude?: unknown; longitude?: unknown } }

export function parseSingapore(data: unknown): Spot[] {
  const cams = (data as { items?: { cameras?: SgCamera[] }[] } | null)?.items?.[0]?.cameras;
  if (!Array.isArray(cams)) return [];
  const out: Spot[] = [];
  for (const c of cams) {
    const lat = num(c?.location?.latitude), lng = num(c?.location?.longitude);
    const url = safeImageUrl(c?.image);
    const id = text(c?.camera_id, 20);
    if (lat === null || lng === null || !validLatLng(lat, lng) || !url || !id) continue;
    out.push({ id: `sg-${id}`, name: `LTA camera ${id}`, lat, lng, kind: "image", url, thumb: url, source: "lta-sg", credit: CREDIT.sg, updatedAt: iso(c.timestamp) });
  }
  return out;
}

/** The Transport Department's public XML list of snapshot cameras (image-list > image). */
export function parseHongKong(xml: unknown): Spot[] {
  if (typeof xml !== "string") return [];
  const out: Spot[] = [];
  for (const [, block] of xml.slice(0, 2_000_000).matchAll(/<image>([\s\S]*?)<\/image>/g)) {
    const tag = (t: string) => new RegExp(`<${t}>([^<]*)</${t}>`).exec(block)?.[1]?.trim() ?? "";
    const lat = num(tag("latitude")), lng = num(tag("longitude"));
    const url = safeImageUrl(tag("url"));
    const key = tag("key");
    if (lat === null || lng === null || !validLatLng(lat, lng) || !url || !/^[A-Za-z0-9]{1,12}$/.test(key)) continue;
    out.push({ id: `hk-${key}`, name: text(tag("description")) || key, lat, lng, kind: "image", url, thumb: url, source: "td-hk", credit: CREDIT.hk });
  }
  return out;
}

// Caltrans: one JSON list per district (data[].cctv). The image is rewritten in place every few
// minutes, so the record time is not the picture's: no updatedAt.
interface CaltransCam {
  index?: unknown;
  inService?: unknown;
  location?: { district?: unknown; locationName?: unknown; nearbyPlace?: unknown; latitude?: unknown; longitude?: unknown };
  imageData?: { streamingVideoURL?: unknown; static?: { currentImageURL?: unknown } };
}

export function parseCaltrans(data: unknown): Spot[] {
  const rows = (data as { data?: { cctv?: CaltransCam }[] } | null)?.data;
  if (!Array.isArray(rows)) return [];
  const out: Spot[] = [];
  for (const row of rows) {
    const c = row?.cctv;
    const lat = num(c?.location?.latitude), lng = num(c?.location?.longitude);
    const url = safeImageUrl(c?.imageData?.static?.currentImageURL);
    const d = text(c?.location?.district, 4), i = text(c?.index, 12);
    if (c?.inService !== "true" || lat === null || lng === null || !validLatLng(lat, lng) || !url || !/^\d{1,2}$/.test(d) || !/^\d{1,8}$/.test(i)) continue;
    const clip = safeImageUrl(c.imageData?.streamingVideoURL) ?? undefined; // https only: some rows say http
    const name = [text(c.location?.locationName), text(c.location?.nearbyPlace, 60)].filter(Boolean).join(", ");
    out.push({ id: `ct-${d}-${i}`, name: name || "Caltrans camera", lat, lng, kind: "image", url, thumb: url, ...(clip ? { clip } : {}), source: "caltrans", credit: CREDIT.caltrans });
  }
  return out;
}

/**
 * Where each district's cameras are, [S, W, N, E], computed once from the twelve lists
 * (2026-11-21), so a place far from a district never downloads its list (up to 2 MB). A loaded
 * list can only widen its box (caltransBox), for cameras added since.
 */
const CALTRANS_SEED: readonly Box[] = [
  [38.75, -124.21, 42.0, -122.6], [39.77, -123.0, 42.0, -120.03], [38.07, -122.16, 39.79, -119.95],
  [36.91, -122.8, 38.53, -121.51], [34.38, -122.03, 37.14, -119.48], [34.81, -120.73, 37.34, -118.8],
  [33.74, -119.3, 34.8, -117.69], [33.43, -117.75, 35.61, -114.55], [34.98, -119.46, 38.36, -117.86],
  [36.97, -121.68, 38.46, -119.95], [32.55, -117.39, 33.35, -115.49], [33.39, -118.1, 33.95, -117.59],
];
const caltransBox = new Map<number, Box>();
/** District numbers (1-12) whose cameras could be within the radius of `at`. */
const caltransDistricts = (at: LatLng) =>
  CALTRANS_SEED.map((_, i) => i + 1).filter((d) => nearBox(at, caltransBox.get(d) ?? CALTRANS_SEED[d - 1], GOV_RADIUS_KM));

const caltrans = (d: number) =>
  cached(`ct${d}`, DAY, async () => {
    const url = `https://cwwp2.dot.ca.gov/data/d${d}/cctv/cctvStatusD${String(d).padStart(2, "0")}.json`;
    const spots = parseCaltrans(await (await get(url, { headers: { Accept: "application/json" } })).json());
    caltransBox.set(d, widen(caltransBox.get(d) ?? CALTRANS_SEED[d - 1], spots));
    return spots;
  });

/** NZTA's XML list (response > camera). Nested journey/region/way blocks carry their own id and name. */
export function parseNzta(xml: unknown): Spot[] {
  if (typeof xml !== "string") return [];
  const out: Spot[] = [];
  for (const [, raw] of xml.slice(0, 3_000_000).matchAll(/<camera>([\s\S]*?)<\/camera>/g)) {
    const block = raw.replace(/<(journey|journeyLeg|region|way)>[\s\S]*?<\/\1>/g, "");
    const tag = (t: string) => new RegExp(`<${t}>([^<]*)</${t}>`).exec(block)?.[1]?.trim() ?? "";
    if (tag("offline") === "true" || tag("underMaintenance") === "true") continue;
    const lat = num(tag("latitude")), lng = num(tag("longitude"));
    const id = tag("id"), path = tag("imageUrl");
    const url = /^\/(?!\/)/.test(path) ? safeImageUrl(`https://www.trafficnz.info${path}`) : null; // relative to NZTA's host only
    if (lat === null || lng === null || !validLatLng(lat, lng) || !url || !/^\d{1,8}$/.test(id)) continue;
    const name = [text(tag("name"), 60), text(tag("description"))].filter(Boolean).join(": ");
    out.push({ id: `nz-${id}`, name: name || `NZTA camera ${id}`, lat, lng, kind: "image", url, thumb: url, source: "nzta", credit: CREDIT.nzta });
  }
  return out;
}
/** Where NZTA's cameras are, [S, W, N, E], from the list on 2026-11-21. */
const NZ_BOX: Box = [-45.9, 168.66, -36.38, 176.88];

const tfl = () => cached("tfl", 60 * 60_000, async () => parseTfl(await (await get("https://api.tfl.gov.uk/Place/Type/JamCam", { headers: { Accept: "application/json" } })).json()));
const nzta = () => cached("nzta", DAY, async () => parseNzta(await (await get("https://www.trafficnz.info/service/traffic/rest/4/cameras/all", { headers: { Accept: "application/xml" } })).text()));
const singapore = () => cached("sg", 2 * 60_000, async () => parseSingapore(await (await get("https://api.data.gov.sg/v1/transport/traffic-images", { headers: { Accept: "application/json" } })).json()));
const hongKong = () => cached("hk", DAY, async () => parseHongKong(await (await get("https://static.data.gov.hk/td/traffic-snapshot-images/code/Traffic_Camera_Locations_En.xml")).text()));

// ---- (c) regional open-data lists: one shape, one table --------------------------------------
type Row = Record<string, unknown>;
const obj = (v: unknown): Row => (v && typeof v === "object" && !Array.isArray(v) ? (v as Row) : {});
const rows = (v: unknown): Row[] => (Array.isArray(v) ? v.map(obj) : []);
/** [lat, lng] of a GeoJSON Point (or the first of a MultiPoint). */
const xy = (g: unknown): [unknown, unknown] => {
  const c = obj(g).coordinates;
  const p = obj(g).type === "MultiPoint" && Array.isArray(c) ? c[0] : c;
  return Array.isArray(p) ? [p[1], p[0]] : [null, null];
};
const ident = (v: unknown): string => {
  const s = typeof v === "number" && Number.isFinite(v) ? String(v) : typeof v === "string" ? v.trim() : "";
  return /^[\w.:+-]{1,40}$/.test(s) ? s : "";
};
const env = (k: string) => process.env[k]?.trim() ?? "";
const keep = (xs: (Spot | null)[]): Spot[] => xs.filter((x): x is Spot => x !== null);

interface Src { source: Camera["source"]; prefix: string; credit: string }
const SRC = {
  fi: { source: "digitraffic-fi", prefix: "fi", credit: "Fintraffic / digitraffic.fi, CC BY 4.0" },
  no: { source: "vegvesen-no", prefix: "no", credit: "Statens vegvesen (NLOD)" },
  is: { source: "vegagerdin-is", prefix: "is", credit: "Icelandic Road and Coastal Administration (IRCA), CC BY 4.0" },
  qld: { source: "qldtraffic", prefix: "qld", credit: "QLDTraffic, Department of Transport and Main Roads, CC BY 4.0" },
  bc: { source: "drivebc", prefix: "bc", credit: "DriveBC.ca" },
  wa: { source: "wsdot", prefix: "wa", credit: "WSDOT" },
  or: { source: "odot", prefix: "or", credit: "ODOT TripCheck" },
  ia: { source: "iowadot", prefix: "ia", credit: "Iowa DOT" },
  to: { source: "toronto", prefix: "to", credit: "City of Toronto, Open Government Licence - Toronto" },
  au: { source: "austin", prefix: "au", credit: "City of Austin Transportation" },
  qc: { source: "quebec511", prefix: "qc", credit: "Ministère des Transports et de la Mobilité durable du Québec (Québec 511), CC BY 4.0" },
  tw: { source: "tdx-tw", prefix: "tw", credit: "MOTC Freeway Bureau via TDX, Open Government Data License 1.0" },
} as const satisfies Record<string, Src>;

/**
 * One camera, or null when its id, position or URL does not pass. Images (stills, or Taiwan's
 * MJPEG stream, which an <img> plays) must be on the allow-list; links must be public https.
 * No updatedAt: these pictures are rewritten in place, the list time is not the picture's.
 * Taiwan's stream never ends, so it is no thumbnail.
 */
function spot(s: Src, rawId: unknown, name: string, lat: unknown, lng: unknown, raw: unknown, kind: "image" | "link" = "image"): Spot | null {
  const id = ident(rawId), la = num(lat), ln = num(lng), url = safeCameraUrl(kind, raw);
  if (!id || la === null || ln === null || !validLatLng(la, ln) || !url) return null;
  const thumb = kind === "image" && s.source !== "tdx-tw" ? { thumb: url } : {};
  return { id: `${s.prefix}-${id}`, name: name || id, lat: la, lng: ln, kind, url, ...thumb, source: s.source, credit: s.credit };
}

/** Fintraffic weathercam stations: the first preset in collection of each gathering station. */
export const parseDigitraffic = (data: unknown): Spot[] =>
  keep(rows(obj(data).features).map((f) => {
    const p = obj(f.properties);
    const preset = rows(p.presets).find((x) => x.inCollection !== false && typeof x.id === "string" && /^[A-Z]\d{7}$/.test(x.id))?.id as string | undefined;
    if (p.collectionStatus !== "GATHERING" || !preset) return null;
    const [lat, lng] = xy(f.geometry);
    return spot(SRC.fi, preset, text(p.name).replace(/_/g, " "), lat, lng, `https://weathercam.digitraffic.fi/${preset}.jpg`);
  }));

/** Statens vegvesen DATEX CCTV (WFS GeoJSON): cameras whose still image is available. */
export const parseVegvesen = (data: unknown): Spot[] =>
  keep(rows(obj(data).features).map((f) => {
    const p = obj(f.properties);
    if (p.STATUS_STILL_IMAGE_AVAILABILITY !== "videoOrImagesAvailable") return null;
    const [lat, lng] = xy(f.geometry);
    const name = [text(p.DESCRIPTION, 80), text(p.ROAD_NUMBER, 12), text(p.ORIENTATION_DESCRIPTION, 60)].filter(Boolean).join(", ");
    return spot(SRC.no, p.CAMERA_ID, name, lat, lng, p.STILL_IMAGE_URL);
  }));

/** Vegagerdin camera views; the image file name is the id (a station has several views). */
export const parseVegagerdin = (data: unknown): Spot[] =>
  keep(rows(data).map((c) => {
    const file = /\/vgdata\/vefmyndavelar\/([\w-]{1,40})\.jpg$/i.exec(typeof c.Slod === "string" ? c.Slod : "")?.[1];
    return spot(SRC.is, file, text(c.Skyring) || text(c.Myndavel), c.Breidd, c.Lengd, c.Slod);
  }));

export const parseQldTraffic = (data: unknown): Spot[] =>
  keep(rows(obj(data).features).map((f) => {
    const p = obj(f.properties);
    const [lat, lng] = xy(f.geometry);
    return spot(SRC.qld, p.id, text(p.description), lat, lng, p.image_url);
  }));

/** DriveBC: cameras that are on and not marked stale; the image path is relative to drivebc.ca. */
export const parseDriveBc = (data: unknown): Spot[] =>
  keep(rows(data).map((c) => {
    if (c.is_on !== true || c.marked_stale === true || c.should_appear === false) return null;
    const path = obj(c.links).imageDisplay;
    const id = /^\/images\/(\d{1,7})\.jpg(\?|$)/.exec(typeof path === "string" ? path : "")?.[1];
    const [lat, lng] = xy(c.location);
    return spot(SRC.bc, id, [text(c.name, 60), text(c.caption)].filter(Boolean).join(": "), lat, lng, id && `https://www.drivebc.ca/images/${id}.jpg`);
  }));

/** WSDOT's list also carries a few airport and city cameras on other hosts: only WSDOT's own pass. */
export const parseWsdot = (data: unknown): Spot[] =>
  keep(rows(obj(obj(data).cameras).items).map((c) => spot(SRC.wa, c.id, text(c.title), c.lat, c.lon, c.url)));

/** TripCheck inventory (Esri JSON); the picture is the file name under tripcheck.com/RoadCams/cams/, one id per picture. */
export const parseTripCheck = (data: unknown): Spot[] =>
  keep(rows(obj(data).features).map((f) => {
    const a = obj(f.attributes);
    const file = typeof a.filename === "string" && /^[\w .@()&-]{1,120}\.jpe?g$/i.test(a.filename) ? a.filename : null;
    return spot(SRC.or, a.publishedImageId, text(a.title), a.latitude, a.longitude, file && `https://tripcheck.com/RoadCams/cams/${encodeURIComponent(file)}`);
  }));

/**
 * Iowa DOT (ArcGIS). One device can have several views (rest areas), so the picture's file name is
 * the id. Its HLS streams use port 8888, which the allow-list refuses, so stills only.
 */
export const parseIowaDot = (data: unknown): Spot[] =>
  keep(rows(obj(data).features).map((f) => {
    const a = obj(f.attributes);
    const file = /\/([\w-]{1,40})\.jpe?g$/i.exec(typeof a.ImageURL === "string" ? a.ImageURL : "")?.[1]?.toLowerCase();
    return spot(SRC.ia, file, text(a.Desc_), a.latitude, a.longitude, a.ImageURL);
  }));

export const parseToronto = (data: unknown): Spot[] =>
  keep(rows(obj(data).features).map((f) => {
    const p = obj(f.properties);
    const [lat, lng] = xy(f.geometry);
    return spot(SRC.to, p.REC_ID, [text(p.MAINROAD, 60), text(p.CROSSROAD, 60)].filter(Boolean).join(" / "), lat, lng, p.IMAGEURL);
  }));

export const parseAustin = (data: unknown): Spot[] =>
  keep(rows(data).map((c) => {
    if (c.camera_status !== "TURNED_ON") return null;
    const [lat, lng] = xy(c.location);
    return spot(SRC.au, c.camera_id, text(c.location_name), lat, lng, c.screenshot_address);
  }));

/**
 * Quebec 511: no image URL, only Quebec 511's own viewer page, which sits behind a bot check, so
 * it is a link the person opens (never fetched, framed or proxied here).
 */
export const parseQuebec511 = (data: unknown): Spot[] =>
  keep(rows(obj(data).features).map((f) => {
    const p = obj(f.properties);
    const [lat, lng] = xy(f.geometry);
    const page = typeof p.URL_FLUX_DONNEE === "string" && p.URL_FLUX_DONNEE.startsWith("https://www.quebec511.info/") ? p.URL_FLUX_DONNEE : null;
    return spot(SRC.qc, p.IDEcamera, text(p.DescriptionLocalisationEn) || text(p.DescriptionLocalisationFr), lat, lng, page, "link");
  }));

/** Taiwan freeway CCTV via TDX: the live MJPEG stream on the Freeway Bureau's host. */
export const parseTdxFreeway = (data: unknown): Spot[] =>
  keep(rows(obj(data).CCTVs).map((c) =>
    spot(SRC.tw, c.CCTVID, [text(c.RoadName, 30), text(c.LocationMile, 12), text(c.RoadDirection, 4)].filter(Boolean).join(" "), c.PositionLat, c.PositionLon, c.VideoStreamURL),
  ));

const getJson = async (url: string, headers: Record<string, string> = {}): Promise<unknown> =>
  (await get(url, { headers: { Accept: "application/json", ...headers } })).json();

interface Regional {
  src: Src;
  /** Where its cameras are, [S, W, N, E], from the lists on 2026-11-21: fetched only within 60 km of one. */
  boxes: readonly Box[];
  /** Free keys the owner registers for, by env name: without all of them the source is skipped silently (not an outage). */
  need?: readonly string[];
  /** Gets the values of `need`, in order. */
  load: (keys: string[]) => Promise<Spot[]>;
}

/** Each list is cached a day per server instance; cameras are shown within 60 km, nearest 12. */
const REGIONAL: readonly Regional[] = [
  {
    src: SRC.fi, boxes: [[59.86, 19.62, 70.09, 31.28]],
    // Digitraffic asks every client to name itself and accept gzip.
    load: async () => parseDigitraffic(await getJson("https://tie.digitraffic.fi/api/weathercam/v1/stations", { "Digitraffic-User": "Aspire/1.0", "Accept-Encoding": "gzip" })),
  },
  {
    src: SRC.no, boxes: [[58.07, 5.02, 63.48, 12.7], [63.55, 9.05, 66.99, 15.82], [67.0, 12.07, 71.16, 31.03]],
    load: async () => parseVegvesen(await getJson("https://ogckart-sn1.atlas.vegvesen.no/datex_3_1/wfs?service=WFS&version=2.0.0&request=GetFeature&typeNames=datex_3_1:CctvSimple_v2&outputFormat=application/json&srsName=EPSG:4326")),
  },
  { src: SRC.is, boxes: [[63.45, -23.86, 66.33, -13.85]], load: async () => parseVegagerdin(await getJson("https://gagnaveita.vegagerdin.is/api/vefmyndavelar2014_1")) },
  {
    src: SRC.qld, boxes: [[-28.17, 145.74, -16.95, 153.52]], need: ["QLDTRAFFIC_API_KEY"],
    // QLDTraffic takes its key as a query parameter; get() errors name only the host.
    load: async ([key]) => parseQldTraffic(await getJson(`https://api.qldtraffic.qld.gov.au/v1/webcams?apikey=${encodeURIComponent(key)}`)),
  },
  { src: SRC.bc, boxes: [[48.39, -132.14, 60.0, -114.71]], load: async () => parseDriveBc(await getJson("https://www.drivebc.ca/api/webcams/")) },
  { src: SRC.wa, boxes: [[45.57, -124.33, 49.0, -117.05]], load: async () => parseWsdot(await getJson("https://data.wsdot.wa.gov/mobile/Cameras.json")) },
  {
    src: SRC.or, boxes: [[41.38, -124.49, 46.9, -116.78]],
    // Served as application/javascript: TripCheck answers 406 to a JSON-only Accept.
    load: async () => parseTripCheck(await getJson("https://tripcheck.com/Scripts/map/data/cctvinventory.js", { Accept: "application/json, */*" })),
  },
  {
    src: SRC.ia, boxes: [[40.39, -96.48, 43.45, -90.17]],
    load: async () => parseIowaDot(await getJson("https://services.arcgis.com/8lRhdTsQyJpO52F1/arcgis/rest/services/Traffic_Cameras_View/FeatureServer/0/query?where=1%3D1&outFields=Desc_,ImageURL,latitude,longitude&f=json")),
  },
  {
    src: SRC.to, boxes: [[43.61, -79.6, 43.82, -79.15]],
    load: async () => parseToronto(await getJson("https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/a3309088-5fd4-4d34-8297-77c8301840ac/resource/4a568300-c7f8-496d-b150-dff6f5dc6d4f/download/traffic-camera-list-4326.geojson")),
  },
  { src: SRC.au, boxes: [[30.11, -97.9, 30.5, -97.59]], load: async () => parseAustin(await getJson("https://data.austintexas.gov/resource/b4k4-adkb.json?camera_status=TURNED_ON&$limit=2000")) },
  {
    src: SRC.qc, boxes: [[45.01, -79.02, 52.82, -57.11]],
    load: async () => parseQuebec511(await getJson("https://ws.mapserver.transports.gouv.qc.ca/swtq?service=wfs&version=2.0.0&request=getfeature&typename=ms:infos_cameras&outputformat=geojson&srsName=EPSG:4326")),
  },
  {
    // TDX answers 401 without a key. A client-credentials token (the secret only in the POST body),
    // fetched with the list, which is cached a day.
    src: SRC.tw, boxes: [[21.9, 120.0, 25.35, 122.0]], need: ["TDX_CLIENT_ID", "TDX_CLIENT_SECRET"],
    load: async ([id, secret]) => {
      const res = await get("https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body: new URLSearchParams({ grant_type: "client_credentials", client_id: id, client_secret: secret }).toString(),
      });
      const token = obj(await res.json()).access_token;
      if (typeof token !== "string" || !/^[\w.~+/=-]{10,4000}$/.test(token)) throw new Error("tdx token");
      return parseTdxFreeway(await getJson("https://tdx.transportdata.tw/api/basic/v2/Road/Traffic/CCTV/Freeway?%24format=JSON", { Authorization: `Bearer ${token}` }));
    },
  },
];

// ---- (d) YouTube live streams -----------------------------------------------------------------
/**
 * search.list costs 100 units of the project's 10,000/day, shared with play_video (lib/youtube.ts)
 * and counted per server instance: keep it small, and give each person a few new cells a day.
 */
const YT_DAILY_SEARCHES = 20;
const YT_PER_USER = 5;
/** A stream found live can end: each one carries the search time (updatedAt), shown as "live when checked". */
const YT_TTL = 30 * 60_000;
let ytUsage = { day: "", count: 0 };
const ytPerUser = new Map<string, number>();
const ytDay = () => {
  const day = new Date().toISOString().slice(0, 10);
  if (ytUsage.day !== day) {
    ytUsage = { day, count: 0 };
    ytPerUser.clear();
  }
};

interface YtSnippet { title?: unknown; description?: unknown; channelTitle?: unknown; tags?: unknown; categoryId?: unknown }
interface YtSearch { items?: { id?: { videoId?: unknown }; snippet?: YtSnippet & { thumbnails?: { medium?: { url?: unknown } } } }[] }
interface YtVideos { items?: { id?: unknown; snippet?: YtSnippet; recordingDetails?: { location?: { latitude?: unknown; longitude?: unknown } } }[] }

/** YouTube's "Music" and "Gaming" video categories: never a camera on a place (24/7 mixes say "city" too). */
const YT_NOT_CAMERA = new Set(["10", "20"]);
const wholeWords = (ws: string[]) => `(?<![\\p{L}\\p{N}])(?:${ws.join("|")})(?![\\p{L}\\p{N}])`;
/** Game names and game-only words (GTA roleplay and the like): a game stream wherever they appear. */
const GAME_NAMES = [
  // GTA, GTA V, GTA 5 RP, GTA5RP, GTAVRP, GTA Online, GTAO, #gtarp (not GTAA; no bare "Los Santos", a real town name)
  "gta(?:\\s?(?:v|vi|iv|[4-6]))?(?:\\s?(?:online|o|rp))?", "grand\\s?theft\\s?auto", "role-?\\s?play(?:ing)?", "fivem", "nopixel", "lspd", "redm",
  "minecraft", "fortnite", "roblox", "gameplay", "playthrough", "let[’'`]?s\\s?play",
  "ets\\s?2", "euro\\s?truck\\p{L}*", "cities:?\\s?skylines", "beamng\\p{L}*", "msfs", "cyberpunk\\s?2077",
  "the\\s?sims", "v-?tubers?", "stream\\s?snip\\p{L}*", "speed\\s?run\\p{L}*", "valorant",
  "pubg", "cs2", "cs:?go", "apex\\s?legends", "call\\s?of\\s?duty",
  "летсплей", // ru
];
/**
 * Game words that also mean other things ("Las Vegas gaming", "live on Twitch", "in a warzone",
 * Olympic игры): a game stream only in the title, channel or tags, never the description.
 */
const GAME_WORDS = [
  "gaming", "gamer", "walkthrough", "simulators?", "twitch", "warzone", "watch[\\s_]?dogs",
  "игр(?:а|ы|у|е|ой|ам|ами|ах)?", "игров\\p{L}*(?!\\s?площадк)", "прохождение", // ru, not a playground (игровая площадка)
  "тоглоом\\p{L}*(?!\\s?талбай)", // mn, not a playground (тоглоомын талбай)
  "(?:computer|video)spiel(?:e|en)?", "(?<!(?:dem|vom|zum|beim)\\s)spiel(?:e|en)?", "zock\\p{L}*", // de, not a match ("vor dem Spiel")
];
const GAME = new RegExp(`${wholeWords(GAME_NAMES)}|电竞|電競`, "iu");
const GAME_WORD = new RegExp(`${wholeWords(GAME_WORDS)}|游戏|遊戲|游戲`, "iu");
/**
 * A positive sign the stream is a camera on a place, not a show (cámara, câmera, caméra, telecamera,
 * Wetterkamera, kelikamera, kamery, カメラ, 카메라, 即時影像 too).
 */
const CAMERA_WORDS = new RegExp(
  "(?<![\\p{L}\\p{N}])(?:live\\s?cams?|web\\s?cams?|cams?|c[aáâ]m[eaé]ras?|tele\\s?camer[ae]|cctv|streets?|traffic|city|panorama\\p{L}*|\\p{L}*kamer(?:as?|y)|веб-?камер\\p{L}*|камер\\p{L}*)(?![\\p{L}\\p{N}])|镜头|鏡頭|摄像|攝像|监控|監控|即時影像|即时影像|实时影像|實時影像|カメラ|카메라|라이브\\s?캠",
  "iu",
);

/**
 * A live stream that is a camera on a place: not in YouTube's Music or Gaming category, no game
 * name in its title, description, channel or tags, no other game word in its title, channel or
 * tags, and a camera word in its title or description.
 */
export function isCameraStream(s: YtSnippet): boolean {
  if (YT_NOT_CAMERA.has(String(s.categoryId ?? ""))) return false;
  const tags = Array.isArray(s.tags) ? s.tags.filter((t): t is string => typeof t === "string").join(" | ") : "";
  const title = text(s.title, 300), about = text(s.description, 5000);
  const label = [title, text(s.channelTitle, 200), text(tags, 2000)].join(" \n ");
  return !GAME.test(`${label} \n ${about}`) && !GAME_WORD.test(label) && CAMERA_WORDS.test(`${title} \n ${about}`);
}

/**
 * Live streams posted with a position that look like cameras (isCameraStream). Streams YouTube
 * gives no position for are left out (no guessed distance).
 */
export function parseYouTube(search: unknown, videos: unknown): Spot[] {
  const where = new Map<string, LatLng>();
  const about = new Map<string, YtSnippet>();
  for (const v of (videos as YtVideos | null)?.items ?? []) {
    if (!isVideoId(v?.id)) continue;
    if (v.snippet && typeof v.snippet === "object") about.set(v.id, v.snippet);
    const lat = num(v.recordingDetails?.location?.latitude), lng = num(v.recordingDetails?.location?.longitude);
    if (lat !== null && lng !== null && validLatLng(lat, lng)) where.set(v.id, { lat, lng });
  }
  const out: Spot[] = [];
  for (const it of (search as YtSearch | null)?.items ?? []) {
    const id = it?.id?.videoId;
    const at = isVideoId(id) ? where.get(id) : undefined;
    // The videos.list snippet (full description, tags, category) over search's short one.
    if (!isVideoId(id) || !at || !isCameraStream({ ...it.snippet, ...about.get(id) })) continue;
    const thumb = safeImageUrl(it.snippet?.thumbnails?.medium?.url) ?? undefined;
    const channel = text(it.snippet?.channelTitle, 80);
    out.push({
      id: `yt-${id}`, name: text(it.snippet?.title) || "YouTube live", ...at, kind: "video",
      url: `https://www.youtube-nocookie.com/embed/${id}`, ...(thumb ? { thumb } : {}),
      source: "youtube", credit: channel ? `${channel} (YouTube)` : "YouTube",
    });
  }
  return out;
}

function youtube(at: LatLng, userId?: string): Promise<Spot[]> {
  const key = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (!key) return Promise.resolve([]); // not set up: nothing to show, not an outage
  const c = { lat: cell(at.lat), lng: cell(at.lng) };
  const k = `yt:${c.lat},${c.lng}`;
  const hit = cache.get(k);
  const shared = (hit && Date.now() - hit.at < YT_TTL) || inflight.has(k);
  if (!shared && userId) {
    ytDay();
    // This person's new cells for today are used up: no YouTube for them (not cached, not an outage).
    if ((ytPerUser.get(userId) ?? 0) >= YT_PER_USER) return Promise.resolve([]);
  }
  return cached(k, YT_TTL, async () => {
    ytDay();
    if (ytUsage.count >= YT_DAILY_SEARCHES) throw new Error("youtube daily cap");
    ytUsage.count++;
    if (userId) ytPerUser.set(userId, (ytPerUser.get(userId) ?? 0) + 1);
    const headers = { "x-goog-api-key": key, Accept: "application/json" };
    const q = new URLSearchParams({
      part: "snippet", type: "video", eventType: "live", location: `${c.lat},${c.lng}`, locationRadius: "50km", maxResults: "8", safeSearch: "moderate",
    });
    const search = (await (await get(`https://www.googleapis.com/youtube/v3/search?${q}`, { headers })).json()) as YtSearch;
    const ids = (search.items ?? []).map((i) => i?.id?.videoId).filter(isVideoId);
    if (!ids.length) return [];
    // One call (1 unit): position, plus category, tags and full text to leave game streams out.
    const v = new URLSearchParams({ part: "snippet,recordingDetails", id: ids.join(",") }); // maxResults is not allowed with id
    const videos = await (await get(`https://www.googleapis.com/youtube/v3/videos?${v}`, { headers })).json();
    const checked = new Date().toISOString();
    return parseYouTube(search, videos).map((s) => ({ ...s, updatedAt: checked }));
  });
}

// ---- (e) OpenStreetMap webcams ----------------------------------------------------------------
interface OsmElement { type?: unknown; id?: unknown; lat?: unknown; lon?: unknown; tags?: Record<string, unknown> }

export function parseOverpass(data: unknown): Spot[] {
  const els = (data as { elements?: OsmElement[] } | null)?.elements;
  if (!Array.isArray(els)) return [];
  const out: Spot[] = [];
  for (const e of els) {
    const lat = num(e?.lat), lng = num(e?.lon);
    const tags = e?.tags && typeof e.tags === "object" ? e.tags : {};
    const url = ["contact:webcam", "url:webcam", "webcam"]
      .flatMap((k) => (typeof tags[k] === "string" ? (tags[k] as string).split(";") : []))
      .map((u) => safeCameraUrl("link", u))
      .find((u): u is string => !!u);
    const id = num(e?.id);
    if (lat === null || lng === null || !validLatLng(lat, lng) || !url || id === null) continue;
    out.push({ id: `osm-${Math.trunc(id)}`, name: text(tags.name) || text(tags.description) || "Webcam", lat, lng, kind: "link", url, source: "osm", credit: CREDIT.osm });
  }
  return out;
}

/** A cell whose Overpass lookup failed rests (Overpass is shared and free: not asked again for 10 minutes). */
function overpass(at: LatLng): Promise<Spot[]> {
  const c = { lat: cell(at.lat), lng: cell(at.lng) };
  const key = `osm:${c.lat},${c.lng}`;
  return resting(key, () => cached(key, DAY, async () => {
    // 33 km around the cell centre covers 25 km around any point in the cell; filtered below.
    const around = `(around:33000,${c.lat.toFixed(1)},${c.lng.toFixed(1)})`;
    // Server timeout the same as our own budget; `out 400` so the distance sort sees every candidate.
    const query = `[out:json][timeout:${OVERPASS_BUDGET_MS / 1000}];(node${around}["contact:webcam"];node${around}["url:webcam"];node${around}["webcam"];);out 400;`;
    // The mirrors in order (lib/osm-stops.ts; resting ones skipped), one shared budget.
    const deadline = Date.now() + OVERPASS_BUDGET_MS;
    let last: unknown = new Error("overpass mirrors resting");
    for (const url of mirrorsUp()) {
      const left = deadline - Date.now();
      if (left < 1_000) break;
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
          body: `data=${encodeURIComponent(query)}`,
          signal: AbortSignal.timeout(Math.min(TIMEOUT_MS, left)),
          cache: "no-store",
          redirect: "error",
        });
        noteMirror(url, res);
        if (!res.ok) throw new Error(`overpass ${new URL(url).host} ${res.status}`);
        return parseOverpass(await res.json());
      } catch (e) {
        last = e;
      }
    }
    throw last;
  }));
}

// ---- all together -----------------------------------------------------------------------------
/**
 * Cameras near `at`, sources in the order above, de-duplicated by id and URL.
 * `userId` (the signed-in person) bounds how many new YouTube searches they can cause per day.
 */
export async function findCameras(at: LatLng, opts: { userId?: string } = {}): Promise<CameraResult> {
  if (!validLatLng(at.lat, at.lng)) throw new Error("bad position");
  const near = (c: LatLng) => haversineKm(at, c) <= GOV_RADIUS_KM;
  const jobs: [Camera["source"], Promise<Camera[]>][] = [];
  if (near(LONDON)) jobs.push(["tfl", tfl().then((s) => nearest(s, at, GOV_RADIUS_KM))]);
  if (near(SINGAPORE)) jobs.push(["lta-sg", singapore().then((s) => nearest(s, at, GOV_RADIUS_KM))]);
  if (near(HONG_KONG)) jobs.push(["td-hk", hongKong().then((s) => nearest(s, at, GOV_RADIUS_KM))]);
  // Every nearby district list or none: a district that fails is said, not silently left out.
  const districts = caltransDistricts(at);
  if (districts.length) jobs.push(["caltrans", Promise.all(districts.map(caltrans)).then((s) => nearest(s.flat(), at, GOV_RADIUS_KM))]);
  if (nearBox(at, NZ_BOX, GOV_RADIUS_KM)) jobs.push(["nzta", nzta().then((s) => nearest(s, at, GOV_RADIUS_KM))]);
  for (const r of REGIONAL) {
    const keys = (r.need ?? []).map(env);
    if (keys.every(Boolean) && r.boxes.some((b) => nearBox(at, b, GOV_RADIUS_KM)))
      jobs.push([r.src.source, resting(r.src.source, () => cached(r.src.source, DAY, () => r.load(keys))).then((s) => nearest(s, at, GOV_RADIUS_KM))]);
  }
  jobs.push(["youtube", youtube(at, opts.userId).then((s) => nearest(s, at, 50, 8))]);
  jobs.push(["osm", overpass(at).then((s) => nearest(s, at, 25))]);

  // A source still loading at the deadline is named; its load goes on and fills the cache for a later ask.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error("camera source too slow"), { name: "TimeoutError" })), DEADLINE_MS);
  });
  const settled = await Promise.allSettled(jobs.map(([, p]) => Promise.race([p, late]))).finally(() => clearTimeout(timer));
  const unavailable: Camera["source"][] = [];
  const all = [...cityPages(at)];
  settled.forEach((r, i) => {
    if (r.status === "fulfilled") all.push(...r.value);
    else {
      unavailable.push(jobs[i][0]);
      console.error("cameras:", jobs[i][0], r.reason instanceof Error ? r.reason.name : "error");
    }
  });

  const seen = new Set<string>();
  const cameras: Camera[] = [];
  for (const c of all) {
    const ok = safeCameraUrl(c.kind, c.url); // last check, whatever the parser did
    if (!ok || seen.has(c.id) || seen.has(ok)) continue;
    seen.add(c.id).add(ok);
    cameras.push({ ...c, url: ok });
    if (cameras.length >= MAX_CAMERAS) break;
  }
  return { cameras, credit: [...new Set(cameras.map((c) => c.credit))], unavailable, updatedAt: new Date().toISOString() };
}
