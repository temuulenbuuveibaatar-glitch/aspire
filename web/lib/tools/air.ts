// Air quality in detail: every pollutant now and the worst AQI of the next days, from Open-Meteo's
// CAMS air-quality model (free, no key). get_air_quality keeps its Google-first reading (world.ts)
// and gains this detail; the dashboard's air card gets the same (lib/ambient.ts). Only the ~1 km
// cell is sent. Memoised 30 minutes per cell; failures are not.
import { type AqiCategory, aqiCategory } from "@/lib/ambient-types";
import { UA } from "@/lib/site";
import { airQuality as reading, NO_PLACE, openMeteoGeocode } from "./world";
import { str, type Tool, type ToolContext } from "./types";

/** Micrograms per cubic metre, null when the model has no value. */
export interface Pollutants {
  pm25: number | null;
  pm10: number | null;
  o3: number | null;
  no2: number | null;
  so2: number | null;
  co: number | null;
}
export type Pollutant = keyof Pollutants;

export interface AirDay {
  date: string; // YYYY-MM-DD, the place's own date
  maxAqi: number;
  category: AqiCategory;
}

export interface AirDetail {
  /** US AQI now. */
  aqi: number;
  pollutants: Pollutants;
  /** The pollutant with the highest US sub-index now: what makes the air bad. */
  dominant: Pollutant | null;
  /** Today and the next days (up to 4), worst hour of each. */
  forecast: AirDay[];
}

const FIELDS: Record<Pollutant, string> = { pm25: "pm2_5", pm10: "pm10", o3: "ozone", no2: "nitrogen_dioxide", so2: "sulphur_dioxide", co: "carbon_monoxide" };
const fin = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Open-Meteo's answer -> AirDetail; null without a current US AQI (never "good" by default). */
export function parseAirDetail(d: unknown): AirDetail | null {
  const o = (d && typeof d === "object" ? d : {}) as { current?: Record<string, unknown>; hourly?: { time?: unknown[]; us_aqi?: unknown[] } };
  const c = o.current ?? {};
  const aqi = fin(c.us_aqi);
  if (aqi === null) return null;
  const pollutants = Object.fromEntries(Object.entries(FIELDS).map(([k, f]) => {
    const v = fin(c[f]);
    return [k, v === null ? null : Math.round(v * 10) / 10];
  })) as unknown as Pollutants;
  let dominant: Pollutant | null = null, top = -1;
  for (const [k, f] of Object.entries(FIELDS) as [Pollutant, string][]) {
    const sub = fin(c[`us_aqi_${f}`]);
    if (sub !== null && sub > top) [dominant, top] = [k, sub];
  }
  const worst = new Map<string, number>();
  const times = Array.isArray(o.hourly?.time) ? o.hourly.time : [];
  times.forEach((t, i) => {
    const v = fin(o.hourly?.us_aqi?.[i]);
    if (typeof t !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(t) || v === null) return;
    const day = t.slice(0, 10);
    worst.set(day, Math.max(worst.get(day) ?? 0, Math.round(v)));
  });
  const forecast = [...worst].slice(0, 4).map(([date, maxAqi]) => ({ date, maxAqi, category: aqiCategory(maxAqi) }));
  return { aqi: Math.round(aqi), pollutants, dominant, forecast };
}

const memo = new Map<string, { at: number; value: AirDetail | null }>();
const TTL_MS = 30 * 60_000;

/** Tests only. */
export const resetAirDetail = () => memo.clear();

/** Pollutants now and the coming days at a point (rounded to ~1 km). Throws when Open-Meteo fails. */
export async function airDetail(lat: number, lng: number): Promise<AirDetail | null> {
  const la = r2(lat), ln = r2(lng);
  const key = `${la},${ln}`;
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const vars = Object.values(FIELDS);
  const q = new URLSearchParams({
    latitude: String(la), longitude: String(ln),
    current: ["us_aqi", ...vars, ...vars.map((v) => `us_aqi_${v}`)].join(","),
    hourly: "us_aqi", forecast_days: "4", timezone: "auto",
  });
  const res = await fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?${q}`, { redirect: "error", headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8_000) });
  if (!res.ok) throw new Error(`air-quality-api.open-meteo.com returned ${res.status}`);
  const value = parseAirDetail(await res.json());
  memo.set(key, { at: Date.now(), value });
  if (memo.size > 300) memo.delete(memo.keys().next().value!);
  return value;
}

/** Where to read the detail: the shared or network position (as world.ts), else the named place. */
async function pointFor(place: string, ctx: ToolContext): Promise<{ lat: number; lng: number } | null> {
  const here = place ? null : (ctx.device.location ?? ctx.approxLocation);
  if (here) return here;
  const q = place || ctx.city;
  return q ? openMeteoGeocode(q).catch(() => null) : null;
}

/** get_air_quality: the reading from world.ts, plus pollutants and the next days when known. */
export const airQuality: Tool = {
  ...reading,
  description:
    "Air pollution for any place in the world: US AQI and level now, each pollutant (PM2.5, PM10, ozone, nitrogen dioxide, sulphur dioxide, carbon monoxide, in micrograms per cubic metre), which one dominates, and the worst AQI of today and the next 3 days. With an empty place it uses where the person is. Use it for 'is the air bad', 'can I go for a run', 'will the smog be better tomorrow'; give simple advice (mask, stay inside, air the room later) when AQI > 100: smog is a real health risk for elderly people and children.",
  async run(input, ctx) {
    const out = (await reading.run(input, ctx)) as Record<string, unknown>;
    if (!out || "error" in out) return out ?? { error: NO_PLACE };
    const at = await pointFor(str(input.place, 80), ctx);
    const detail = at ? await airDetail(at.lat, at.lng).catch(() => null) : null;
    return detail ? { ...out, pollutants: detail.pollutants, dominant: detail.dominant, forecast: detail.forecast, detailSource: "open-meteo (CAMS)" } : out;
  },
};
