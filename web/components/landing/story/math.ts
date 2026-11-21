// The numbers behind the scroll story: where a card lies at a given scroll position, which sky a
// scene asks for, when a line of text is on. Pure functions with no React and no DOM, so every
// scroll position gives one picture (nothing is remembered between frames) and the choreography
// can be tested without a browser (tests/landing-story.test.ts).
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

/* ---- scene 02: the card stack ---- */

export interface StackSetup {
  cols: number;
  rows: number;
  /** How much larger a card is while it lies in the pile. */
  scale: number;
  /** The pile's vertical offset from the middle of the grid, in percent of a card's height. */
  lift: number;
  /**
   * How far one pinned stretch moves the deal's clock, counted in ways in (see DEAL_FROM). A nominal
   * figure: how tall a scene really is lives in CSS, and only the deal's timing would differ.
   */
  travel: number;
  /** Cut the deck once before fanning out (wide screens with a mouse). */
  cut: boolean;
}

/** By columns: two by three on a phone, three by two up to 1280 px, one row of six from there. */
const GRID: Record<2 | 3 | 6, Pick<StackSetup, "cols" | "rows" | "scale" | "lift">> = {
  2: { cols: 2, rows: 3, scale: 1.1, lift: 0 },
  3: { cols: 3, rows: 2, scale: 1.1, lift: -6 },
  6: { cols: 6, rows: 1, scale: 1.42, lift: -34 },
};

export function stackSetup(cols: 2 | 3 | 6, cut: boolean): StackSetup {
  return { ...GRID[cols], travel: 1.5, cut };
}

const CARDS = 6;
/** Each card's tilt in the pile, in degrees, by slot. */
const TILT = [-7, 5, -3, 8, -5, 3.5];
/** Each card's nudge off the pile's centre, in percent of the card. */
const NUDGE: readonly (readonly [number, number])[] = [[-3, 2], [4, -3], [-2, -4], [3, 3], [-4, -1], [2, 4]];
/** Pile order when dealt, 0 at the bottom, by slot: the weather card is dealt last and lies on top. */
const RANK = [5, 4, 3, 2, 1, 0];

// The deal runs on a clock that keeps counting from the way in into the pin: clock = enter + pin * travel.
// It starts when the stage is most of the way in, so the first cards land as the pile comes into view
// and the last ones just after the stage has pinned.
const DEAL_FROM = 0.86;
const DEAL_STEP = 0.055;
const DEAL_LEN = 0.2;
const DEAL_END = DEAL_FROM + (CARDS - 1) * DEAL_STEP + DEAL_LEN;
const CUT_HALF = 0.05;
const FAN_LEN = 0.4;
/** The row is complete here, so the last stretch of the pin holds it still to be read. */
const FAN_DONE = 0.94;

export interface StackTimeline {
  /** Pin progress at which the last card has landed on the pile. */
  dealEnd: number;
  cutFrom: number;
  cutMid: number;
  cutEnd: number;
  fanFrom: number;
  fanStep: number;
}

export function stackTimeline(setup: StackSetup): StackTimeline {
  const dealEnd = Math.max(0, (DEAL_END - 1) / setup.travel);
  const cutFrom = dealEnd + 0.01;
  const cutMid = cutFrom + CUT_HALF;
  const cutEnd = cutMid + CUT_HALF;
  const fanFrom = (setup.cut ? cutEnd : dealEnd) + 0.02;
  const fanStep = Math.max(0.02, (FAN_DONE - fanFrom - FAN_LEN) / (CARDS - 1));
  return { dealEnd, cutFrom, cutMid, cutEnd, fanFrom, fanStep };
}

/** A card's place in the pile, 0 at the bottom. The cut moves the lower half on top. */
export function stackRank(slot: number, pin: number, setup: StackSetup): number {
  const rank = RANK[slot] ?? 0;
  return setup.cut && pin >= stackTimeline(setup).cutMid ? (rank + CARDS / 2) % CARDS : rank;
}

export interface Pose {
  /** Offsets in percent of the card's own cell. */
  x: number;
  y: number;
  /** Degrees. */
  rotate: number;
  scale: number;
  opacity: number;
}

/**
 * Where card `slot` is for a scroll position. `enter` runs 0 to 1 while the stage scrolls in, `pin`
 * 0 to 1 while it is pinned. The six cards are dealt onto a pile one by one (bottom first), the deck
 * is cut once, then the pile fans out to the grid, the top card first. At enter 1 and pin 1 every
 * card is exactly in its own cell: that is also what a page without motion shows.
 */
export function stackPose(slot: number, enter: number, pin: number, setup: StackSetup): Pose {
  const time = stackTimeline(setup);
  const rank = RANK[slot] ?? 0;
  const col = slot % setup.cols;
  const row = Math.floor(slot / setup.cols);
  const [nx, ny] = NUDGE[slot] ?? [0, 0];
  const pileX = ((setup.cols - 1) / 2 - col) * 100 + nx;
  const pileY = ((setup.rows - 1) / 2 - row) * 100 + ny + setup.lift;

  const clock = enter + pin * setup.travel;
  const landing = clamp01((clock - (DEAL_FROM + rank * DEAL_STEP)) / DEAL_LEN);
  const air = 1 - easeOut(landing);
  const side = rank % 2 ? -1 : 1;

  const open = setup.cut ? easeInOut(pin <= time.cutMid ? clamp01((pin - time.cutFrom) / CUT_HALF) : clamp01((time.cutEnd - pin) / CUT_HALF)) : 0;
  const half = rank >= CARDS / 2 ? 1 : -1;

  const order = CARDS - 1 - stackRank(slot, 1, setup);
  const fan = easeOut(clamp01((pin - (time.fanFrom + order * time.fanStep)) / FAN_LEN));
  const arc = Math.sin(fan * Math.PI);

  return {
    x: lerp(pileX + half * open * 62, 0, fan),
    y: lerp(pileY - half * open * 4 - air * 44, 0, fan) - arc * 6,
    rotate: lerp((TILT[slot] ?? 0) + air * side * 16 + half * open * 3, 0, fan) + arc * side * 2,
    scale: lerp(setup.scale * (1 + air * 0.14), 1, fan),
    opacity: clamp01(landing * 3),
  };
}

/** A pose as a CSS transform; "none" once the card is home, so a resting card costs no layer. */
export function poseCss(p: Pick<Pose, "x" | "y" | "rotate" | "scale">): string {
  if (Math.abs(p.x) < 0.01 && Math.abs(p.y) < 0.01 && Math.abs(p.rotate) < 0.01 && Math.abs(p.scale - 1) < 0.0005) return "none";
  return `translate3d(${p.x.toFixed(2)}%, ${p.y.toFixed(2)}%, 0) rotate(${p.rotate.toFixed(2)}deg) scale(${p.scale.toFixed(4)})`;
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

/** Where each chip flies in from: x and y in percent of the chip, and its turn in degrees. */
const CHIP_FROM: readonly (readonly [number, number, number])[] = [
  [-230, -150, -14],
  [170, -230, 10],
  [270, 110, 16],
  [-270, 140, -18],
  [60, 250, 8],
  [-150, 240, -10],
  [250, -90, 12],
];
const CHIP_FIRST = 0.05;
const CHIP_STEP = 0.085;
const CHIP_LEN = 0.36;

/** The pin progress over which chip `i` flies in. The last one lands at 0.92. */
export function chipWindow(i: number): [number, number] {
  const from = CHIP_FIRST + i * CHIP_STEP;
  return [from, from + CHIP_LEN];
}

/** Chip `i` at `landed` (0 far away, 1 in its cell), as a CSS transform. It never starts smaller than 0.9. */
export function chipCss(i: number, landed: number): string {
  if (landed >= 0.9995) return "none";
  const [x, y, r] = CHIP_FROM[i % CHIP_FROM.length] ?? [0, 0, 0];
  const away = 1 - clamp01(landed);
  return `translate3d(${(x * away).toFixed(2)}%, ${(y * away).toFixed(2)}%, 0) rotate(${(r * away).toFixed(2)}deg) scale(${(1 - 0.1 * away).toFixed(4)})`;
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
}

/**
 * Trust boundary: the reading comes from another module and may be half filled or overridden.
 * Anything without a finite temperature and a sky is no reading at all (never "NaN" on the page).
 */
export function usableReading(w: LandingWeather | null | undefined): Reading | null {
  if (!w || typeof w !== "object" || typeof w.place !== "string" || typeof w.tempC !== "number" || !Number.isFinite(w.tempC) || !w.sky || typeof w.sky !== "object") return null;
  return {
    place: w.place.trim().slice(0, 80),
    local: w.local === true,
    current: w.preview !== true,
    tempC: w.tempC,
    kind: (SKY_KINDS as readonly unknown[]).includes(w.sky.kind) ? w.sky.kind : "clear",
    isDay: w.sky.isDay === true,
  };
}
