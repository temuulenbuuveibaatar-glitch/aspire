// Shape of /api/ambient: the live "world around you" snapshot behind the HUD (photo,
// weather over it, readouts, map). Shared by server and client.

export type SkyKind = "clear" | "partly" | "cloudy" | "fog" | "drizzle" | "rain" | "storm" | "snow" | "sleet" | "hail";

export const SKY_KINDS: readonly SkyKind[] = ["clear", "partly", "cloudy", "fog", "drizzle", "rain", "storm", "snow", "sleet", "hail"];

export type AqiCategory = "good" | "moderate" | "sensitive" | "unhealthy" | "very_unhealthy" | "hazardous";

/** Best to worst. */
export const AQI_ORDER: readonly AqiCategory[] = ["good", "moderate", "sensitive", "unhealthy", "very_unhealthy", "hazardous"];

export type TrafficLevel = "light" | "moderate" | "heavy";

export interface AmbientSky {
  kind: SkyKind;
  /** 0..1, how hard it rains / snows / how thick the fog is. */
  intensity: number;
  isDay: boolean;
  windKph: number | null;
  /** 0..100 */
  cloudCover: number | null;
  /** false when no weather backs this sky (a placeholder, not a claim). Absent means known. */
  known?: boolean;
}

export interface AmbientDay {
  date: string; // YYYY-MM-DD
  minC: number;
  maxC: number;
  text: string;
  kind: SkyKind;
  precipChance: number | null;
}

export interface AmbientWeather {
  tempC: number;
  feelsC: number;
  text: string;
  days: AmbientDay[];
}

export interface AmbientAir {
  /** US EPA AQI */
  aqi: number;
  category: AqiCategory;
}

export interface AmbientTraffic {
  level: TrafficLevel;
  /** Extra minutes versus free-flowing traffic on the probe route. */
  delayMin: number;
}

export interface AmbientStop {
  name: string;
  distanceM: number;
  /** Next arrivals when known (e.g. the Erdenet live feed). */
  lines?: { route: string; minutes: number }[];
  /** Exact stop position, for the map marker. */
  lat?: number;
  lng?: number;
}

/** A scenic photo of the place (Google Places, else Wikimedia Commons). The UI must show the author credit. */
export interface AmbientPhoto {
  url: string;
  attribution: { name: string; uri: string };
}

export interface AmbientTaxi {
  name: string;
  phone: string | null;
  distanceM: number;
  lat: number;
  lng: number;
}

export interface AmbientNextBus {
  line: string;
  departsInMin: number;
  /** "erdenet-live": the city's live feed (credit Орхон ТКХДТ); "google": Google transit. */
  source: "erdenet-live" | "google";
  /** Server time (ISO) the estimate was made: the client counts down from it and drops it when old. */
  at: string;
}

export interface Ambient {
  place: string | null;
  /** The device position (4 decimals) or the chosen city; never an IP-derived one. */
  coords: { lat: number; lng: number } | null;
  /** Where the position came from: the device (opt-in), the city the person set, or the network (approximate). */
  locatedBy: "device" | "city" | "network" | null;
  sky: AmbientSky;
  weather: AmbientWeather | null;
  air: AmbientAir | null;
  traffic: AmbientTraffic | null;
  stops: AmbientStop[];
  photo?: AmbientPhoto | null;
  taxis?: AmbientTaxi[];
  nextBus?: AmbientNextBus | null;
  timeZone: string | null;
  /** 0..23 in the place's time zone. */
  localHour: number | null;
}

export function aqiCategory(aqi: number): AqiCategory {
  if (aqi <= 50) return "good";
  if (aqi <= 100) return "moderate";
  if (aqi <= 150) return "sensitive";
  if (aqi <= 200) return "unhealthy";
  if (aqi <= 300) return "very_unhealthy";
  return "hazardous";
}
