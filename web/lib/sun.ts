// Where the sun is, for any place on Earth (NOAA solar position algorithm, accurate to about a
// minute for sunrise and sunset between 1901 and 2099). Pure math, safe on the client and server.
// Drives the sky phase (night, dawn, golden hour, day, dusk), the desktop sun bloom and the
// daylight arc on the Halo, including polar day and polar night.

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

export interface SunState {
  /** Elevation above the horizon in degrees (negative below it). */
  altDeg: number;
  /** Compass bearing in degrees: 0 north, 90 east, 180 south, 270 west. */
  azDeg: number;
  /** Sunrise and sunset in minutes since local midnight (in `timeZone`), or null with no sunrise/sunset that day. */
  sunriseMin: number | null;
  sunsetMin: number | null;
  /** "day" = the sun never sets today, "night" = it never rises; null otherwise. */
  polar: "day" | "night" | null;
}

/** Minutes since midnight of an instant in an IANA time zone (UTC when the zone is unknown). */
function localMinutes(at: Date, timeZone: string | null | undefined): number {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: timeZone || "UTC", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(at);
    const h = Number(parts.find((p) => p.type === "hour")?.value);
    const m = Number(parts.find((p) => p.type === "minute")?.value);
    if (Number.isFinite(h) && Number.isFinite(m)) return (h % 24) * 60 + m;
  } catch {
    // fall through to UTC
  }
  return at.getUTCHours() * 60 + at.getUTCMinutes();
}

/** Solar declination (radians) and the equation of time (minutes) for an instant. */
function solar(at: Date): { decl: number; eqTime: number } {
  const jd = at.getTime() / 86_400_000 + 2440587.5;
  const jc = (jd - 2451545) / 36525;
  const l0 = (280.46646 + jc * (36000.76983 + jc * 0.0003032)) % 360;
  const m = 357.52911 + jc * (35999.05029 - 0.0001537 * jc);
  const e = 0.016708634 - jc * (0.000042037 + 0.0000001267 * jc);
  const c =
    Math.sin(m * RAD) * (1.914602 - jc * (0.004817 + 0.000014 * jc)) +
    Math.sin(2 * m * RAD) * (0.019993 - 0.000101 * jc) +
    Math.sin(3 * m * RAD) * 0.000289;
  const omega = 125.04 - 1934.136 * jc;
  const lambda = l0 + c - 0.00569 - 0.00478 * Math.sin(omega * RAD);
  const eps0 = 23 + (26 + (21.448 - jc * (46.815 + jc * (0.00059 - jc * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(omega * RAD);
  const decl = Math.asin(Math.sin(eps * RAD) * Math.sin(lambda * RAD));
  const y = Math.tan((eps * RAD) / 2) ** 2;
  const l0r = l0 * RAD;
  const mr = m * RAD;
  const eqTime =
    4 *
    DEG *
    (y * Math.sin(2 * l0r) -
      2 * e * Math.sin(mr) +
      4 * e * y * Math.sin(mr) * Math.cos(2 * l0r) -
      0.5 * y * y * Math.sin(4 * l0r) -
      1.25 * e * e * Math.sin(2 * mr));
  return { decl, eqTime };
}

/** The sun at `at` for a position; sunrise and sunset of that local day in `timeZone`. */
export function sunState(at: Date, lat: number, lng: number, timeZone?: string | null): SunState {
  const { decl, eqTime } = solar(at);
  const latR = lat * RAD;

  // Position now: true solar time -> hour angle -> zenith and azimuth.
  const utcMin = at.getUTCHours() * 60 + at.getUTCMinutes() + at.getUTCSeconds() / 60;
  const tst = (((utcMin + eqTime + 4 * lng) % 1440) + 1440) % 1440;
  const ha = tst / 4 - 180;
  const cosZen = Math.min(1, Math.max(-1, Math.sin(latR) * Math.sin(decl) + Math.cos(latR) * Math.cos(decl) * Math.cos(ha * RAD)));
  const zen = Math.acos(cosZen);
  const altDeg = 90 - zen * DEG;
  let azDeg = 180;
  const den = Math.cos(latR) * Math.sin(zen);
  if (Math.abs(den) > 1e-9) {
    const a = Math.acos(Math.min(1, Math.max(-1, (Math.sin(latR) * Math.cos(zen) - Math.sin(decl)) / den))) * DEG;
    azDeg = ha > 0 ? (a + 180) % 360 : (540 - a) % 360;
  }

  // Sunrise / sunset: the hour angle where the sun's centre is 0.833 degrees below the horizon.
  const cosH0 = (Math.cos(90.833 * RAD) - Math.sin(latR) * Math.sin(decl)) / (Math.cos(latR) * Math.cos(decl));
  if (!Number.isFinite(cosH0) || cosH0 > 1) return { altDeg, azDeg, sunriseMin: null, sunsetMin: null, polar: "night" };
  if (cosH0 < -1) return { altDeg, azDeg, sunriseMin: null, sunsetMin: null, polar: "day" };
  const h0 = Math.acos(cosH0) * DEG;
  const noonUtc = 720 - 4 * lng - eqTime; // minutes after UTC midnight of `at`'s UTC day
  const dayStart = Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate());
  const rise = new Date(dayStart + (noonUtc - 4 * h0) * 60_000);
  const set = new Date(dayStart + (noonUtc + 4 * h0) * 60_000);
  return { altDeg, azDeg, sunriseMin: localMinutes(rise, timeZone), sunsetMin: localMinutes(set, timeZone), polar: null };
}

export type SkyPhase = "night" | "dawn" | "golden" | "day" | "dusk";

/** Spec 5.1: night below -6 degrees, dawn or dusk -6..0, golden hour 0..10, day from 10. */
export function phaseFromSun(altDeg: number, azDeg: number): SkyPhase {
  if (altDeg < -6) return "night";
  if (altDeg < 0) return azDeg < 180 ? "dawn" : "dusk";
  if (altDeg < 10) return "golden";
  return "day";
}
