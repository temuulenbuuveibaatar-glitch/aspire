// Google Maps tools: directions (transit / walking / driving) and places, anywhere in the world.
// Results are plain data; each one also puts an "Open in Google Maps" card on the screen.
import { isGoogleMapsUrl } from "@/lib/links";
import { computeRoute, mapsConfigured, NOT_SET_UP, searchPlaces, type TravelMode } from "@/lib/maps";
import { bool, str, type Tool, type ToolContext } from "./types";

const MODES: readonly TravelMode[] = ["transit", "walk", "drive"];
const MAX_CARDS = 3;

const errorOf = (e: unknown) => ({ error: e instanceof Error ? e.message : "Maps failed" });
const here = (ctx: ToolContext) => ctx.device.location;

function mapCard(ctx: ToolContext, title: string, url: string) {
  if (title && isGoogleMapsUrl(url)) ctx.actions.push({ type: "map", title: title.slice(0, 120), url });
}

export const getDirections: Tool = {
  name: "get_directions",
  label: { icon: "🧭", mn: "Чиглэл", en: "Directions" },
  description:
    "Route from A to B anywhere with Google Maps: public transport (bus/train lines, stop names, departure and arrival times, number of stops), walking or driving. Gives total minutes and up to 8 steps, and shows an 'Open in Google Maps' button. Places can be names or addresses (add the city, e.g. 'Эрдэнэт, Нэгдсэн эмнэлэг') or 'lat,lng'.",
  parameters: {
    type: "object",
    properties: {
      origin: { type: "string", description: "Start place or address. Empty string = the person's current location (if they shared it)." },
      destination: { type: "string", description: "Destination place or address, with the city" },
      mode: { type: "string", description: "How to travel", enum: [...MODES] },
    },
    required: ["origin", "destination", "mode"],
  },
  async run(input, ctx) {
    if (!mapsConfigured()) return { error: NOT_SET_UP };
    const destination = str(input.destination, 200);
    if (!destination) return { error: "destination is required" };
    let origin = str(input.origin, 200);
    if (!origin) {
      const loc = here(ctx);
      if (!loc) {
        return { error: "No starting point: ask where they start from, or suggest turning on 'Use my location' in Settings" };
      }
      origin = `${loc.lat},${loc.lng}`;
    }
    const mode = (MODES as readonly string[]).includes(str(input.mode, 10)) ? (str(input.mode, 10) as TravelMode) : "transit";
    try {
      const route = await computeRoute({ origin, destination, mode, departureTime: ctx.now.toISOString(), lang: ctx.lang ?? "en" });
      mapCard(ctx, destination, route.mapsUrl);
      return { ...route, mode };
    } catch (e) {
      return errorOf(e);
    }
  },
};

export const findPlaces: Tool = {
  name: "find_places",
  label: { icon: "📍", mn: "Газар хайх", en: "Places" },
  description:
    "Find places with Google Maps (pharmacy, hospital, restaurant, ATM, hotel, shop, a named place): name, address, rating, open now, distance. Near the person's location when they shared it; otherwise put the city in the query (e.g. 'pharmacy in Erdenet'). Shows 'Open in Google Maps' buttons.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "What to look for, with the city if the person's location is unknown" },
      open_now: { type: "boolean", description: "true = only places open right now" },
    },
    required: ["query", "open_now"],
  },
  async run(input, ctx) {
    if (!mapsConfigured()) return { error: NOT_SET_UP };
    const query = str(input.query, 200);
    if (!query) return { error: "query is required" };
    try {
      const places = await searchPlaces({ query, near: here(ctx), openNow: bool(input.open_now), lang: ctx.lang ?? "en", max: 5 });
      for (const p of places.slice(0, MAX_CARDS)) mapCard(ctx, p.name, p.mapsUrl);
      return places.length ? { places, nearYou: Boolean(here(ctx)) } : { places, note: "Nothing found; try other words or add the city" };
    } catch (e) {
      return errorOf(e);
    }
  },
};
