// What the homepage draws for a weather reading: the props for the app's <Sky>, and how strong
// the scrim over it has to be. Pure and server-safe (Sky's own helpers live in a client module).
import { SKY_KINDS, type SkyKind } from "@/lib/ambient-types";
import type { LandingWeather } from "@/lib/landing-weather";
import { DARK, skySun } from "@/lib/sun";

/** Rain and storm skies: Sky paints them in dark slate at every hour. */
const WET: ReadonlySet<SkyKind> = new Set<SkyKind>(["drizzle", "rain", "sleet", "hail", "storm"]);
/** Kinds with falling particles (hidden when motion is off, see landing.css). */
const FALLS: ReadonlySet<SkyKind> = new Set<SkyKind>([...WET, "snow"]);

export interface LandingScene {
  kind: SkyKind;
  /** 0..1 */
  intensity: number;
  isDay: boolean;
  /** 0..23 at the place, or null. */
  hour: number | null;
  windKph: number | null;
  cloudCover: number | null;
  /** "dark": night, rain or storm (a light scrim is enough). "bright": every other sky, and fog at any hour. */
  tone: "dark" | "bright";
  falls: boolean;
}

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

interface SkyInput {
  kind?: unknown;
  intensity?: unknown;
  isDay?: unknown;
  windKph?: unknown;
  cloudCover?: unknown;
}

/** Trust boundary: every field is checked, because a reading may carry a ?sky= or ?hour= override. */
function sceneFrom(sky: SkyInput | null | undefined, localHour: unknown): LandingScene {
  const kind: SkyKind = (SKY_KINDS as readonly unknown[]).includes(sky?.kind) ? (sky?.kind as SkyKind) : "clear";
  const isDay = sky?.isDay === true;
  const hour = finite(localHour) ? ((Math.floor(localHour) % 24) + 24) % 24 : null;
  // The same phase Sky works out for itself from the hour and the day flag.
  const night = DARK.has(skySun({ hour, isDay }).phase);
  return {
    kind,
    intensity: finite(sky?.intensity) ? Math.min(1, Math.max(0, sky.intensity)) : 0.5,
    isDay,
    hour,
    windKph: finite(sky?.windKph) ? sky.windKph : null,
    cloudCover: finite(sky?.cloudCover) ? sky.cloudCover : null,
    // Fog is pale even at night: it takes the heavier treatment at every hour.
    tone: (night && kind !== "fog") || WET.has(kind) ? "dark" : "bright",
    falls: FALLS.has(kind),
  };
}

/** The scene for the visitor's reading. */
export function landingScene(w: LandingWeather): LandingScene {
  return sceneFrom(w.sky, w.localHour);
}

/** The hour every demonstration sky is drawn at: deep night. */
export const DEMO_HOUR = 23;

/**
 * The scene for a sky the scroll story asks for (sky-store.ts): that weather by night, whatever
 * the visitor's hour. Rain and snow are light on dark, so a night sky is where they show, and the
 * page's contrast is worked out for one known sky instead of every hour's. The visitor's own sky
 * (and hour) comes back when the story hands the page back.
 */
export function demoScene(kind: SkyKind, base: LandingScene | null): LandingScene {
  return sceneFrom({ kind, intensity: 0.9, isDay: false, windKph: base?.windKph ?? 8, cloudCover: null }, DEMO_HOUR);
}

/**
 * The reading as the page can show it, or null: a place name, a finite temperature and a sky.
 * Anything else (a failed lookup, a half-filled object) gets the plain dark page instead of "NaN".
 */
export function usableWeather(w: LandingWeather | null | undefined): LandingWeather | null {
  return w && typeof w === "object" && typeof w.place === "string" && finite(w.tempC) && !!w.sky && typeof w.sky === "object" ? w : null;
}

/** The page-wide sky draws fewer particles than the app's hero: it covers the whole viewport. */
export const PAGE_SKY_EASE = 0.6;
