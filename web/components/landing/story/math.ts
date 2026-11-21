// The numbers behind the scroll story: which part of the exchange is on at a given scroll position,
// which sky a scene asks for, when a line of text is on, and what of the visitor's reading may be
// shown. Pure functions with no React and no DOM, so every scroll position gives one picture
// (nothing is remembered between frames) and the choreography can be tested without a browser
// (tests/landing-story.test.ts). The dials of scene 002 have their own file (dials.ts).
import { SKY_KINDS, type SkyKind } from "@/lib/ambient-types";
import type { LandingWeather } from "@/lib/landing-weather";

export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
/** Fast start, gentle stop: for things arriving. */
export const easeOut = (t: number): number => 1 - (1 - t) ** 3;
/** Gentle at both ends: for things that move while staying in view. */
export const easeInOut = (t: number): number => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);

/* ---- scene 01: the exchange ---- */

export type AskPhase = "idle" | "ask" | "think" | "answer" | "rest";

/** What the pinned stretch of scene 01 shows: the question is heard, the tool runs, the reply arrives. */
export function askPhase(pin: number): AskPhase {
  return pin < 0.06 ? "idle" : pin < 0.4 ? "ask" : pin < 0.54 ? "think" : pin < 0.93 ? "answer" : "rest";
}

/* ---- scenes 03 and 04: one thing on at a time ---- */

/** Scene 03: the pin progress at which clear, rain, snow and then the visitor's own sky begin. */
export const SKY_STARTS: readonly number[] = [0, 0.26, 0.52, 0.78];
/** The three skies scene 03 shows before it gives the page back its real one. */
export const SKY_DEMO: readonly SkyKind[] = ["clear", "rain", "snow"];
/** Scene 04: the pin progress at which each of the five languages begins. */
export const LANG_STARTS: readonly number[] = [0, 0.2, 0.4, 0.6, 0.8];

/**
 * Which demonstration sky scene 03 asks the page for: an index into SKY_DEMO, or -1 for the visitor's
 * own sky. Nothing is asked for until the scene is well on screen, or once it has started to leave.
 */
export function skyStep(enter: number, pin: number, exit: number): number {
  if (enter < 0.55 || exit > 0.02) return -1;
  for (let i = SKY_DEMO.length - 1; i >= 0; i--) if (pin >= (SKY_STARTS[i] ?? 0) && pin < (SKY_STARTS[i + 1] ?? 1)) return i;
  return -1;
}

/**
 * Scroll positions for a crossfade between steps: step `i` is on from its start to the next start
 * and trades places with its neighbours over `fade` on either side. The first step is on from the
 * very beginning and the last one stays, so something is always readable.
 */
export function fadeStops(starts: readonly number[], i: number, fade: number): number[] {
  const from = starts[i] ?? 0;
  const next = starts[i + 1];
  const rise = [from - fade * 0.5, from + fade];
  if (next === undefined) return i === 0 ? [0, 1] : rise;
  const fall = [next - fade, next + fade * 0.5];
  return i === 0 ? fall : [...rise, ...fall];
}

/** The values that go with fadeStops: `before` until the step is on, `on` while it is, `after` once it has left. */
export function fadeValues<T>(starts: readonly number[], i: number, before: T, on: T, after: T): T[] {
  const last = starts[i + 1] === undefined;
  if (last) return i === 0 ? [on, on] : [before, on];
  return i === 0 ? [on, after] : [before, on, on, after];
}

/* ---- scene 05: the chips ---- */

const CHIP_FIRST = 0.04;
const CHIP_STEP = 0.07;
const CHIP_LEN = 0.22;
/** How far below its cell a box starts, in percent of its own height. */
const CHIP_RISE = 46;

/** The pin progress over which box `i` arrives. The last of the seven is home by 0.7, so there is time to press one. */
export function chipWindow(i: number): [number, number] {
  const from = CHIP_FIRST + i * CHIP_STEP;
  return [from, from + CHIP_LEN];
}

/** A box at `landed` (0 not yet here, 1 in its cell), as a CSS transform: a short rise, nothing else. */
export function chipCss(landed: number): string {
  if (landed >= 0.9995) return "none";
  return `translate3d(0, ${(CHIP_RISE * (1 - clamp01(landed))).toFixed(2)}%, 0)`;
}

/* ---- jumping to a step ---- */

/**
 * The pin progress a step button scrolls to: a little past the step's start, where its crossfade is
 * over and the step before it has gone.
 */
export function stepTarget(starts: readonly number[], i: number): number {
  const from = starts[i] ?? 0;
  const next = starts[i + 1] ?? 1;
  return i <= 0 ? 0 : Math.min(from + (next - from) * 0.3, 0.995);
}

/** Which step is on at this pin progress: the last one whose start has been reached. */
export function stepAt(starts: readonly number[], pin: number): number {
  let on = 0;
  for (let i = 0; i < starts.length; i++) if (pin >= (starts[i] ?? 0)) on = i;
  return on;
}

/**
 * Where the page has to be scrolled for a pinned scene to stand at `pin`: the section's top, plus
 * that share of the distance it stays pinned for (its height less one screen).
 */
export function pinScrollTop(sectionTop: number, sectionHeight: number, viewport: number, pin: number): number {
  return Math.round(sectionTop + clamp01(pin) * Math.max(0, sectionHeight - viewport));
}

/* ---- the visitor's reading ---- */

/** The part of the visitor's weather the story shows, already checked. */
export interface Reading {
  /** The place as the network names it, trimmed and capped; "" when it is not known. */
  place: string;
  /** false: Aspire's home city stands in for a place that is not known. */
  local: boolean;
  /** false when ?sky= or ?hour= replaced part of the reading: it must not be shown as the current weather. */
  current: boolean;
  tempC: number;
  kind: SkyKind;
  isDay: boolean;
  /** Wind at 10 m in km/h, 0 or more; null when the reading has none. */
  windKph: number | null;
  /** 0..100; null when the reading has none (a previewed sky never has one). */
  cloudCover: number | null;
  /** US AQI, a whole number from 0; null when there is none. */
  aqi: number | null;
  /** The place's IANA time zone, for its clock; null when it is not known or not a zone name. */
  timeZone: string | null;
}

const finite = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
/** A figure inside the range it can really take, else no figure at all: never a clamped guess. */
const within = (v: unknown, min: number, max: number): number | null => {
  const n = finite(v);
  return n === null || n < min || n > max ? null : n;
};
/** The shape of an IANA zone name ("Asia/Ulaanbaatar"). Whether the browser knows it is found out when it is used. */
const zoneName = (v: unknown): string | null => (typeof v === "string" && v.length <= 64 && /^[A-Za-z][A-Za-z0-9_+\-/]*$/.test(v) ? v : null);

/**
 * Trust boundary: the reading comes from another module and may be half filled or overridden.
 * Anything without a finite temperature and a sky is no reading at all (never "NaN" on the page).
 * Wind, cloud cover, air quality and the time zone are each optional: a missing or impossible one
 * is null, and the dial that would show it is simply not drawn.
 */
export function usableReading(w: LandingWeather | null | undefined): Reading | null {
  if (!w || typeof w !== "object" || typeof w.place !== "string" || typeof w.tempC !== "number" || !Number.isFinite(w.tempC) || !w.sky || typeof w.sky !== "object") return null;
  const current = w.preview !== true;
  return {
    place: w.place.trim().slice(0, 80),
    local: w.local === true,
    current,
    tempC: w.tempC,
    kind: (SKY_KINDS as readonly unknown[]).includes(w.sky.kind) ? w.sky.kind : "clear",
    isDay: w.sky.isDay === true,
    windKph: within(w.sky.windKph, 0, 500),
    cloudCover: within(w.sky.cloudCover, 0, 100),
    // The air figure is never part of a preview: it would be the one real number among staged ones.
    aqi: current ? within((w as { aqi?: unknown }).aqi, 0, 999) : null,
    timeZone: zoneName(w.timeZone),
  };
}
