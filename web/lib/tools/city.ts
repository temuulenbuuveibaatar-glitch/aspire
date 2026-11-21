// City feed tools: live traffic, parking and fuel. Erdenet: the city's open feeds (Orkhon ТКХДТ).
// Ulaanbaatar: no open feed, so the official live cameras page is named. Elsewhere: said plainly.
// Every figure carries its age (ageS, seconds); unknown stays unknown; a dead feed is reported.
import { byDistance, cityAt, CREDIT, getFuel, getParking, getTraffic, STALE_TRAFFIC_S } from "@/lib/erdenet-city";
import { ERDENET_CENTER, type LatLng } from "@/lib/geo";
import { str, type Tool, type ToolContext } from "./types";

const ERDENET_NAME = /erdenet|эрдэнэт|额尔登特/i;
const UB_NAME = /ulaanbaatar|ulan.?bator|улаанбаатар|улан-батор|乌兰巴托/i;
const FUELS = ["AI92", "AI95", "DIESEL", "GAS", "EURO92"];

const TRUTH =
  "Report only what the data says, with its age (ageS in seconds: say e.g. '2 minutes ago' when over 60). 'unknown' means no one has reported it: say it is not known; never guess. If the result says the feed is down, say so.";

/** Where the person is: shared location (precise), network position, then the city name. at is null for another named city; null = unknown. */
function where(ctx: ToolContext): { at: LatLng | null; precise: boolean } | null {
  if (ctx.device.location) return { at: ctx.device.location, precise: true };
  if (ctx.approxLocation) return { at: ctx.approxLocation, precise: false };
  if (!ctx.city) return null;
  return { at: ERDENET_NAME.test(ctx.city) ? ERDENET_CENTER : UB_NAME.test(ctx.city) ? { lat: 47.92, lng: 106.92 } : null, precise: false };
}
const cityOf = (at: LatLng | null) => (at ? cityAt(at.lat, at.lng) : null);

const ageS = (iso: string | null, ctx: ToolContext) => (iso ? Math.max(0, Math.round((ctx.now.getTime() - Date.parse(iso)) / 1000)) : null);
const SOURCE = { source: "erdenet-city", credit: CREDIT } as const;
const down = (what: string) => ({ liveDataUnavailable: true, error: `Erdenet's ${what} feed is not answering. Say exactly that; do not guess. Suggest trying again in a minute.` });

/** Not Erdenet: why there is no city data, with the official camera page in Ulaanbaatar. */
function elsewhere(ctx: ToolContext, what: string) {
  const w = where(ctx);
  if (!w) return { error: "Location unknown: ask which city they are in, or suggest turning on 'Use my location' in Settings." };
  if (cityOf(w.at) === "ulaanbaatar") {
    return {
      error: `Ulaanbaatar has no open ${what} feed this app may use.`,
      liveCameras: "https://ubtraffic.mn",
      credit: "ЗХУТ",
      hint: "The city's Traffic Management Center shows live cameras at ubtraffic.mn. For drive times with traffic use get_directions with mode 'drive'.",
    };
  }
  const hint = what === "traffic"
    ? "For drive times with live traffic use get_directions with mode 'drive'."
    : `Then call find_places with query '${what === "fuel" ? "fuel station" : "parking"}' (add the city name when the location is unknown) and open_now true, to show the nearest ones.`;
  return { error: `No live ${what} data for this city yet. Say so honestly.`, hint };
}

const inErdenet = (ctx: ToolContext) => {
  const w = where(ctx);
  return w?.at && cityOf(w.at) === "erdenet" ? { at: w.at, precise: w.precise } : null;
};

export const getTrafficTool: Tool = {
  name: "get_traffic",
  label: { mn: "Замын хөдөлгөөн", en: "Traffic" },
  description:
    "Live road traffic in the person's city. In Erdenet, Mongolia: the city's traffic cameras count vehicles and rate the load (low, medium, high) at each junction, with a city-wide level and the busiest places; also the city's live camera page. In Ulaanbaatar: points to the official live cameras (ubtraffic.mn). Elsewhere: says there is no city feed (use get_directions 'drive' for traffic delays). " +
    TRUTH,
  parameters: {
    type: "object",
    properties: { street: { type: "string", description: "Junction or street the person asked about, in Mongolian Cyrillic for Erdenet (e.g. 'Хойд дугуй'). Empty string = the whole city." } },
    required: ["street"],
  },
  async run(input, ctx) {
    if (!inErdenet(ctx)) return elsewhere(ctx, "traffic");
    const q = str(input.street, 80).toLowerCase();
    try {
      const { cameras, summary } = await getTraffic(ctx.now.getTime());
      const shown = q ? cameras.filter((c) => c.name.toLowerCase().includes(q)) : cameras;
      return {
        level: summary.level ?? "unknown",
        busiest: summary.busiest,
        ageS: ageS(summary.updatedAt, ctx),
        cameras: shown.slice(0, 16).map((c) => {
          const age = ageS(c.detectedAt, ctx)!;
          return { name: c.name, vehicles: c.vehicles ?? "unknown", load: c.load ?? "unknown", ageS: age, ...(age > STALE_TRAFFIC_S ? { stale: true } : {}) };
        }),
        ...(q && !shown.length ? { note: `No camera named like "${q}": the list is every camera.`, all: cameras.map((c) => c.name) } : {}),
        liveCameras: "https://dedtuv.erdenet.mn/live",
        ...SOURCE,
      };
    } catch {
      return down("traffic camera");
    }
  },
};

export const getParkingTool: Tool = {
  name: "get_parking",
  label: { mn: "Зогсоол", en: "Parking" },
  description:
    "Free parking spaces in Erdenet, Mongolia, per car park (counted by the city's cameras, so approximate), nearest first when the person shared their location. Other cities: no feed; use find_places for nearby parking instead. " +
    TRUTH,
  parameters: { type: "object", properties: {}, required: [] },
  async run(_input, ctx) {
    const w = inErdenet(ctx);
    if (!w) return elsewhere(ctx, "parking");
    try {
      const { lots, updatedAt } = await getParking();
      const list = w.precise ? byDistance(lots, w.at) : lots;
      return {
        lots: list.slice(0, 8).map((l) => ({ name: l.name, free: l.free ?? "unknown", total: l.total, ...("distanceM" in l ? { distanceM: l.distanceM } : {}) })),
        ageS: ageS(updatedAt, ctx),
        approx: "Counts come from camera vision: say 'about'.",
        ...SOURCE,
      };
    } catch {
      return down("parking");
    }
  },
};

export const getFuelTool: Tool = {
  name: "get_fuel",
  label: { mn: "Шатахуун", en: "Fuel" },
  description:
    "Which fuel stations in Erdenet, Mongolia are selling each fuel (AI92, AI95, DIESEL, GAS, EURO92), with community queue reports, nearest first when the person shared their location. Most stations report nothing: 'unknown' means not known, never 'sold out'. Other cities: no feed; use find_places for nearby fuel stations instead. " +
    TRUTH,
  parameters: {
    type: "object",
    properties: { fuel: { type: "string", description: "Fuel type asked about, or empty string for all", enum: ["", ...FUELS] } },
    required: ["fuel"],
  },
  async run(input, ctx) {
    const w = inErdenet(ctx);
    if (!w) return elsewhere(ctx, "fuel");
    const fuel = FUELS.includes(str(input.fuel, 10).toUpperCase()) ? str(input.fuel, 10).toUpperCase() : "";
    try {
      const all = await getFuel();
      const near = w.precise ? byDistance(all, w.at) : all;
      const stations = near.map((s) => ({
        name: s.name,
        org: s.org,
        ...("distanceM" in s ? { distanceM: s.distanceM } : {}),
        fuels: s.fuels.filter((f) => !fuel || f.type === fuel).map((f) => ({ type: f.type, status: f.status, ageS: ageS(f.updatedAt, ctx) ?? "unknown", ...(f.queue ? { queue: f.queue, queueAgeS: ageS(f.queueAt ?? null, ctx) } : {}), ...(f.source ? { source: f.source } : {}) })),
      }));
      // Stations with something known first; the rest are only counted.
      const known = stations.filter((s) => s.fuels.some((f) => f.status !== "unknown"));
      return {
        stations: known.slice(0, 8),
        stationsWithNoReport: stations.length - known.length,
        ...(known.length ? {} : { note: "No station has reported fuel status: say it is not known right now." }),
        ...SOURCE,
      };
    } catch {
      return down("fuel");
    }
  },
};

export const cityTools: Tool[] = [getTrafficTool, getParkingTool, getFuelTool];
