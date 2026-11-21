// Where the sun is, for any place on Earth (NOAA solar position, good to a fraction of a degree
// between 1901 and 2099), and the time-of-day phase it gives the backdrop: the photo grade, the sun or
// moon glow and the stars. Pure math, safe on the client and server. Without a position, a smooth
// stand-in sun follows the place's local hour (and the weather's day/night flag) instead.

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

export type SkyPhase = "midnight" | "night" | "dawn" | "sunrise" | "day" | "afternoon" | "golden" | "sunset" | "dusk" | "evening";

export interface Sun {
  phase: SkyPhase;
  /** Elevation above the horizon in degrees (negative below it). */
  altDeg: number;
  /** Hour angle in degrees, -180..180: negative before solar noon (rising), positive after (setting). */
  haDeg: number;
}

/** The sun's elevation and hour angle at `at` for a position. */
export function sunPosition(at: Date, lat: number, lng: number): { altDeg: number; haDeg: number } {
  const jc = (at.getTime() / 86_400_000 + 2440587.5 - 2451545) / 36525;
  const l0 = (280.46646 + jc * (36000.76983 + jc * 0.0003032)) % 360;
  const m = 357.52911 + jc * (35999.05029 - 0.0001537 * jc);
  const e = 0.016708634 - jc * (0.000042037 + 0.0000001267 * jc);
  const c = Math.sin(m * RAD) * (1.914602 - jc * (0.004817 + 0.000014 * jc)) + Math.sin(2 * m * RAD) * (0.019993 - 0.000101 * jc) + Math.sin(3 * m * RAD) * 0.000289;
  const omega = 125.04 - 1934.136 * jc;
  const lambda = l0 + c - 0.00569 - 0.00478 * Math.sin(omega * RAD);
  const eps = 23 + (26 + (21.448 - jc * (46.815 + jc * (0.00059 - jc * 0.001813))) / 60) / 60 + 0.00256 * Math.cos(omega * RAD);
  const decl = Math.asin(Math.sin(eps * RAD) * Math.sin(lambda * RAD));
  const y = Math.tan((eps * RAD) / 2) ** 2;
  const [l0r, mr] = [l0 * RAD, m * RAD];
  const eqTime = 4 * DEG * (y * Math.sin(2 * l0r) - 2 * e * Math.sin(mr) + 4 * e * y * Math.sin(mr) * Math.cos(2 * l0r) - 0.5 * y * y * Math.sin(4 * l0r) - 1.25 * e * e * Math.sin(2 * mr));

  const utcMin = at.getUTCHours() * 60 + at.getUTCMinutes() + at.getUTCSeconds() / 60;
  const tst = (((utcMin + eqTime + 4 * lng) % 1440) + 1440) % 1440;
  const haDeg = tst / 4 - 180;
  const latR = lat * RAD;
  const cosZen = Math.sin(latR) * Math.sin(decl) + Math.cos(latR) * Math.cos(decl) * Math.cos(haDeg * RAD);
  return { altDeg: 90 - Math.acos(Math.min(1, Math.max(-1, cosZen))) * DEG, haDeg };
}

/**
 * The phase for a sun: below -12 degrees it is night (midnight within two hours of solar midnight,
 * evening after sunset, night before dawn); -12..-3 dawn or blue-hour dusk; -3..3 sunrise or sunset;
 * 3..12 the low warm sun (sunrise in the morning, golden hour in the evening); higher, day until two
 * hours after solar noon, then afternoon. White nights stay in dawn/dusk, polar night in night.
 */
export function phaseFromSun(altDeg: number, haDeg: number): SkyPhase {
  if (altDeg < -12) return Math.abs(haDeg) >= 150 ? "midnight" : haDeg < 0 ? "night" : "evening";
  if (haDeg < 0) return altDeg < -3 ? "dawn" : altDeg < 12 ? "sunrise" : "day";
  if (altDeg < -3) return "dusk";
  if (altDeg < 3) return "sunset";
  if (altDeg < 12) return "golden";
  return haDeg < 30 ? "day" : "afternoon";
}

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * The sun for the backdrop. Order of truth: the real sun at `coords` (needs `at`),
 * else a stand-in sun from the place's local hour (0..23, taken at half past) that rises at about
 * 06:00 and sets at about 18:00, nudged to agree with the weather's day/night flag.
 */
export function skySun({ at, coords, hour, isDay }: { at?: Date | null; coords?: { lat: number; lng: number } | null; hour?: number | null; isDay?: boolean }): Sun {
  if (at && coords && finite(coords.lat) && finite(coords.lng) && Math.abs(coords.lat) <= 90 && Math.abs(coords.lng) <= 180) {
    const { altDeg, haDeg } = sunPosition(at, coords.lat, coords.lng);
    return { phase: phaseFromSun(altDeg, haDeg), altDeg, haDeg };
  }
  const h = finite(hour) ? (((Math.floor(hour) % 24) + 24) % 24) + 0.5 : isDay === false ? 0.5 : 12.5;
  const haDeg = (h - 12) * 15;
  let altDeg = 40 * Math.cos(haDeg * RAD) - 5;
  if (isDay === false && altDeg > -4) altDeg = -4;
  if (isDay === true && altDeg < 1) altDeg = 1;
  return { phase: phaseFromSun(altDeg, haDeg), altDeg, haDeg };
}

/** Phases with no sun in the sky worth drawing: the moon and stars belong to these. */
export const DARK: ReadonlySet<SkyPhase> = new Set(["midnight", "night", "evening"]);
