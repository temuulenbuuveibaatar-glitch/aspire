// find_cameras: public cameras near a place (lib/cameras.ts). The CameraAction it returns
// (lib/tools/camera-types.ts) opens CameraSheet on the device.
import { findCameras } from "@/lib/cameras";
import { geocode, MapsError, mapsConfigured } from "@/lib/maps";
import { cameraName, type CameraAction } from "./camera-types";
import { str, type Tool } from "./types";

const round3 = (x: number) => Math.round(x * 1000) / 1000;

export const findCamerasTool: Tool = {
  name: "find_cameras",
  label: { mn: "Камер хайж байна", en: "Finding cameras" },
  description:
    "Public live cameras near a place: city traffic camera pages (Erdenet, Ulaanbaatar), government traffic and road weather cameras (London, Singapore, Hong Kong, California, New Zealand, Finland, Norway, Iceland, Queensland, British Columbia, Washington, Oregon, Iowa, Toronto, Austin, Quebec, Taiwan), YouTube live city cameras posted with a location (game streams are left out), and webcams mapped on OpenStreetMap. Opens a camera panel on the screen. Use for 'show me the cameras', 'is there a webcam in Paris?', 'traffic cameras near me'. Say how many were found and name a few with who runs them; if none, say there are no public cameras known near there. Never offer private or unsecured cameras.",
  parameters: {
    type: "object",
    properties: {
      place: { type: "string", description: "Optional place or city, e.g. 'Shibuya crossing' or 'Erdenet'. Empty = where the person is." },
    },
    required: [],
  },
  async run(input, ctx) {
    const place = str(input.place, 120);
    let at = place ? null : (ctx.device.location ?? ctx.approxLocation ?? null);
    // ctx.city may be the saved home city, so it names the spot only when no GPS fix is used.
    let name = place || (ctx.device.location ? "" : ctx.city || "");
    if (!at) {
      const query = place || ctx.city;
      if (!query) return { error: "Where the person is is not known. Ask which place they mean." };
      if (!mapsConfigured()) return { error: "Finding places is not set up, so a named place cannot be looked up." };
      try {
        const g = await geocode(query, ctx.lang ?? "en");
        at = { lat: g.lat, lng: g.lng };
        name = g.name;
      } catch (e) {
        return { error: e instanceof MapsError && e.message.startsWith("Place not found") ? `No place called "${query}" was found.` : "The place lookup is unavailable right now." };
      }
    }
    const pos = { lat: round3(at.lat), lng: round3(at.lng) };
    let found;
    try {
      // The signed-in user's id bounds their YouTube searches.
      found = await findCameras(pos, { userId: ctx.userId });
    } catch {
      return { error: "The camera search is unavailable right now." };
    }
    const action: CameraAction = { type: "cameras", ...pos };
    ctx.actions.push(action);
    return {
      place: name || undefined,
      total: found.cameras.length,
      // Names anyone can write (YouTube titles and channels, OSM tags) never reach the model; the panel shows them.
      cameras: found.cameras.slice(0, 6).map((c) => ({
        name: c.source === "youtube" ? "YouTube live stream" : c.source === "osm" ? "Mapped webcam" : cameraName(c, ctx.lang ?? "en"),
        kind: c.kind,
        distanceKm: c.distanceKm,
        credit: c.source === "youtube" ? "YouTube" : c.credit,
      })),
      sourcesNotAnswering: found.unavailable.length ? found.unavailable : undefined,
      // Only the web app has the panel: bots, cron and any other caller never claim it.
      note: found.cameras.length
        ? (ctx.source !== "web" ? "The camera panel is only in the Aspire app: name a few cameras and say they can be watched there." : "The camera panel is open on screen and shows each camera's own name.") +
          " Images are snapshots, not live video, except kind 'video' and 'embed'." +
          (found.cameras.some((c) => c.source === "tdx-tw") ? " Taiwan freeway images (MOTC Freeway Bureau) are live MJPEG video streams, not snapshots." : "")
        : found.unavailable.length
        ? `Some camera sources did not answer (${found.unavailable.join(", ")}). Say the cameras could not all be checked right now; do not say there are none.`
        : "No public cameras are known near here. Say exactly that; do not suggest private or unsecured cameras.",
    };
  },
};

export const cameraTools: Tool[] = [findCamerasTool];
