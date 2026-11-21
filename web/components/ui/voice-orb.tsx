"use client";

// Aspire Voice Orb (v3 "Skylight Halo", spec section 6).
//
// Started from the 21st.dev Voice Orb (aadixc0de / chatcn: https://chatcn.dev) and kept its
// form-parameter engine: a sphere of contour lines whose numeric "form" eases toward a target
// per state, so states morph instead of cutting. On top of that Aspire adds:
//   - a luminous nucleus, a soft aura and a top-lit glass rim (the orb reads as a lit object),
//   - a 48-segment voice ring that follows spectrum bands (or the level when no bands exist),
//   - per-contour spectrum gain (low bins move the lower lines, high bins the upper lines),
//   - small additive weather offsets (rain wave, snow flecks, fog, wind turn, storm jitter, AQI tint),
//   - an error settle,
//   - still, distinct frames for reduced motion and Calm mode, with a 150ms crossfade.
// Colour always comes from `currentColor`, so the caller's text colour tints the whole orb.

import * as React from "react";
import { useCalm, useMedia } from "@/lib/display-prefs";
import type { Lang } from "@/lib/lang";
import { cn } from "@/lib/utils";

export type VoiceOrbState = "idle" | "listening" | "thinking" | "speaking" | "error";

/** Same union as `SkyFamily` in `lib/sky-scene.ts` (spec section 5.1), declared here so the orb has no dependency on it. */
export type VoiceOrbSkyFamily = "clear" | "cloud" | "fog" | "rain" | "storm" | "snow";

export interface VoiceOrbWeather {
  family: VoiceOrbSkyFamily;
  windKph: number;
  /** 1..6 (good .. hazardous). 3 or higher tints the back face. */
  aqiSeverity: number;
  storm: boolean;
}

/** Halo data: the orb only needs to know a halo exists (the canvas grows to `size * 1.42` and
 * draws the voice ring on the halo radius). Any `{ clock, inner }` object is accepted, or `true`. */
interface VoiceOrbHalo {
  clock?: unknown;
  inner?: unknown;
}

/** A level from 0 to 1, or a function that returns the current one (read every frame). */
type Level = number | (() => number);

/** Spectrum bins 0..1 (16..24 of them), read every frame. Values above 1 are treated as 0..255 bytes. */
type VoiceOrbBands = () => Float32Array | Uint8Array | ArrayLike<number> | null;

interface VoiceOrbProps extends Omit<React.ComponentProps<"div">, "children"> {
  state?: VoiceOrbState;
  /** Audio level 0..1: the user's input while listening, the voice output while speaking. */
  level?: Level;
  /** Spectrum bands, e.g. from `createBands(analyser)`. Optional: the level drives the ring without it. */
  bands?: VoiceOrbBands;
  /** Live weather, as small additive offsets on the form. */
  weather?: VoiceOrbWeather | null;
  /** When set, the canvas grows to `size * 1.42` and the voice ring sits on the halo radius. */
  halo?: VoiceOrbHalo | boolean | null;
  /** Draw the voice ring around the sphere without a halo. Defaults to on at 96px and larger. */
  ring?: boolean;
  /** Sphere diameter in px. With a halo the element is `size * 1.42`. */
  size?: number;
  /** Accessible name. Defaults to the localised state word. */
  label?: string;
  /** Language of the default accessible name. */
  lang?: Lang;
}

const VOICE_ORB_HALO_RATIO = 1.42;

/** Window event that triggers the storm `split` jitter (Sky fires it with the lightning flash). */
export const ORB_LIGHTNING_EVENT = "aspire:lightning";

/* ---------------------------------------------------------------------------------------------
 * Words (status word under the orb and the default accessible name), in all five languages.
 * Uppercase is a styling choice of the caller (never for Chinese).
 * -------------------------------------------------------------------------------------------*/

type WordKey = Exclude<VoiceOrbState, "idle"> | "ready";

const VOICE_ORB_WORDS: Record<Lang, Record<WordKey, string>> = {
  en: {
    ready: "Ready",
    listening: "Listening",
    thinking: "Thinking",
    speaking: "Speaking",
    error: "Something went wrong",
  },
  mn: {
    ready: "Бэлэн",
    listening: "Сонсож байна",
    thinking: "Бодож байна",
    speaking: "Ярьж байна",
    error: "Алдаа гарлаа",
  },
  zh: {
    ready: "就绪",
    listening: "正在聆听",
    thinking: "正在思考",
    speaking: "正在说话",
    error: "出了点问题",
  },
  ru: {
    ready: "Готов",
    listening: "Слушаю",
    thinking: "Думаю",
    speaking: "Говорю",
    error: "Что-то пошло не так",
  },
  de: {
    ready: "Bereit",
    listening: "Höre zu",
    thinking: "Denke nach",
    speaking: "Spreche",
    error: "Etwas ist schiefgelaufen",
  },
};

/** The localised word for a state ("Ready" for idle). */
export function voiceOrbWord(state: VoiceOrbState, lang: Lang = "en"): string {
  const words = VOICE_ORB_WORDS[lang] ?? VOICE_ORB_WORDS.en;
  return state === "idle" ? words.ready : words[state];
}

/** The colour class for a state (spec section 6.1). The orb draws in `currentColor`. */
function voiceOrbColorClass(state: VoiceOrbState): string {
  if (state === "error") return "text-danger";
  return state === "thinking" ? "text-ink" : "text-accent";
}

/* ---------------------------------------------------------------------------------------------
 * User preferences: reduced motion, reduced transparency, and Calm mode (html[data-calm="true"]).
 * -------------------------------------------------------------------------------------------*/

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

/** A caller's level getter must never break the frame loop. */
function readLevel(l: Level | undefined): number {
  if (l === undefined) return 0;
  try {
    return clamp01(Number(typeof l === "function" ? l() : l));
  } catch {
    return 0;
  }
}

const SKY_FAMILIES: readonly VoiceOrbSkyFamily[] = ["clear", "cloud", "fog", "rain", "storm", "snow"];

/** Weather comes from the network (via /api/ambient): keep only well-formed, finite values. */
function cleanWeather(w: VoiceOrbWeather | null | undefined): VoiceOrbWeather | null {
  if (!w || typeof w !== "object" || !SKY_FAMILIES.includes(w.family)) return null;
  const wind = Number(w.windKph);
  const sev = Math.round(Number(w.aqiSeverity));
  return {
    family: w.family,
    windKph: Number.isFinite(wind) ? Math.min(200, Math.max(0, wind)) : 0,
    aqiSeverity: Number.isFinite(sev) ? Math.min(6, Math.max(1, sev)) : 1,
    storm: w.storm === true,
  };
}

/* ---------------------------------------------------------------------------------------------
 * Form: a sphere drawn as contour lines. Each state is a set of form parameters; the canvas
 * eases toward the target every frame. Waves travel inward while listening and outward while
 * speaking, so the orb reads with the sound off.
 * -------------------------------------------------------------------------------------------*/

interface OrbForm {
  scale: number;
  flow: number;
  stir: number;
  wave: number;
  travel: number;
  turn: number;
  breathe: number;
  ink: number;
  back: number;
  trace: number;
  dots: number;
  split: number;
  squash: number;
  shimmer: number;
  /** Weather: a gentle wave travelling downward (rain family). */
  rain: number;
  /** Weather: the dotted lines drift (snow). */
  drift: number;
}

function f(partial: Partial<OrbForm>): OrbForm {
  return {
    scale: 0.9,
    flow: 0,
    stir: 0,
    wave: 0,
    travel: 0,
    turn: 0,
    breathe: 0,
    ink: 1,
    back: 0.11,
    trace: 1,
    dots: 0,
    split: 0,
    squash: 0,
    shimmer: 0,
    rain: 0,
    drift: 0,
    ...partial,
  };
}

const FORMS: Record<VoiceOrbState, OrbForm> = {
  // Breathes 1.00 -> 1.03 over 5s.
  idle: f({ flow: 0.022, stir: 0.32, turn: 0.1, breathe: 0.015 }),
  listening: f({ flow: 0.03, stir: 0.6, wave: 0.014, travel: -0.9, turn: 0.16, breathe: 0.01 }),
  // The outline stays calm; the inner light band does the work.
  thinking: f({ scale: 0.86, flow: 0.034, stir: 0.55, turn: 0.3, shimmer: 1 }),
  speaking: f({ flow: 0.026, stir: 0.7, wave: 0.02, travel: 1.3, turn: 0.22 }),
  error: f({ scale: 0.86, ink: 0.55, back: 0.06, split: 1 }),
};


function withLevel(form: OrbForm, state: VoiceOrbState, level: number): OrbForm {
  if (state === "listening") {
    return {
      ...form,
      scale: form.scale + 0.06 * level,
      flow: form.flow + 0.05 * level,
      stir: form.stir + 1.1 * level,
      wave: form.wave + 0.05 * level,
      travel: form.travel - 2.2 * level,
    };
  }
  if (state === "speaking") {
    return {
      ...form,
      scale: form.scale + 0.08 * level,
      flow: form.flow + 0.03 * level,
      stir: form.stir + 1.4 * level,
      wave: form.wave + 0.065 * level,
      travel: form.travel + 2.6 * level,
    };
  }
  return form;
}

function withWeather(form: OrbForm, weather: VoiceOrbWeather | null | undefined): OrbForm {
  if (!weather) return form;
  const next = { ...form };
  const family = weather.family;
  if (family === "rain" || family === "storm") next.rain += family === "storm" ? 0.016 : 0.012;
  if (family === "snow" && next.dots < 0.4) {
    next.dots = 0.4;
    next.drift = 1;
  }
  if (family === "fog") {
    next.ink = Math.max(0.3, next.ink - 0.15);
    next.back += 0.1;
  }
  next.turn += Math.min(weather.windKph, 60) / 600;
  return next;
}

/** The form the orb should be in right now (before easing). */
function targetForm(state: VoiceOrbState, level: number, weather: VoiceOrbWeather | null | undefined, reducedTransparency: boolean): OrbForm {
  let form = withWeather(withLevel(FORMS[state], state, level), weather);
  if (reducedTransparency) form = { ...form, back: 0, ink: 1 };
  return form;
}

const STILL_LEVEL = 0.4;

function stillForm(state: VoiceOrbState, weather: VoiceOrbWeather | null | undefined, reducedTransparency: boolean): OrbForm {
  const form = targetForm(state, STILL_LEVEL, weather, reducedTransparency);
  return { ...form, breathe: 0, trace: form.trace < 1 ? 0.55 : 1 };
}

function density(px: number) {
  return { lines: Math.round(Math.min(22, Math.max(5, px / 10))), samples: px > 120 ? 120 : px > 60 ? 84 : 56 };
}

interface OrbPhase {
  flow: number;
  wave: number;
  turn: number;
  breath: number;
  trace: number;
  sweep: number;
  rain: number;
  drift: number;
}

const BANDS = 5;
const GLOWS = 4;
/** Stroke groups: 0 = the back face, 1..BANDS*GLOWS = front depth bands (lit steps inside each). */
const GROUPS = BANDS * GLOWS + 1;
const TILT = 0.36;
const COS_T = Math.cos(TILT);
const SIN_T = Math.sin(TILT);

/**
 * Preallocated contour geometry, rebuilt only when the line or sample count changes, so the
 * frame loop allocates nothing: every sample point lives in `pts` (x, y pairs, line-major), and
 * each visible polyline is a run of consecutive points [from, to] tagged with its stroke group.
 */
interface SphereBuf {
  lines: number;
  samples: number;
  pts: Float32Array;
  /** group, from, to (point indices) per run. */
  runs: Int32Array;
  nRuns: number;
  /** Runs per group, so empty groups skip their stroke. */
  counts: Int32Array;
}

function sphereBuf(lines: number, samples: number): SphereBuf {
  const n = lines * (samples + 1);
  return { lines, samples, pts: new Float32Array(n * 2), runs: new Int32Array(n * 3), nRuns: 0, counts: new Int32Array(GROUPS) };
}

function sphere(
  form: OrbForm,
  phase: OrbPhase,
  cx: number,
  cy: number,
  r: number,
  gains: Float32Array | null,
  buf: SphereBuf,
): void {
  const { lines, samples, pts, runs, counts } = buf;
  counts.fill(0);
  let nRuns = 0;
  const breath = 1 + form.breathe * (1 + Math.sin(phase.breath));
  const radius = r * form.scale * breath;
  const sx = 1 + form.squash * 0.5;
  const sy = 1 - form.squash;
  const ct = Math.cos(phase.turn);
  const st = Math.sin(phase.turn);

  for (let i = 0; i < lines; i++) {
    // i = 0 is the lowest line on screen.
    const lat = -Math.PI / 2 + (Math.PI * (i + 1)) / (lines + 1);
    const cl = Math.cos(lat);
    const sl = Math.sin(lat);
    const start = phase.trace + i * 0.06;
    const off = (1 - (i + 0.5) / lines - (phase.sweep * 1.3 - 0.15)) / 0.18;
    const near = Math.exp(-off * off);
    const lit = 1 - form.shimmer * (1 - near);
    const step = Math.round(lit * (GLOWS - 1));
    const waveAmp = form.wave + (gains ? (gains[i] ?? 0) : 0);
    const base = i * (samples + 1);

    let open = -1; // index into `runs` of the run being extended, or -1
    let group = -1;
    let prevZ = 0;
    let prevOn = false;

    for (let j = 0; j <= samples; j++) {
      const a = (j / samples) * Math.PI * 2;
      const ux = cl * Math.cos(a);
      const uy = sl;
      const uz = cl * Math.sin(a);
      const fx = ux * ct - uz * st;
      const fz = ux * st + uz * ct;
      const vy = uy * COS_T - uz * SIN_T;
      const vz = uy * SIN_T + uz * COS_T;

      const flow =
        0.5 * Math.sin(2.3 * fx + 1.4 * uy + phase.flow) +
        0.3 * Math.sin(3.1 * uy - 1.9 * fz - phase.flow * 1.27 + 1.1) +
        0.2 * Math.sin(4.3 * fz + 2.6 * fx + phase.flow * 0.71 + 2.4);
      const front01 = Math.max(vz, 0);
      const dist = Math.acos(Math.min(1, Math.max(-1, vz)));
      const wave = waveAmp > 0 ? Math.sin(dist * 8 - phase.wave) * front01 : 0;
      // Rain: crests move toward lower latitudes as the phase grows, i.e. downward.
      const rain = form.rain > 0 ? Math.sin(uy * 9 + phase.rain) * (0.5 + 0.5 * front01) : 0;

      const give = 0.3 + 0.7 * cl;
      const rr = radius * (1 + give * (form.flow * flow + waveAmp * wave + form.rain * rain));
      const lift = waveAmp * wave * radius * 0.7 * give;
      const idx = base + j;
      pts[idx * 2] = cx + ux * rr * sx;
      pts[idx * 2 + 1] = cy - (vy * rr + lift) * sy;

      let on = true;
      if (form.trace < 0.985) {
        const u = (((j / samples - start) % 1) + 1) % 1;
        on = u < form.trace;
      }

      if (j > 0 && on && prevOn) {
        const z = (prevZ + vz) / 2;
        const next = z < 0 ? 0 : 1 + Math.min(BANDS - 1, Math.floor(z * BANDS)) * GLOWS + step;
        if (next !== group || open < 0) {
          // A new run starts at the previous point, as the old polyline did.
          open = nRuns * 3;
          runs[open] = next;
          runs[open + 1] = idx - 1;
          runs[open + 2] = idx;
          nRuns++;
          counts[next] = (counts[next] ?? 0) + 1;
          group = next;
        } else {
          runs[open + 2] = idx;
        }
      } else {
        open = -1;
        group = -1;
      }
      prevZ = vz;
      prevOn = on;
    }
  }
  buf.nRuns = nRuns;
}

/** Adds every run of one stroke group to the current path (one beginPath per group). */
function traceGroup(ctx: CanvasRenderingContext2D, buf: SphereBuf, g: number) {
  const { runs, pts, nRuns } = buf;
  for (let k = 0; k < nRuns; k++) {
    const o = k * 3;
    if (runs[o] !== g) continue;
    const from = runs[o + 1] ?? 0;
    const to = runs[o + 2] ?? 0;
    ctx.moveTo(pts[from * 2] ?? 0, pts[from * 2 + 1] ?? 0);
    for (let p = from + 1; p <= to; p++) ctx.lineTo(pts[p * 2] ?? 0, pts[p * 2 + 1] ?? 0);
  }
}

const STILL_PHASE: OrbPhase = { flow: 1.3, wave: 2.2, turn: 0.6, breath: 0, trace: 0.15, sweep: 0.4, rain: 0.8, drift: 0 };

const lineWeight = (px: number) => Math.min(1.6, Math.max(0.9, px / 130));

function approach(current: number, target: number, rate: number, dt: number) {
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}

function bandStyle(index: number, reducedTransparency: boolean) {
  const z = (Math.floor(index / GLOWS) + 0.5) / BANDS;
  const lit = (index % GLOWS) / (GLOWS - 1);
  const alpha = (0.28 + 0.72 * z ** 0.8) * (0.45 + 0.55 * lit);
  return { alpha: reducedTransparency ? Math.max(0.5, alpha) : alpha, weight: 0.7 + 0.55 * z, depth: Math.floor(index / GLOWS) };
}

const KEYS = Object.keys(FORMS.idle) as (keyof OrbForm)[];
const BREATH: Partial<Record<VoiceOrbState, number>> = { idle: 5, listening: 3.4 };

/* ---------------------------------------------------------------------------------------------
 * Colour: parsed once per change from `currentColor`, lifted toward ink for the lit front lines.
 * -------------------------------------------------------------------------------------------*/

type RGB = [number, number, number];
const INK: RGB = [242, 246, 252];
const FALLBACK: RGB = [94, 231, 255];
const AQI_FALLBACK: Record<number, string> = { 3: "#F5A66B", 4: "#FF8A8A", 5: "#C99BFF", 6: "#E0457B" };

function parseColor(value: string): RGB {
  const rgb = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i.exec(value);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  const srgb = /color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/i.exec(value);
  if (srgb) return [Number(srgb[1]) * 255, Number(srgb[2]) * 255, Number(srgb[3]) * 255];
  return rasterColor(value) ?? FALLBACK;
}

/** Any other CSS colour (oklch, lab, color-mix...): let the browser paint one pixel and read it back. */
function rasterColor(value: string): RGB | null {
  if (!value || typeof document === "undefined") return null;
  try {
    const probe = document.createElement("canvas");
    probe.width = 1;
    probe.height = 1;
    const c = probe.getContext("2d", { willReadFrequently: true });
    if (!c) return null;
    c.fillStyle = "#000";
    c.fillStyle = value;
    c.fillRect(0, 0, 1, 1);
    const d = c.getImageData(0, 0, 1, 1).data;
    return d[3] ? [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0] : null;
  } catch {
    return null;
  }
}

const mix = (a: RGB, b: RGB, k: number): RGB => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const rgba = (c: RGB, a: number) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${Math.max(0, Math.min(1, a)).toFixed(3)})`;

interface Palette {
  base: RGB;
  light: RGB;
  /** Stroke colour per depth band, lifted toward ink for the nearest bands. */
  depth: string[];
  solid: string;
}

const DEPTH_LIFT = [0, 0, 0.08, 0.18, 0.3];

function palette(raw: string): Palette {
  const base = parseColor(raw);
  return {
    base,
    light: mix(base, INK, 0.45),
    depth: DEPTH_LIFT.map((k) => rgba(mix(base, INK, k), 1)),
    solid: rgba(base, 1),
  };
}

/* ---------------------------------------------------------------------------------------------
 * Voice ring: 48 radial segments, two per bin (mirrored left and right), low bins at the bottom.
 * -------------------------------------------------------------------------------------------*/

const SEGS = 48;
const HALF = SEGS / 2;
const MAX_BINS = 32;
const ARC = (40 * Math.PI) / 180;
const TAU = Math.PI * 2;

function segmentAngle(k: number) {
  return -Math.PI / 2 + ((k + 0.5) / SEGS) * TAU;
}

/** Target length (0..1 of the free range) and alpha for every segment. */
function ringTargets(
  state: VoiceOrbState,
  sinceS: number,
  bins: Float32Array,
  nb: number,
  reduced: boolean,
  outLen: Float32Array,
  outAlpha: Float32Array,
) {
  const head = -Math.PI / 2 + TAU * ((sinceS / 1.8) % 1);
  for (let k = 0; k < SEGS; k++) {
    const m = k < HALF ? k : SEGS - 1 - k; // 0 at the top, 23 at the bottom, on both sides
    let len = 0;
    let alpha = 0;
    if (state === "listening" || state === "speaking") {
      const bin = bins[Math.min(nb - 1, Math.floor(((HALF - 1 - m) / HALF) * nb))] ?? 0;
      len = reduced ? 0.3 : bin;
      alpha = reduced ? 0.8 : 0.45 + 0.55 * bin;
      // Reduced motion: listening is a ring with a gap at the bottom.
      if (reduced && state === "listening" && m >= HALF - 5) alpha = 0;
    } else if (state === "idle") {
      alpha = reduced ? 0.5 : 0.36;
    } else if (state === "thinking") {
      if (reduced) {
        len = 0.1;
        alpha = 0.6;
      } else {
        const delta = (((head - segmentAngle(k)) % TAU) + TAU) % TAU;
        if (delta < ARC) {
          const t = delta / ARC;
          len = 0.35 * (1 - t);
          alpha = 1 - 0.65 * t;
        } else {
          alpha = 0.16;
        }
      }
    }
    // error hides the ring: zero length and alpha.
    outLen[k] = len;
    outAlpha[k] = alpha;
  }
}

/* ---------------------------------------------------------------------------------------------
 * One frame.
 * -------------------------------------------------------------------------------------------*/

interface Geometry {
  cx: number;
  cy: number;
  box: number;
  spherePx: number;
  r: number;
  ringR: number;
  segBase: number;
  segMax: number;
  segW: number;
}

function geometry(width: number, height: number, halo: boolean, ring: boolean): Geometry {
  const box = Math.min(width, height);
  const spherePx = halo ? box / VOICE_ORB_HALO_RATIO : box;
  const factor = halo || !ring ? 0.9 : 0.8;
  return {
    cx: width / 2,
    cy: height / 2,
    box,
    spherePx,
    r: (spherePx / 2) * factor,
    ringR: halo ? box * 0.4 : spherePx * 0.455,
    segBase: halo ? 3 : Math.max(1.5, spherePx * 0.012),
    segMax: halo ? 12 : Math.max(4, spherePx * 0.04),
    segW: halo ? 1.5 : Math.min(1.5, Math.max(1, spherePx / 155)),
  };
}

interface Frame {
  geo: Geometry;
  ring: boolean;
  form: OrbForm;
  phase: OrbPhase;
  state: VoiceOrbState;
  level: number;
  gains: Float32Array | null;
  segLen: Float32Array;
  segAlpha: Float32Array;
  pal: Palette;
  aqi: string | null;
  reducedMotion: boolean;
  reducedTransparency: boolean;
  /** Overall opacity of this frame (crossfades). */
  mul: number;
  /** Sideways offset in px (error settle). */
  dx: number;
  /** Reused contour buffers (no allocation per frame). */
  buf: SphereBuf;
}

function render(ctx: CanvasRenderingContext2D, fr: Frame) {
  const { geo, form, phase, pal, mul } = fr;
  const { cx, cy, r, spherePx } = geo;
  const rich = spherePx >= 64; // aura, nucleus and rim only where they read
  const glow = rich && !fr.reducedTransparency;
  const breath = 1 + form.breathe * (1 + Math.sin(phase.breath));
  const rim = r * form.scale * breath;
  const buf = fr.buf;
  sphere(form, phase, cx, cy, r, fr.gains, buf);
  const weight = lineWeight(spherePx);
  const thinkingLight = form.shimmer * (0.5 + 0.5 * Math.sin(phase.sweep * TAU));

  ctx.save();
  ctx.translate(fr.dx, 0);

  // Aura: a soft field of light that swells with the voice.
  if (glow) {
    const a = 0.07 + 0.16 * fr.level + 0.05 * thinkingLight;
    const g = ctx.createRadialGradient(cx, cy, rim * 0.6, cx, cy, geo.box / 2);
    g.addColorStop(0, rgba(pal.base, a));
    g.addColorStop(0.55, rgba(pal.base, a * 0.35));
    g.addColorStop(1, rgba(pal.base, 0));
    ctx.globalAlpha = mul;
    ctx.fillStyle = g;
    ctx.fillRect(cx - geo.box / 2, cy - geo.box / 2, geo.box, geo.box);
  }

  const paintSphere = () => {
    // Reduced motion, idle: a solid sphere.
    if (fr.reducedMotion && fr.state === "idle") {
      ctx.globalAlpha = mul * 0.16;
      ctx.fillStyle = pal.solid;
      ctx.beginPath();
      ctx.arc(cx, cy, rim, 0, TAU);
      ctx.fill();
    }

    // Nucleus: the light inside, a little above and left of centre (lit from the top left).
    if (glow) {
      const a = 0.14 + 0.24 * fr.level + 0.14 * thinkingLight;
      const nx = cx - rim * 0.16;
      const ny = cy - rim * 0.2;
      const g = ctx.createRadialGradient(nx, ny, 0, nx, ny, rim * 0.95);
      g.addColorStop(0, rgba(pal.light, a));
      g.addColorStop(0.45, rgba(pal.base, a * 0.4));
      g.addColorStop(1, rgba(pal.base, 0));
      ctx.globalAlpha = mul;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, rim * 1.02, 0, TAU);
      ctx.fill();
    }

    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (form.dots > 0.5) ctx.setLineDash([0, weight * 3.2]);
    else if (form.dots > 0.01) ctx.setLineDash([weight * 6 * (1 - form.dots), weight * 3.2]);
    ctx.lineDashOffset = form.drift > 0 ? -phase.drift : 0;

    if (form.back > 0.005 && (buf.counts[0] ?? 0) > 0) {
      ctx.beginPath();
      traceGroup(ctx, buf, 0);
      if (fr.aqi) {
        ctx.strokeStyle = fr.aqi;
        ctx.globalAlpha = 0.35 * form.ink * mul;
      } else {
        ctx.strokeStyle = pal.solid;
        ctx.globalAlpha = form.back * form.ink * mul;
      }
      ctx.lineWidth = weight * 0.7;
      ctx.stroke();
    }
    for (let g = 1; g < GROUPS; g++) {
      if (!(buf.counts[g] ?? 0)) continue;
      const style = bandStyle(g - 1, fr.reducedTransparency);
      ctx.beginPath();
      traceGroup(ctx, buf, g);
      ctx.strokeStyle = pal.depth[style.depth] ?? pal.solid;
      ctx.globalAlpha = style.alpha * form.ink * mul;
      ctx.lineWidth = weight * style.weight * (form.dots > 0.5 ? 1.5 : 1);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;

    // Glass rim: bright where the light hits (top left), almost gone on the far side.
    if (rich) {
      const sx = 1 + form.squash * 0.5;
      const sy = 1 - form.squash;
      const g = ctx.createLinearGradient(cx - rim * 0.75, cy - rim * 0.75, cx + rim * 0.75, cy + rim * 0.75);
      g.addColorStop(0, rgba(pal.light, fr.reducedTransparency ? 0.7 : 0.5));
      g.addColorStop(0.5, rgba(pal.base, fr.reducedTransparency ? 0.5 : 0.16));
      g.addColorStop(1, rgba(pal.base, fr.reducedTransparency ? 0.5 : 0.03));
      ctx.globalAlpha = mul * form.ink;
      ctx.strokeStyle = g;
      ctx.lineWidth = weight * 1.1;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rim * sx * 1.035, rim * sy * 1.035, 0, 0, TAU);
      ctx.stroke();
    }
  };

  // Reduced motion with no voice ring (small orbs, e.g. the docked one): the still shape is
  // drawn in place of the contour sphere, so every state stays distinct at 36-40px too.
  if (fr.reducedMotion && !fr.ring && (fr.state === "listening" || fr.state === "thinking" || fr.state === "speaking")) {
    const w = Math.max(1.5, weight * 1.4);
    const outer = Math.min(rim * 1.04, geo.box / 2 - w);
    ctx.strokeStyle = pal.solid;
    ctx.lineCap = "round";
    ctx.lineWidth = w;
    ctx.globalAlpha = 0.9 * mul;
    if (fr.state === "listening") {
      // A ring with a gap at the bottom (70 degrees).
      const gapHalf = (35 * Math.PI) / 180;
      ctx.beginPath();
      ctx.arc(cx, cy, outer, Math.PI / 2 + gapHalf, Math.PI / 2 - gapHalf + TAU);
      ctx.stroke();
    } else {
      const radii = fr.state === "thinking" ? [outer, outer * 0.58] : [outer, outer * 0.66, outer * 0.32];
      for (const rad of radii) {
        ctx.beginPath();
        ctx.arc(cx, cy, rad, 0, TAU);
        ctx.stroke();
      }
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    return;
  }

  if (form.split > 0.01) {
    const gap = form.split * r * 0.12;
    const { width, height } = ctx.canvas;
    for (const half of [-1, 1]) {
      ctx.save();
      ctx.translate(0, (gap / 2) * half);
      ctx.beginPath();
      ctx.rect(-geo.box, half < 0 ? -geo.box : cy, width + geo.box * 2, half < 0 ? cy + geo.box : height + geo.box);
      ctx.clip();
      paintSphere();
      ctx.restore();
    }
  } else {
    paintSphere();
  }

  // Voice ring: segments batched by alpha (a handful of strokes per frame).
  if (fr.ring) {
    const { ringR, segBase, segMax, segW } = geo;
    ctx.strokeStyle = pal.solid;
    ctx.lineCap = "round";
    ctx.lineWidth = segW;
    for (let bucket = 1; bucket <= 8; bucket++) {
      let any = false;
      ctx.beginPath();
      for (let k = 0; k < SEGS; k++) {
        let a = fr.segAlpha[k] ?? 0;
        if (a < 0.02) continue;
        if (fr.reducedTransparency) a = Math.max(0.5, a); // minimum line alpha 0.5
        if (Math.min(8, Math.max(1, Math.round(a * 8))) !== bucket) continue;
        const L = segBase + (segMax - segBase) * (fr.segLen[k] ?? 0);
        // Listening grows about the ring (sound coming in), speaking grows outward (sound going out).
        const start = fr.state === "listening" ? ringR - (L - segBase) / 2 : ringR;
        const ang = segmentAngle(k);
        const c = Math.cos(ang);
        const s = Math.sin(ang);
        ctx.moveTo(cx + c * start, cy + s * start);
        ctx.lineTo(cx + c * (start + L), cy + s * (start + L));
        any = true;
      }
      if (!any) continue;
      ctx.globalAlpha = (bucket / 8) * mul;
      ctx.stroke();
    }

    // Reduced motion: thinking is a double ring, speaking three concentric rings.
    if (fr.reducedMotion && (fr.state === "thinking" || fr.state === "speaking")) {
      const radii = fr.state === "thinking" ? [ringR + segMax * 0.75] : [ringR + segMax * 0.55, ringR + segMax * 1.05];
      ctx.lineWidth = segW;
      ctx.globalAlpha = 0.7 * mul;
      for (const rad of radii) {
        if (rad > geo.box / 2 - segW) continue;
        ctx.beginPath();
        ctx.arc(cx, cy, rad, 0, TAU);
        ctx.stroke();
      }
    }
  }

  ctx.restore();
  ctx.globalAlpha = 1;
}

/* ---------------------------------------------------------------------------------------------
 * Canvas renderer: one rAF loop that pauses off screen and in hidden tabs. Under reduced motion
 * it draws a still frame and stops (after a 150ms crossfade when the state changes).
 * -------------------------------------------------------------------------------------------*/

interface CanvasProps {
  state: VoiceOrbState;
  levelFor: () => number;
  bandsFor: () => ReturnType<VoiceOrbBands> | undefined;
  weatherFor: () => VoiceOrbWeather | null | undefined;
  weatherKey: string;
  halo: boolean;
  ring: boolean;
  reducedMotion: boolean;
  reducedTransparency: boolean;
}

function OrbCanvas(props: CanvasProps) {
  const latest = React.useRef(props);
  React.useLayoutEffect(() => {
    latest.current = props;
  });

  // Created once (a plain useRef initialiser would rebuild the typed arrays on every render).
  const [initial] = React.useState(() => ({
    canvas: null as HTMLCanvasElement | null,
    ctx: null as CanvasRenderingContext2D | null,
    raw: "",
    pal: palette(""),
    colorAt: 0,
    raf: 0,
    running: false,
    /** On screen (IntersectionObserver) and the tab is shown. */
    visible: true,
    onScreen: true,
    last: 0,
    form: { ...FORMS[props.state] },
    phase: { ...STILL_PHASE },
    level: 0,
    first: true,
    bins: new Float32Array(MAX_BINS),
    nb: 24,
    gains: new Float32Array(32),
    segLen: new Float32Array(SEGS),
    segAlpha: new Float32Array(SEGS),
    tLen: new Float32Array(SEGS),
    tAlpha: new Float32Array(SEGS),
    clock: 0,
    shownState: props.state,
    since: 0,
    fadeFrom: null as VoiceOrbState | null,
    fadeAt: 0,
    jitterUntil: 0,
    aqiSev: 0,
    aqi: null as string | null,
    /** Last painted frame (the frame cap) and the canvas size from the ResizeObserver. */
    lastPaint: 0,
    w: 0,
    h: 0,
    buf: sphereBuf(1, 1),
  }));
  const loop = React.useRef(initial);

  const draw = React.useCallback((now: number) => {
    const st = loop.current;
    st.raf = 0;
    const { canvas, ctx } = st;
    if (!canvas || !ctx) {
      st.running = false;
      return;
    }
    const p = latest.current;
    // Frame cap: 60 fps while the voice moves or it is thinking, 30 fps at rest (idle,
    // error). 90-120 Hz phones otherwise paint the orb two to four times more than needed.
    if (!p.reducedMotion && st.lastPaint && st.visible) {
      const busy = p.state === "listening" || p.state === "speaking" || p.state === "thinking";
      const gap = busy ? 1000 / 60 - 2 : 1000 / 30 - 2;
      if (now - st.lastPaint < gap) {
        st.raf = requestAnimationFrame(drawRef.current);
        return;
      }
    }
    st.lastPaint = now;
    const dt = st.last ? Math.min(0.05, Math.max(0, (now - st.last) / 1000)) : 1 / 60;
    st.last = now;
    st.clock += dt;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    // Size from the ResizeObserver: reading clientWidth here would force a layout every frame.
    if (!st.w || !st.h) {
      st.w = canvas.clientWidth;
      st.h = canvas.clientHeight;
    }
    const width = st.w;
    const height = st.h;
    const bw = Math.max(1, Math.round(width * dpr));
    const bh = Math.max(1, Math.round(height * dpr));
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
    // The colour only changes with the state or theme; invalidate() resets colorAt then.
    if (!st.colorAt) {
      const raw = getComputedStyle(canvas).color || "";
      if (raw !== st.raw) {
        st.raw = raw;
        st.pal = palette(raw);
      }
      st.colorAt = now || 1;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const { state, reducedMotion, reducedTransparency } = p;
    const weather = p.weatherFor();

    // State bookkeeping (time in state, reduced-motion crossfade).
    if (state !== st.shownState) {
      if (reducedMotion) {
        st.fadeFrom = st.shownState;
        st.fadeAt = now;
      }
      st.shownState = state;
      st.since = 0;
    } else {
      st.since += dt;
    }

    // Back-face AQI tint, read from the token once per change.
    const sev = weather && !reducedTransparency ? Math.round(weather.aqiSeverity) : 0;
    if (sev !== st.aqiSev) {
      st.aqiSev = sev;
      st.aqi =
        sev >= 3
          ? getComputedStyle(document.documentElement).getPropertyValue(`--color-aqi-${Math.min(6, sev)}`).trim() || AQI_FALLBACK[Math.min(6, sev)] || null
          : null;
    }

    const geo = geometry(width, height, p.halo, p.ring);
    const ring = p.ring && geo.spherePx >= 48;
    const dens = density(geo.spherePx);
    if (st.buf.lines !== dens.lines || st.buf.samples !== dens.samples) st.buf = sphereBuf(dens.lines, dens.samples);
    let keep = false;

    if (reducedMotion) {
      const frameFor = (s: VoiceOrbState, mul: number): Frame => {
        ringTargets(s, 99, st.bins.fill(0), st.nb, true, st.tLen, st.tAlpha);
        return {
          geo,
          ring,
          form: stillForm(s, weather, reducedTransparency),
          phase: STILL_PHASE,
          state: s,
          level: 0,
          gains: null,
          segLen: st.tLen,
          segAlpha: st.tAlpha,
          pal: st.pal,
          aqi: st.aqi,
          reducedMotion: true,
          reducedTransparency,
          mul,
          dx: 0,
          buf: st.buf,
        };
      };
      const fade = st.fadeFrom ? Math.min(1, (now - st.fadeAt) / 150) : 1;
      if (st.fadeFrom && fade < 1) {
        render(ctx, frameFor(st.fadeFrom, 1 - fade));
        keep = true;
      } else {
        st.fadeFrom = null;
      }
      render(ctx, frameFor(state, fade));
      st.form = stillForm(state, weather, reducedTransparency);
      st.phase = { ...STILL_PHASE };
      st.level = 0;
      st.segLen.fill(0);
      st.segAlpha.fill(0);
      st.first = true;
    } else {
      const voiced = state === "listening" || state === "speaking";
      const raw = voiced ? p.levelFor() : 0;
      st.level = approach(st.level, raw, raw > st.level ? 16 : 5, dt);

      // Spectrum bins: real bands when given, otherwise a lively spread derived from the level.
      const src = voiced ? p.bandsFor() : null;
      let nb = 24;
      if (src && src.length > 0) {
        nb = Math.min(MAX_BINS, src.length);
        // Byte bins (getByteFrequencyData) are 0..255; float bins are already 0..1.
        const bytes = src instanceof Uint8Array || src instanceof Uint8ClampedArray;
        for (let b = 0; b < nb; b++) {
          let v = Number(src[b]) || 0;
          if (bytes || v > 1) v /= 255;
          const target = clamp01(v);
          st.bins[b] = approach(st.bins[b] ?? 0, target, target > (st.bins[b] ?? 0) ? 1 / 0.06 : 1 / 0.25, dt);
        }
      } else {
        for (let b = 0; b < nb; b++) {
          const wobble = 0.5 + 0.5 * Math.sin(st.clock * (2.2 + b * 0.37) + b * 1.9);
          const target = voiced ? clamp01(st.level * (0.35 + 0.65 * wobble) * (1 - (0.35 * b) / nb) * 1.25) : 0;
          st.bins[b] = approach(st.bins[b] ?? 0, target, target > (st.bins[b] ?? 0) ? 1 / 0.06 : 1 / 0.25, dt);
        }
      }
      st.nb = nb;

      // Ease the form toward its target.
      let target = targetForm(state, st.level, weather, reducedTransparency);
      if (now < st.jitterUntil) target = { ...target, split: Math.max(target.split, 0.15) };
      for (const key of KEYS) {
        const rate = key === "split" || key === "squash" ? 11 : key === "trace" ? 4 : 6;
        st.form[key] = st.first ? target[key] : approach(st.form[key], target[key], rate, dt);
      }
      st.first = false;
      const form = st.form;
      st.phase.flow += dt * form.stir;
      st.phase.wave += dt * form.travel * 6;
      st.phase.turn += dt * form.turn;
      st.phase.breath += (dt * TAU) / (BREATH[state] ?? 3.6);
      st.phase.trace += dt * 0.42;
      st.phase.sweep = (st.phase.sweep + dt / 1.8) % 1;
      st.phase.rain += dt * 2.4;
      st.phase.drift += dt * 6;

      // Spectrum gain per contour line: low bins on the lower lines, high bins on the upper ones.
      const { lines } = dens;
      let gains: Float32Array | null = null;
      if (voiced) {
        gains = st.gains;
        for (let i = 0; i < lines; i++) gains[i] = 0.045 * (st.bins[Math.min(nb - 1, Math.floor((i / lines) * nb))] ?? 0);
      }

      // Ring segments: rise in 60ms, fall in 250ms.
      ringTargets(state, st.since, st.bins, nb, false, st.tLen, st.tAlpha);
      for (let k = 0; k < SEGS; k++) {
        const tl = st.tLen[k] ?? 0;
        const cl = st.segLen[k] ?? 0;
        st.segLen[k] = approach(cl, tl, tl > cl ? 1 / 0.06 : 1 / 0.25, dt);
        st.segAlpha[k] = approach(st.segAlpha[k] ?? 0, st.tAlpha[k] ?? 0, state === "thinking" ? 30 : 10, dt);
      }

      // Error: one sideways settle, 6px to 0 over 400ms.
      let dx = 0;
      if (state === "error" && st.since < 0.4) {
        const t = st.since / 0.4;
        dx = 6 * (1 - (1 - (1 - t) ** 3));
      }

      render(ctx, {
        geo,
        ring,
        form,
        phase: st.phase,
        state,
        level: st.level,
        gains,
        segLen: st.segLen,
        segAlpha: st.segAlpha,
        pal: st.pal,
        aqi: st.aqi,
        reducedMotion: false,
        reducedTransparency,
        mul: 1,
        dx,
        buf: st.buf,
      });
      keep = true; // the orb is one of the few things allowed to loop
    }

    if (keep && st.visible) st.raf = requestAnimationFrame(drawRef.current);
    else {
      st.running = false;
      st.last = 0;
    }
  }, []);
  const drawRef = React.useRef(draw);

  const invalidate = React.useCallback(() => {
    const st = loop.current;
    st.colorAt = 0;
    if (st.running || !st.ctx) return;
    st.running = true;
    st.raf = requestAnimationFrame(drawRef.current);
  }, []);

  const ref = React.useCallback(
    (canvas: HTMLCanvasElement | null) => {
      const st = loop.current;
      if (st.raf) cancelAnimationFrame(st.raf);
      st.raf = 0;
      st.running = false;
      st.canvas = canvas;
      st.ctx = canvas?.getContext("2d") ?? null;
      st.w = 0;
      st.h = 0;
      if (!canvas) return;
      const update = () => {
        st.visible = st.onScreen && !document.hidden;
        if (st.visible) invalidate();
      };
      const resize =
        typeof ResizeObserver !== "undefined"
          ? new ResizeObserver((entries) => {
              const box = entries[entries.length - 1]?.contentRect;
              if (box) {
                st.w = box.width;
                st.h = box.height;
              }
              invalidate();
            })
          : null;
      resize?.observe(canvas);
      const io =
        typeof IntersectionObserver !== "undefined"
          ? new IntersectionObserver((entries) => {
              const entry = entries[entries.length - 1];
              st.onScreen = entry ? entry.isIntersecting : true;
              update();
            })
          : null;
      io?.observe(canvas);
      const onVisibility = update;
      const onLightning = () => {
        const p = latest.current;
        if (p.reducedMotion || !p.weatherFor()?.storm) return;
        st.jitterUntil = performance.now() + 300;
        invalidate();
      };
      document.addEventListener("visibilitychange", onVisibility);
      window.addEventListener(ORB_LIGHTNING_EVENT, onLightning);
      invalidate();
      return () => {
        resize?.disconnect();
        io?.disconnect();
        document.removeEventListener("visibilitychange", onVisibility);
        window.removeEventListener(ORB_LIGHTNING_EVENT, onLightning);
        if (st.raf) cancelAnimationFrame(st.raf);
        st.raf = 0;
        st.running = false;
        st.last = 0;
        st.canvas = null;
        st.ctx = null;
      };
    },
    [invalidate],
  );

  // Anything that changes a still frame: draw again.
  const { state, reducedMotion, reducedTransparency, weatherKey, halo, ring } = props;
  React.useEffect(() => {
    invalidate();
  }, [state, reducedMotion, reducedTransparency, weatherKey, halo, ring, invalidate]);

  return <canvas ref={ref} aria-hidden data-slot="voice-orb-canvas" className="absolute inset-0 size-full" />;
}

/** The voice presence: a lit sphere of contour lines with a voice ring, tinted with `currentColor`. */
export function VoiceOrb({
  state = "idle",
  level,
  bands,
  weather,
  halo,
  ring,
  size = 144,
  label,
  lang = "en",
  className,
  style,
  ...props
}: VoiceOrbProps) {
  const prefersReducedMotion = useMedia("(prefers-reduced-motion: reduce)");
  const prefersReducedTransparency = useMedia("(prefers-reduced-transparency: reduce)");
  const calm = useCalm();
  const reducedMotion = prefersReducedMotion || calm;
  const reducedTransparency = prefersReducedTransparency || calm;

  const safeWeather = cleanWeather(weather);
  const sources = React.useRef({ level, bands, weather: safeWeather });
  React.useLayoutEffect(() => {
    sources.current = { level, bands, weather: safeWeather };
  });
  const levelFor = React.useCallback(() => readLevel(sources.current.level), []);
  const bandsFor = React.useCallback(() => {
    try {
      return sources.current.bands?.();
    } catch {
      return null;
    }
  }, []);
  const weatherFor = React.useCallback(() => sources.current.weather, []);
  const weatherKey = safeWeather
    ? `${safeWeather.family}|${safeWeather.storm ? 1 : 0}|${safeWeather.aqiSeverity}|${Math.round(safeWeather.windKph)}`
    : "";

  const px = Number.isFinite(size) && size > 0 ? size : 144;
  const haloOn = Boolean(halo);
  const ringOn = haloOn || (ring ?? px >= 96);
  const box = haloOn ? Math.round(px * VOICE_ORB_HALO_RATIO) : px;
  // Error is part of its meaning: the orb sets that colour itself (a caller's style.color still wins).
  const color = state === "error" ? "var(--color-danger, #FF8A8A)" : undefined;

  return (
    <div
      role="img"
      aria-label={label ?? voiceOrbWord(state, lang)}
      data-slot="voice-orb"
      data-voice-state={state}
      style={{ width: box, height: box, ...(color ? { color } : null), ...style }}
      // The state sets the colour class (spec 6.1); a caller's text colour class still wins.
      className={cn("relative shrink-0 select-none", voiceOrbColorClass(state), className)}
      {...props}
    >
      <OrbCanvas
        state={state}
        levelFor={levelFor}
        bandsFor={bandsFor}
        weatherFor={weatherFor}
        weatherKey={weatherKey}
        halo={haloOn}
        ring={ringOn}
        reducedMotion={reducedMotion}
        reducedTransparency={reducedTransparency}
      />
    </div>
  );
}
