// Shape of GET /api/ambient: the live "world around you" snapshot that drives the sky
// (rain, snow, storm...), the ambient bar and the live panel. Shared by server and client.

export type SkyKind = "clear" | "partly" | "cloudy" | "fog" | "drizzle" | "rain" | "storm" | "snow" | "sleet" | "hail";

export const SKY_KINDS: readonly SkyKind[] = ["clear", "partly", "cloudy", "fog", "drizzle", "rain", "storm", "snow", "sleet", "hail"];

export type AqiCategory = "good" | "moderate" | "sensitive" | "unhealthy" | "very_unhealthy" | "hazardous";

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
  humidity: number | null;
  days: AmbientDay[];
}

export interface AmbientAir {
  /** US EPA AQI */
  aqi: number;
  category: AqiCategory;
  pm25: number | null;
  pm10: number | null;
  dominant: string | null;
}

export interface AmbientTraffic {
  level: TrafficLevel;
  /** Extra minutes versus free-flowing traffic on the probe route. */
  delayMin: number;
  /** duration / static duration */
  ratio: number;
  /** What the probe route measured, e.g. "to the city centre". */
  towards: string;
  /** Probe destination (for the Directions link); only sent for a device-shared position. */
  dest?: { lat: number; lng: number };
}

export interface AmbientStop {
  name: string;
  distanceM: number;
  walkMin: number;
  mapsUrl: string;
  /** Next arrivals when known (e.g. the Erdenet timetable). */
  lines?: { route: string; minutes: number }[];
}

export interface Ambient {
  place: string | null;
  /** Rounded to 2 decimals (about 1 km). */
  coords: { lat: number; lng: number } | null;
  /** Where the position came from: the device (opt-in) or the network (city-level). */
  locatedBy: "device" | "network" | null;
  sky: AmbientSky;
  weather: AmbientWeather | null;
  air: AmbientAir | null;
  traffic: AmbientTraffic | null;
  stops: AmbientStop[];
  timeZone: string | null;
  /** 0..23 in the place's time zone. */
  localHour: number | null;
  source: {
    weather: "google" | "open-meteo" | null;
    air: "google" | "open-meteo" | null;
  };
  updatedAt: string; // ISO
}

export function aqiCategory(aqi: number): AqiCategory {
  if (aqi <= 50) return "good";
  if (aqi <= 100) return "moderate";
  if (aqi <= 150) return "sensitive";
  if (aqi <= 200) return "unhealthy";
  if (aqi <= 300) return "very_unhealthy";
  return "hazardous";
}
