// The dials of scene 002: which ones a reading can fill, how far round each gauge's arc goes, and
// where the drum of values stands for a scroll position. Pure functions, no React and no DOM
// (tests/landing-story.test.ts).
//
// A dial exists only for a figure that is real. There is no dial for a missing value and no
// placeholder figure: a reading without wind has no wind dial, and a page without any reading has
// the clock alone, which comes from the visitor's own device.
import { aqiPosition } from "@/components/v6/AirCard";
import { clamp01, easeInOut, type Reading } from "./math";

/** The five dials, in the order they are shown. */
export const DIAL_IDS = ["temp", "wind", "cloud", "air", "time"] as const;
export type DialId = (typeof DIAL_IDS)[number];

export interface Dial {
  id: DialId;
  /** The figure itself: degrees Celsius, km/h, percent, US AQI, or minutes since midnight at the place. */
  value: number;
  /** How far round the gauge the arc goes, 0..1. */
  fill: number;
  /** The figure as it is printed, without its unit. */
  text: string;
}

/**
 * What a full turn of each gauge stands for. Temperature runs from the coldest to the hottest
 * weather people live in; wind ends at a full gale, where the arc simply stays closed.
 */
export const DIAL_RANGE = { temp: [-40, 40], wind: [0, 80], cloud: [0, 100] } as const;

const MINUTES_A_DAY = 24 * 60;
const two = (n: number) => String(n).padStart(2, "0");

/** "19:04" for minutes since midnight. */
export function clockText(minutes: number): string {
  const m = ((Math.floor(minutes) % MINUTES_A_DAY) + MINUTES_A_DAY) % MINUTES_A_DAY;
  return `${two(Math.floor(m / 60))}:${two(m % 60)}`;
}

/** A whole number with a real minus sign (U+2212), never "-0". */
function wholeText(v: number): string {
  const n = Math.round(v);
  return `${n < 0 ? "−" : ""}${Math.abs(n)}`;
}

/** The arc for a figure, 0..1. Air quality uses the app's own six-band scale, so the page and the app agree. */
export function dialFill(id: DialId, value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (id === "air") return clamp01(aqiPosition(value));
  if (id === "time") return clamp01(value / MINUTES_A_DAY);
  const [min, max] = DIAL_RANGE[id];
  return clamp01((value - min) / (max - min));
}

const dial = (id: DialId, value: number, text: string): Dial => ({ id, value, fill: dialFill(id, value), text });

/**
 * The dials a reading fills: temperature always, then wind, cloud cover and air quality when the
 * reading has them. No reading: none.
 */
export function readingDials(r: Reading | null | undefined): Dial[] {
  if (!r) return [];
  const out = [dial("temp", r.tempC, wholeText(r.tempC))];
  if (r.windKph !== null) out.push(dial("wind", r.windKph, wholeText(r.windKph)));
  if (r.cloudCover !== null) out.push(dial("cloud", r.cloudCover, wholeText(r.cloudCover)));
  if (r.aqi !== null) out.push(dial("air", r.aqi, wholeText(r.aqi)));
  return out;
}

/**
 * Minutes since midnight at `timeZone` for a moment, or on the device's own clock when no zone is
 * given. null when the browser does not know the zone: then there is no clock to show.
 */
export function minutesAt(epochMs: number, timeZone: string | null): number | null {
  if (!Number.isFinite(epochMs)) return null;
  try {
    // A fixed locale and a 0..23 hour: only the digits are read.
    const parts = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", ...(timeZone ? { timeZone } : {}) }).formatToParts(new Date(epochMs));
    const h = Number(parts.find((p) => p.type === "hour")?.value);
    const m = Number(parts.find((p) => p.type === "minute")?.value);
    return Number.isInteger(h) && Number.isInteger(m) && h >= 0 && h < 24 && m >= 0 && m < 60 ? h * 60 + m : null;
  } catch {
    return null;
  }
}

/**
 * "UTC+8", "UTC+5:30" or "UTC" for a zone at a moment (the device's own zone when none is given):
 * the unit beside the clock. null when the browser cannot say, and then no unit is shown.
 */
export function utcOffsetLabel(epochMs: number, timeZone: string | null): string | null {
  if (!Number.isFinite(epochMs)) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-US", { hour: "numeric", timeZoneName: "shortOffset", ...(timeZone ? { timeZone } : {}) }).formatToParts(new Date(epochMs));
    const m = /^(?:GMT|UTC)(?:([+-])(\d{1,2})(?::?(\d{2}))?)?$/.exec(parts.find((p) => p.type === "timeZoneName")?.value ?? "");
    if (!m) return null;
    const hours = Number(m[2] ?? 0);
    const minutes = m[3] && m[3] !== "00" ? `:${m[3]}` : "";
    // No offset at all is plain "UTC", however the browser writes it ("GMT", "GMT+0").
    if (!m[1] || (hours === 0 && !minutes)) return "UTC";
    // A real minus sign, like the one a temperature takes.
    return `UTC${m[1] === "-" ? "−" : "+"}${hours}${minutes}`;
  } catch {
    return null;
  }
}

/** The clock dial for minutes since midnight. */
export function clockDial(minutes: number): Dial {
  return dial("time", minutes, clockText(minutes));
}

/** The share of a dial's stretch spent rolling on to the next one; the rest holds it still to be read. */
const ROLL = 0.34;

/**
 * Where the drum of values stands for a pin progress, counted in dials: 0 is the first, n - 1 the
 * last. Each dial is held, then rolls to the next over the end of its stretch; the last one stays
 * to the end. With one dial nothing ever rolls.
 */
export function dialTurn(pin: number, n: number): number {
  if (n <= 1) return 0;
  const x = clamp01(pin) * n;
  const i = Math.min(n - 1, Math.floor(x));
  if (i === n - 1) return i;
  const rolling = (x - i - (1 - ROLL)) / ROLL;
  return i + easeInOut(clamp01(rolling));
}

/** The pin progress at which each of `n` dials begins: equal stretches of the pin. */
export function dialStarts(n: number): number[] {
  return Array.from({ length: Math.max(1, n) }, (_, i) => i / Math.max(1, n));
}

/**
 * How visible a value is on the drum, by its distance from the middle row: 1 in the middle, a ghost
 * at 0.1 one row away, gone from two rows on.
 */
export function ghostAlpha(offset: number): number {
  const d = Math.abs(offset);
  if (d >= 2) return 0;
  return d <= 1 ? 1 - 0.9 * d : 0.1 * (2 - d);
}

/** How visible a dial's label, index and caption are: only the dial in the middle, trading places quickly. */
export function soloAlpha(offset: number): number {
  return clamp01(1 - Math.abs(offset) * 2.4);
}

/** How long the giant figure is, for sizing: a clock or four digits is set smaller than "17". */
export function figureFit(text: string): number {
  const n = [...text].length;
  return n <= 2 ? 1 : n === 3 ? 0.78 : n === 4 ? 0.6 : 0.5;
}

/** Screens a scene with `n` dials is tall while pinned: on phones, and from 768 px. One screen to arrive, then a stretch per dial. */
export function dialsTall(n: number): readonly [number, number] {
  const k = Math.max(1, n);
  return [Number((1.35 + 0.38 * k).toFixed(2)), Number((1.4 + 0.44 * k).toFixed(2))];
}
