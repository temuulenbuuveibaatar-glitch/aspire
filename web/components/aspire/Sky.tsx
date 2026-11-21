"use client";

// The live sky. Two modes:
// - overlay (over the city photo in Backdrop): clouds, precipitation, fog, storm flashes and, on a
//   clear dark night, a few stars high up, over transparency. No gradient or vignette. With `photo`,
//   rain also beads on the glass (RainGlass, WebGL) and refracts the photo.
// - full (login, no photo): a gradient per weather family x time-of-day phase that crossfades on
//   change, stars at night and a vignette, plus everything above.
// Particles live in a preallocated Float32Array pool, so a frame allocates nothing. The loop runs
// only while something falls and pauses while the tab is hidden. Reduced motion or Calm mode: one
// still frame, no rAF, no flashes.

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { RainGlass } from "@/components/aspire/RainGlass";
import { ORB_LIGHTNING_EVENT } from "@/components/ui/voice-orb";
import { SKY_KINDS, type SkyKind } from "@/lib/ambient-types";
import { useStill } from "@/lib/display-prefs";
import { DARK, skySun, type SkyPhase } from "@/lib/sun";
import { cn } from "@/lib/utils";

export interface SkyProps {
  kind: SkyKind;
  /** 0..1: how hard it rains or snows, how thick the fog is. */
  intensity: number;
  isDay: boolean;
  windKph?: number | null;
  /** 0..23 in the place's time zone. */
  localHour?: number | null;
  /** The time-of-day phase when the caller knows it (the real sun); else from isDay and localHour. */
  phase?: SkyPhase | null;
  /** 0..100 from the weather; drifting cloud banks scale with it. */
  cloudCover?: number | null;
  className?: string;
  /** Draw only particles, fog and flashes over transparency (the photo backdrop). */
  overlay?: boolean;
  /** The https photo under the overlay: rain, drizzle and storm then also bead on the glass and refract it (WebGL). */
  photo?: string | null;
}

export type Family = "clear" | "cloud" | "fog" | "rain" | "storm" | "snow";
type Phase = "night" | "dawn" | "golden" | "day" | "dusk";

const FAMILY: Record<SkyKind, Family> = {
  clear: "clear", partly: "clear", cloudy: "cloud", fog: "fog", drizzle: "rain",
  rain: "rain", sleet: "rain", hail: "rain", storm: "storm", snow: "snow",
};

/** Trust boundary: the kind comes from the ambient API. Anything unknown is a clear sky. */
export function safeKind(kind: unknown): SkyKind {
  return (SKY_KINDS as readonly unknown[]).includes(kind) ? (kind as SkyKind) : "clear";
}

export function skyFamily(kind: unknown): Family {
  return FAMILY[safeKind(kind)];
}

const GRADIENTS: Record<Family, Record<Phase, [top: string, horizon: string]>> = {
  clear: { night: ["#050A18", "#1B2A4A"], dawn: ["#2B3A67", "#F0A98A"], golden: ["#6A5ACD", "#F29E6B"], day: ["#3B82C4", "#9CC9EE"], dusk: ["#1E2450", "#C7708A"] },
  cloud: { night: ["#0A0F1A", "#222B3A"], dawn: ["#3A4258", "#9C8A8A"], golden: ["#6E6A86", "#C9A08A"], day: ["#6E8296", "#B4C2CF"], dusk: ["#2A2F45", "#7A6878"] },
  fog: { night: ["#10151E", "#2C333D"], dawn: ["#5A6070", "#A8A6A8"], golden: ["#8F8A90", "#D2BFAE"], day: ["#8A96A3", "#C3CBD3"], dusk: ["#3E4350", "#858792"] },
  rain: { night: ["#070B12", "#1A2330"], dawn: ["#2A3340", "#5E6672"], golden: ["#3A3A4A", "#7A6A6A"], day: ["#2E3A48", "#5B6B7A"], dusk: ["#1C2230", "#3E4656"] },
  storm: { night: ["#05070D", "#161A26"], dawn: ["#1A1F2B", "#3A3550"], golden: ["#24202E", "#4A3A48"], day: ["#1A1F2B", "#3A3550"], dusk: ["#10131C", "#2A2638"] },
  snow: { night: ["#0E1626", "#2E3D55"], dawn: ["#6F7C99", "#D9C9CF"], golden: ["#A9A3BC", "#F1D5C2"], day: ["#C9D6E3", "#EEF3F8"], dusk: ["#3D4763", "#8E93AE"] },
};

/** The ten time-of-day phases on the five-phase colour grid. */
const GRID: Record<SkyPhase, Phase> = {
  midnight: "night", night: "night", evening: "night", dawn: "dusk", sunrise: "dawn",
  day: "day", afternoon: "day", golden: "golden", sunset: "golden", dusk: "dusk",
};

/* ---- colour helpers ---- */

function hexRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mixHex(a: string, b: string, t: number): string {
  const y = hexRgb(b);
  return "#" + hexRgb(a).map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, "0")).join("");
}
function rgba(hex: string, a: number): string {
  return `rgba(${hexRgb(hex).join(", ")}, ${clamp(a, 0, 1).toFixed(3)})`;
}
function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function skyBackground(top: string, horizon: string, phase: Phase): string {
  const warm = phase === "dawn" || phase === "golden" || phase === "dusk";
  const glow = mixHex(horizon, "#FFFFFF", warm ? 0.18 : 0.08);
  return [
    `radial-gradient(140% 55% at 50% 108%, ${rgba(glow, warm ? 0.55 : phase === "night" ? 0.22 : 0.32)} 0%, ${rgba(glow, 0)} 70%)`,
    `linear-gradient(180deg, ${rgba("#02060F", phase === "day" ? 0.06 : 0.16)} 0%, ${rgba("#02060F", 0)} 38%)`,
    `linear-gradient(180deg, ${top} 0%, ${mixHex(top, horizon, 0.38)} 52%, ${horizon} 100%)`,
  ].join(", ");
}

/* ---- environment stores (useSyncExternalStore keeps SSR and hydration honest) ---- */

const noop = () => () => {};
/** 0.5 on low-end devices (smaller particle budget, 30 fps, no photo drift), otherwise 1. */
export function getTier(): number {
  const nav = navigator as Navigator & { connection?: { saveData?: boolean }; deviceMemory?: number };
  return (nav.hardwareConcurrency ?? 8) <= 4 || (nav.deviceMemory ?? 8) <= 4 || nav.connection?.saveData ? 0.5 : 1;
}

/* ---- particle engine ---- */

/** bright: snow or fog by day (flakes get a slate rim to stay visible on white). starVis: a clear dark sky. sparse: over a photo (a few stars, high up). */
interface Scene { kind: SkyKind; intensity: number; windKph: number; night: boolean; bright: boolean; starVis: number; sparse: boolean; still: boolean }

const STRIDE = 11;
const X = 0, Y = 1, VY = 2, LEN = 3, SIZE = 4, PH = 5, FQ = 6, AMP = 7, LAYER = 8, TYPE = 9, ALPHA = 10;
const T_STREAK = 0, T_DOT = 1, T_PELLET = 2;
const BASE: Record<SkyKind, number> = { clear: 0, partly: 0, cloudy: 0, fog: 0, drizzle: 60, rain: 180, storm: 320, snow: 120, sleet: 140, hail: 90 };
type Range = readonly [number, number];
const RAIN_V: readonly Range[] = [[450, 600], [650, 850], [900, 1200]];
/** Near flakes are big soft bokeh that float slower than the mid layer (they read as close to the lens). */
const SNOW_V: readonly Range[] = [[25, 35], [40, 55], [32, 46]];
const SLEET_V: readonly Range[] = [[150, 190], [200, 250], [260, 320]];
const HAIL_V: readonly Range[] = [[560, 640], [650, 740], [720, 820]];
const SNOW_R: readonly Range[] = [[0.8, 1.2], [1.4, 2], [3, 5]];
const HAIL_R: readonly Range[] = [[1.5, 1.9], [1.8, 2.2], [2.1, 2.5]];
const HAIL_LEN: Range = [3, 6];
const SPEED_BY: Partial<Record<SkyKind, number>> = { drizzle: 0.6, rain: 1, storm: 1.12, sleet: 0.85 };
/** Motion-blur length by depth (far thin and short, near long): a streak is the drop's path during one exposure. */
const STREAK_LEN: readonly Range[] = [[15, 25], [26, 44], [45, 90]];
const LEN_K: Partial<Record<SkyKind, number>> = { drizzle: 0.55, sleet: 0.75 };
/** Stroke width by depth; drizzle is finer. */
const RAIN_W = [0.8, 1.2, 1.9];
const PARALLAX = [0.6, 0.8, 1];
const RAIN_A = [0.3, 0.45, 0.65];
/** Rain and storm never thin below this many streaks, even on a low-tier phone: a dozen strands read as dust, not rain. */
const RAIN_FLOOR = 60;
const SNOW_A = [0.45, 0.65, 0.5];
const SLEET_A = [0.35, 0.5, 0.65];
const HAIL_STYLE = [0.5, 0.6, 0.7].map((a) => `rgba(236, 242, 252, ${a})`);
const HAIL_W = [2.6, 3.4, 4.4];
const STAR_TINTS = ["rgb(240, 244, 255)", "rgb(255, 236, 214)", "rgb(205, 220, 255)"];
const DEG = Math.PI / 180;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sprite(size: number, stops: [number, string][]): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g2 = c.getContext("2d");
  if (g2) {
    const g = g2.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    for (const [o, col] of stops) g.addColorStop(o, col);
    g2.fillStyle = g;
    g2.fillRect(0, 0, size, size);
  }
  return c;
}

/** Stars, seeded so they stay put across resizes. Sparse (over a photo): a third of them, in the top 40%. */
function drawNight(c: CanvasRenderingContext2D, w: number, h: number, vis: number, sparse: boolean) {
  const r = mulberry32(1337 + Math.round(w) * 7 + Math.round(h));
  const n = Math.round((60 + 60 * clamp((w - 390) / 1050, 0, 1)) * (sparse ? 0.35 : 1));
  const band = h * (sparse ? 0.4 : 0.72);
  for (let k = 0; k < n; k++) {
    const x = r() * w, y = Math.pow(r(), 1.5) * band, tp = r();
    c.globalAlpha = (0.4 + 0.6 * r()) * (1 - (y / band) * 0.55) * vis;
    c.fillStyle = STAR_TINTS[tp < 0.12 ? 1 : tp < 0.28 ? 2 : 0];
    c.beginPath();
    c.arc(x, y, 0.5 + r(), 0, Math.PI * 2);
    c.fill();
  }
  c.globalAlpha = 1;
}

interface Sys { kind: SkyKind; data: Float32Array; count: number; fade: number; dir: number; rand: () => number }

/** A streak covers at least its own travel per frame (plus 10%), so at 30 fps it reads as a falling line, not a hopping dot. */
export function streakLen(len: number, vy: number, fps: number): number {
  return Math.max(len, (vy / fps) * 1.1);
}

/** Particles for a scene: base x intensity x screen area x device tier, a floor for rain and storm, then the still factor, capped at max. */
export function particleBudget(kind: SkyKind, intensity: number, area: number, tier: number, still: boolean, max: number): number {
  let n = BASE[kind] * (0.4 + 0.6 * intensity) * area * tier;
  if (kind === "rain" || kind === "storm") n = Math.max(n, RAIN_FLOOR);
  return Math.min(max, Math.round(n * (still ? 0.3 : 1)));
}

/** One rain streak on depth layer L (0 far .. 2 near) at u in 0..1: fall speed px/s, blur length px, width px. Length rises with speed. */
export function rainStreak(kind: SkyKind, L: number, u: number, intensity: number, fps = 60): { vy: number; len: number; width: number } {
  const at = (rg: Range) => rg[0] + (rg[1] - rg[0]) * u;
  const vy = at(RAIN_V[L]) * (SPEED_BY[kind] ?? 1) * (0.92 + 0.16 * intensity);
  return { vy, len: streakLen(at(STREAK_LEN[L]) * (LEN_K[kind] ?? 1), vy, fps), width: RAIN_W[L] * (kind === "drizzle" ? 0.6 : 1) };
}

/** Lightning waits at least 6 s between flashes (r in 0..1), so it never strobes. */
export function flashDelay(r: number): number {
  return 6000 + 8000 * clamp(r, 0, 1);
}

/** A faint single bolt as polyline points in a 0..100 box: from the top down to 40-60%, jagged sideways. */
export function boltPoints(rand: () => number): string {
  let x = 20 + 60 * rand();
  const end = 40 + 20 * rand();
  const pts = [`${x.toFixed(1)},0`];
  for (let k = 1; k <= 10; k++) {
    x = clamp(x + (rand() - 0.5) * 9, 2, 98);
    pts.push(`${x.toFixed(1)},${((end * k) / 10).toFixed(1)}`);
  }
  return pts.join(" ");
}

/** A rain streak sprite: transparent tail fading in to a bright head at the bottom, soft at the sides. */
function streakSprite(rgb: string): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 8;
  c.height = 64;
  const g = c.getContext("2d");
  if (!g) return c;
  const v = g.createLinearGradient(0, 0, 0, 64);
  v.addColorStop(0, `rgba(${rgb}, 0)`);
  v.addColorStop(0.55, `rgba(${rgb}, 0.35)`);
  v.addColorStop(0.92, `rgba(${rgb}, 1)`);
  v.addColorStop(1, `rgba(${rgb}, 0.55)`);
  g.fillStyle = v;
  g.fillRect(0, 0, 8, 64);
  g.globalCompositeOperation = "destination-in";
  const s = g.createLinearGradient(0, 0, 8, 0);
  s.addColorStop(0, "rgba(0, 0, 0, 0)");
  s.addColorStop(0.5, "rgba(0, 0, 0, 1)");
  s.addColorStop(1, "rgba(0, 0, 0, 0)");
  g.fillStyle = s;
  g.fillRect(0, 0, 8, 64);
  return c;
}

function createEngine(canvas: HTMLCanvasElement, tier: number) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const MAX = tier < 1 ? 260 : 520;
  const FPS = tier < 1 ? 30 : 60;
  const night = document.createElement("canvas");
  // Flake sprites: crisp (far, mid) and soft bokeh (near); the Day pair keeps a slate rim for white skies.
  const crisp = sprite(32, [[0, "rgba(244,248,255,1)"], [0.42, "rgba(234,242,255,0.95)"], [0.62, "rgba(234,242,255,0.28)"], [1, "rgba(234,242,255,0)"]]);
  const crispDay = sprite(32, [[0, "rgba(248,250,255,1)"], [0.36, "rgba(240,245,252,0.95)"], [0.5, "rgba(70,85,110,0.5)"], [0.75, "rgba(70,85,110,0.16)"], [1, "rgba(70,85,110,0)"]]);
  const soft = sprite(64, [[0, "rgba(240,246,255,0.9)"], [0.3, "rgba(236,243,255,0.55)"], [0.65, "rgba(234,242,255,0.14)"], [1, "rgba(234,242,255,0)"]]);
  const softDay = sprite(64, [[0, "rgba(246,249,255,0.95)"], [0.26, "rgba(236,242,250,0.7)"], [0.42, "rgba(80,95,120,0.3)"], [0.7, "rgba(80,95,120,0.08)"], [1, "rgba(80,95,120,0)"]]);
  // Streaks: cool blue at night and in storms, pale grey by day.
  const streakDay = streakSprite("225, 232, 245");
  const streakNight = streakSprite("170, 200, 255");
  let streak = streakDay;
  // Splash ripples near the bottom edge: a small ring buffer of x, y, age (s), size.
  const SPLASHES = 48, SPLASH_T = 0.35;
  const splash = new Float32Array(SPLASHES * 4).fill(SPLASH_T);
  let splashAt = 0;

  let w = 0, h = 0, dpr = 1;
  let scene: Scene | null = null;
  let cur: Sys | null = null;
  let prev: Sys | null = null;
  let theta = 0, thetaTarget = 0, tanT = 0, drift = 0, sway = 1;
  let raf = 0, last = 0, lastDraw = 0, t = 0;
  let destroyed = false, nightKey = "";
  // Off screen (the hero scrolled away): no frames until it is back.
  let onScreen = true;
  const rainAlpha = [0, 0, 0];

  const budget = (s: Scene) => {
    const area = clamp((w * h) / (390 * 844), 0.6, 2.2);
    return particleBudget(s.kind, s.intensity, area, tier, s.still, MAX);
  };

  /** mode 0: scatter over the screen; 1: respawn just above the top; 2: flow in from well above. */
  function spawn(sys: Sys, i: number, mode: 0 | 1 | 2) {
    const r = sys.rand, k = sys.kind, I = scene ? scene.intensity : 0.5;
    const pick = r();
    const L = pick < 0.45 ? 0 : pick < 0.8 ? 1 : 2;
    const type = k === "snow" ? T_DOT : k === "hail" ? T_PELLET : k === "sleet" && r() < 0.5 ? T_DOT : T_STREAK;
    const lerp = (rg: Range) => rg[0] + (rg[1] - rg[0]) * r();
    let vy: number, len: number, size = 1, alpha = 1;
    if (type === T_STREAK) {
      ({ vy, len } = rainStreak(k, L, r(), I, FPS));
    } else if (type === T_PELLET) {
      vy = lerp(HAIL_V[L]);
      len = lerp(HAIL_LEN);
      size = lerp(HAIL_R[L]);
    } else {
      const sleet = k === "sleet";
      vy = sleet ? lerp(SLEET_V[L]) : lerp(SNOW_V[L]) * (0.9 + 0.25 * I);
      size = sleet ? 1 + 0.5 * r() : lerp(SNOW_R[L]) * (0.9 + 0.3 * I);
      alpha = (sleet ? SLEET_A : SNOW_A)[L];
      len = size * 3;
    }
    const y = mode === 0 ? r() * (h + len) - len : mode === 1 ? -len - r() * 60 : -len - r() * h * 0.6;
    // Respawns start upwind so the slant never leaves a bare strip on one side.
    const extra = mode === 0 ? 0 : type === T_DOT ? clamp((drift * h) / Math.max(vy, 20), 0, w * 0.6) : clamp(h * Math.max(tanT, 0), 0, w);
    const x = r() * (w + extra) - extra;
    // Near bokeh flakes sway slower and wider.
    const bokeh = type === T_DOT && L === 2 && k === "snow";
    sys.data.set([x, y, vy, len, size, r() * Math.PI * 2, (0.3 + 0.5 * r()) * Math.PI * 2 * (bokeh ? 0.5 : 1), (6 + 18 * r()) * (bokeh ? 1.4 : 1), L, type, alpha], i * STRIDE);
  }

  function setCount(sys: Sys, n: number, mode: 0 | 2) {
    for (let i = sys.count; i < n; i++) spawn(sys, i, mode);
    sys.count = n;
  }

  /** Pre-renders the stars once per size and visibility. */
  function buildNight() {
    const vis = scene ? scene.starVis : 0;
    const sparse = !!scene?.sparse;
    const key = vis > 0 ? `${w}x${h}@${dpr}|${vis}|${sparse}` : "";
    if (key === nightKey) return;
    nightKey = key;
    const nctx = night.getContext("2d");
    if (!key || !nctx) return;
    night.width = Math.round(w * dpr);
    night.height = Math.round(h * dpr);
    nctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawNight(nctx, w, h, vis, sparse);
  }

  const wantsAnim = () => !!scene && !scene.still && ((cur !== null && cur.count > 0) || prev !== null);

  function update(dt: number) {
    theta += (thetaTarget - theta) * Math.min(1, dt * 0.8);
    const gust = scene?.kind === "storm" ? 1 + 0.2 * Math.sin(t * 0.35) + 0.08 * Math.sin(t * 1.9 + 1.3) : 1 + 0.06 * Math.sin(t * 0.25);
    tanT = Math.tan(theta * gust);
    for (const sys of [prev, cur]) {
      if (!sys) continue;
      if (sys.dir !== 0) {
        sys.fade = clamp(sys.fade + (sys.dir * dt) / 1.2, 0, 1);
        if (sys.fade === 1 && sys.dir > 0) sys.dir = 0;
      }
      const d = sys.data;
      for (let i = 0; i < sys.count; i++) {
        const o = i * STRIDE;
        d[o + Y] += d[o + VY] * dt;
        d[o + X] += d[o + TYPE] === T_DOT
          ? (drift * PARALLAX[d[o + LAYER]] + Math.sin(t * d[o + FQ] + d[o + PH]) * d[o + AMP] * sway) * dt
          : d[o + VY] * tanT * dt;
        if (d[o + Y] - d[o + LEN] > h) {
          // Some mid and near rain drops land as a ripple in the bottom strip.
          if ((sys.kind === "rain" || sys.kind === "storm") && d[o + LAYER] > 0 && d[o + TYPE] === T_STREAK && sys.rand() < 0.12 + 0.3 * (scene?.intensity ?? 0.5)) {
            const s = splashAt++ % SPLASHES * 4;
            splash.set([d[o + X], h -sys.rand() * h * 0.1, 0, (3 + 4 * sys.rand()) * (d[o + LAYER] === 2 ? 1.5 : 1)], s);
          }
          spawn(sys, i, 1);
        } else if (d[o + X] > w + 30) d[o + X] -= w + 60;
        else if (d[o + X] < -30) d[o + X] += w + 60;
      }
    }
    for (let s = 2; s < splash.length; s += 4) if (splash[s] < SPLASH_T) splash[s] += dt;
    if (prev && prev.fade <= 0) prev = null;
  }

  /** Each streak is the sprite drawn along the fall direction: rotate once, then map every head into that frame. */
  function streaks(c: CanvasRenderingContext2D, d: Float32Array, n: number, L: number, width: number) {
    const norm = 1 / Math.sqrt(1 + tanT * tanT);
    const dx = tanT * norm;
    c.setTransform(dpr * norm, -dpr * dx, dpr * dx, dpr * norm, 0, 0);
    for (let i = 0; i < n; i++) {
      const o = i * STRIDE;
      if (d[o + TYPE] !== T_STREAK || d[o + LAYER] !== L) continue;
      const x = d[o + X], y = d[o + Y], len = d[o + LEN];
      c.drawImage(streak, norm * x - dx * y - width * 1.5, dx * x + norm * y - len, width * 3, len);
    }
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function ripples(c: CanvasRenderingContext2D) {
    c.lineWidth = 1;
    c.strokeStyle = streak === streakNight ? "rgb(190, 210, 255)" : "rgb(230, 236, 248)";
    for (let s = 0; s < splash.length; s += 4) {
      const p = splash[s + 2] / SPLASH_T;
      if (p >= 1) continue;
      const rx = splash[s + 3] * (0.3 + 0.7 * p);
      c.globalAlpha = (1 - p) * (1 - p) * 0.45;
      c.beginPath();
      c.ellipse(splash[s], splash[s + 1], rx, rx * 0.28, 0, 0, Math.PI * 2);
      c.stroke();
    }
    c.globalAlpha = 1;
  }

  /** Strokes every particle of one type and layer as a single path, from..to along its length. */
  function strokes(c: CanvasRenderingContext2D, d: Float32Array, n: number, type: number, L: number, from: number, to: number) {
    const norm = 1 / Math.sqrt(1 + tanT * tanT);
    const dx = tanT * norm;
    c.beginPath();
    for (let i = 0; i < n; i++) {
      const o = i * STRIDE;
      if (d[o + TYPE] !== type || d[o + LAYER] !== L) continue;
      const x = d[o + X], y = d[o + Y], len = d[o + LEN];
      c.moveTo(x - dx * len * from, y - norm * len * from);
      c.lineTo(x - dx * len * to, y - norm * len * to);
    }
    c.stroke();
  }

  function drawSys(c: CanvasRenderingContext2D, sys: Sys) {
    if (sys.fade <= 0 || sys.count === 0) return;
    const d = sys.data, n = sys.count, k = sys.kind;
    const bright = !!scene && scene.bright;
    c.lineCap = "round";
    for (let L = 0; L < 3; L++) {
      c.globalAlpha = sys.fade;
      if (k === "drizzle" || k === "rain" || k === "storm" || k === "sleet") {
        // Motion blur: a gradient streak, clear at the tail and brightest at the head.
        c.globalAlpha = sys.fade * rainAlpha[L];
        streaks(c, d, n, L, RAIN_W[L] * (k === "drizzle" ? 0.6 : 1));
      }
      if (k === "hail") {
        c.lineWidth = HAIL_W[L];
        c.strokeStyle = HAIL_STYLE[L];
        strokes(c, d, n, T_PELLET, L, 1, 0);
      }
      if (k === "snow" || k === "sleet") {
        const img = L === 2 ? (bright ? softDay : soft) : bright ? crispDay : crisp;
        const m = L === 2 ? 2.6 : 2;
        for (let i = 0; i < n; i++) {
          const o = i * STRIDE;
          if (d[o + TYPE] !== T_DOT || d[o + LAYER] !== L) continue;
          const half = d[o + SIZE] * m;
          c.globalAlpha = sys.fade * d[o + ALPHA];
          c.drawImage(img, d[o + X] - half, d[o + Y] - half, half * 2, half * 2);
        }
      }
    }
    c.globalAlpha = 1;
  }

  function draw() {
    ctx!.clearRect(0, 0, w, h);
    if (nightKey) ctx!.drawImage(night, 0, 0, w, h);
    if (prev) drawSys(ctx!, prev);
    if (cur) drawSys(ctx!, cur);
    ripples(ctx!);
  }

  function frame(now: number) {
    raf = 0;
    if (destroyed || document.hidden || !onScreen) return;
    // 60 fps, 30 on the low tier.
    if (now - lastDraw >= 1000 / FPS - 2) {
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = lastDraw = now;
      t += dt;
      update(dt);
      draw();
    }
    if (wantsAnim()) raf = requestAnimationFrame(frame);
  }
  function kick() {
    if (raf || destroyed || document.hidden || !onScreen || !wantsAnim()) return;
    last = performance.now();
    lastDraw = 0;
    raf = requestAnimationFrame(frame);
  }
  function stop() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const nw = Math.max(1, Math.round(rect.width || window.innerWidth));
    const nh = Math.max(1, Math.round(rect.height || window.innerHeight));
    // At most about 4 MP of backing store, so a big high-DPI screen costs no more than a laptop.
    const ndpr = Math.min(window.devicePixelRatio || 1, tier < 1 ? 1.5 : 2, Math.sqrt(4e6 / (nw * nh)));
    if (nw === w && nh === h && ndpr === dpr) return;
    const sx = w ? nw / w : 1, sy = h ? nh / h : 1;
    [w, h, dpr] = [nw, nh, ndpr];
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const sys of [prev, cur]) {
      for (let i = 0; sys && i < sys.count; i++) {
        sys.data[i * STRIDE + X] *= sx;
        sys.data[i * STRIDE + Y] *= sy;
      }
    }
    if (scene && cur) setCount(cur, budget(scene), scene.still ? 0 : 2);
    buildNight();
    if (!raf) draw(); // resizing clears the bitmap
    kick();
  }

  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
  ro?.observe(canvas);
  const io =
    typeof IntersectionObserver !== "undefined"
      ? new IntersectionObserver(([e]) => {
          onScreen = e.isIntersecting;
          if (onScreen) kick();
          else stop();
        })
      : null;
  io?.observe(canvas);
  const onVis = () => (document.hidden ? stop() : kick());
  window.addEventListener("resize", resize);
  document.addEventListener("visibilitychange", onVis);
  resize();

  return {
    setScene(s: Scene) {
      const first = scene === null;
      scene = s;
      streak = s.night || s.kind === "storm" ? streakNight : streakDay;
      for (let L = 0; L < 3; L++) rainAlpha[L] = RAIN_A[L] * Math.min(1, 0.85 + 0.15 * s.intensity);
      const wind = Math.max(0, s.windKph);
      thetaTarget = Math.max(clamp(wind / 60, 0, 1) * 25 * DEG, s.kind === "storm" ? 8 * DEG : 0);
      drift = wind * 1.2;
      sway = clamp(1 + wind / 30, 1, 3);
      if (s.still || first) tanT = Math.tan((theta = thetaTarget));

      const n = budget(s);
      if (!cur || cur.kind !== s.kind) {
        // Fade the outgoing set out; on a rapid second change keep whichever is more visible.
        if (cur && !s.still && cur.count > 0 && (!prev || cur.fade >= prev.fade)) {
          prev = cur;
          prev.dir = -1;
        }
        const seed = [...s.kind].reduce((a, ch) => Math.imul(a ^ ch.charCodeAt(0), 16777619), 2166136261);
        cur = { kind: s.kind, data: new Float32Array(MAX * STRIDE), count: 0, fade: 0, dir: 1, rand: mulberry32(seed) };
        setCount(cur, n, 0);
      } else setCount(cur, n, s.still ? 0 : 2);
      if (s.still) [prev, cur.fade, cur.dir] = [null, 1, 0];
      buildNight();
      if (s.still || !wantsAnim()) stop();
      if (raf) return;
      draw();
      kick();
    },
    destroy() {
      destroyed = true;
      stop();
      ro?.disconnect();
      io?.disconnect();
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVis);
      canvas.width = canvas.height = night.width = night.height = streakDay.width = streakNight.width = 0;
    },
  };
}

/* ---- static decor ---- */

/** Fog as tileable fractal noise (SVG feTurbulence, stitched tiles), wider than tall, in the fog colour with alpha from the noise. */
function fogNoise(size: number, freq: number, seed: number): { backgroundImage: string; backgroundSize: string } {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${size * 2}' height='${size}'><filter id='f' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='${freq} ${freq * 2}' numOctaves='4' seed='${seed}' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.86 0 0 0 0 0.89 0 0 0 0 0.92 1.7 0 0 0 -0.6'/></filter><rect width='100%' height='100%' filter='url(#f)'/></svg>`;
  return { backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(svg)}")`, backgroundSize: `${size * 2}px ${size}px` };
}
/** Far layer: big slow banks over the whole frame; near layer: finer wisps in the low half. Both thicken toward the ground. */
const FOG_LAYERS = [
  { anim: "animate-fog-110", box: "inset-y-0", noise: fogNoise(520, 0.0035, 7), mask: "linear-gradient(180deg, transparent 0%, black 65%)" },
  { anim: "animate-fog-80", box: "top-[45%] bottom-0", noise: fogNoise(300, 0.006, 23), mask: "linear-gradient(180deg, transparent 0%, black 55%)" },
];
/** Glass beads only for liquid rain. */
const GLASS = new Set<SkyKind>(["drizzle", "rain", "storm"]);

const FOG = "#DCE2EA";
/** Soft blobs in a band: the cloud banks up top. */
function band(color: string, a: number, offset: number): string {
  const p = (v: number) => (v + offset) % 100;
  return [
    `radial-gradient(30% 50% at ${p(12)}% 50%, ${rgba(color, a)} 0%, ${rgba(color, 0)} 100%)`,
    `radial-gradient(26% 46% at ${p(36)}% 56%, ${rgba(color, a * 0.85)} 0%, ${rgba(color, 0)} 100%)`,
    `radial-gradient(32% 52% at ${p(62)}% 46%, ${rgba(color, a)} 0%, ${rgba(color, 0)} 100%)`,
    `radial-gradient(24% 44% at ${p(86)}% 54%, ${rgba(color, a * 0.8)} 0%, ${rgba(color, 0)} 100%)`,
    `linear-gradient(180deg, ${rgba(color, 0)} 0%, ${rgba(color, a * 0.55)} 50%, ${rgba(color, 0)} 100%)`,
  ].join(", ");
}

/** Cloud cover 0..1 a sky kind implies when the weather gives no figure. */
const COVER: Record<SkyKind, number> = { clear: 0, partly: 0.4, cloudy: 0.85, fog: 0, drizzle: 0.7, rain: 0.75, storm: 0.9, snow: 0.7, sleet: 0.75, hail: 0.8 };
/** Cloud colour by light: lit white by day, warm at the low sun, slate in twilight, near-black at night. */
const CLOUD: Record<Phase, string> = { day: "#EEF1F5", golden: "#F0C7AE", dawn: "#E8BFB4", dusk: "#7E84A3", night: "#3A4252" };

const EASE = "cubic-bezier(0.45, 0, 0.55, 1)";

/* ---- component ---- */

export function Sky({ kind: kindProp, intensity, isDay, windKph, localHour, phase: phaseProp, cloudCover, className, overlay = false, photo }: SkyProps) {
  const still = useStill();
  const tier = useSyncExternalStore(noop, getTier, () => 1);

  const kind = safeKind(kindProp);
  const I = Number.isFinite(intensity) ? clamp(intensity, 0, 1) : 0.5;
  const wind = typeof windKph === "number" && Number.isFinite(windKph) ? Math.max(0, windKph) : 0;
  const fine = phaseProp ?? skySun({ hour: localHour, isDay: isDay === true }).phase;
  const family = FAMILY[kind];
  const phase = GRID[fine] ?? "day";
  const bg = skyBackground(...GRADIENTS[family][phase], phase);
  const night = phase === "night";
  const ms = still ? 150 : 1200;
  const fade = `opacity ${ms}ms ${EASE}`;

  // Gradient crossfade: the previous sky stays underneath while the new one fades in on top.
  const [slots, setSlots] = useState({ prev: bg, cur: bg });
  if (slots.cur !== bg) setSlots({ prev: slots.cur, cur: bg });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<ReturnType<typeof createEngine>>(null);
  useEffect(() => {
    const eng = canvasRef.current ? createEngine(canvasRef.current, tier) : null;
    engineRef.current = eng;
    return () => {
      eng?.destroy();
      engineRef.current = null;
    };
  }, [tier]);

  const starVis = !DARK.has(fine) ? 0 : (kind === "clear" ? 1 : kind === "partly" ? 0.7 : 0) * (overlay ? 0.75 : 1);
  const bright = !night && (family === "snow" || family === "fog");
  const scene = useMemo<Scene>(
    () => ({ kind, intensity: I, windKph: wind, night, bright, starVis, sparse: overlay, still }),
    [kind, I, wind, night, bright, starVis, overlay, still],
  );
  useEffect(() => {
    engineRef.current?.setScene(scene);
  }, [scene, tier]);

  // Storm lightning: one soft swell that lifts the whole photo a little (strongest up top), at most one
  // per 6 s, never a strobe, never when still. About one flash in three also shows a faint bolt.
  const flashRef = useRef<HTMLDivElement>(null);
  const boltRef = useRef<SVGPolylineElement>(null);
  useEffect(() => {
    const el = flashRef.current;
    if (kind !== "storm" || still || !el || typeof el.animate !== "function") return;
    let timer = 0;
    const anims: Animation[] = [];
    const fire = () => {
      if (!document.hidden) {
        const x = Math.round(15 + Math.random() * 70);
        el.style.background = `radial-gradient(ellipse 70% 55% at ${x}% 12%, rgb(225 232 255) 0%, rgb(225 232 255 / 0.45) 40%, rgb(225 232 255 / 0) 75%), rgb(225 232 255 / 0.45)`;
        anims.forEach((a) => a.cancel());
        anims.length = 0;
        anims.push(el.animate([{ opacity: 0 }, { opacity: 0.16, offset: 0.15 }, { opacity: 0.06, offset: 0.45 }, { opacity: 0 }], { duration: 700, easing: "ease-out" }));
        const bolt = boltRef.current;
        if (bolt && Math.random() < 0.35) {
          bolt.setAttribute("points", boltPoints(Math.random));
          anims.push(bolt.animate([{ opacity: 0 }, { opacity: 0.5, offset: 0.1 }, { opacity: 0.15, offset: 0.4 }, { opacity: 0 }], { duration: 500 }));
        }
        window.dispatchEvent(new Event(ORB_LIGHTNING_EVENT));
      }
      timer = window.setTimeout(fire, flashDelay(Math.random()));
    };
    timer = window.setTimeout(fire, flashDelay(Math.random()));
    return () => {
      window.clearTimeout(timer);
      anims.forEach((a) => a.cancel());
    };
  }, [kind, still]);

  const fogA = kind === "fog" ? (0.18 * I + 0.1) * (night ? 0.7 : 1) : 0;
  const cover = kind === "clear" || kind === "fog" ? 0 : typeof cloudCover === "number" && Number.isFinite(cloudCover) ? clamp(cloudCover / 100, 0, 1) : COVER[kind];
  const cloudA = cover > 0.05 ? (0.1 + 0.32 * cover) * (night ? 0.8 : 1) : 0;
  const veilA = kind === "fog" ? 0.22 + 0.2 * I : !overlay && (family === "rain" || family === "storm" || family === "snow") ? 0.06 + 0.08 * I : 0;

  return (
    <div
      aria-hidden="true"
      className={cn("pointer-events-none overflow-hidden", overlay ? "absolute inset-0" : "fixed inset-0 -z-10 bg-[#060B16]", className)}
      style={{ contain: "strict" }}
    >
      {!overlay && (
        <>
          <div className="absolute inset-0" style={{ background: slots.prev }} />
          <div key={slots.cur} className="absolute inset-0" style={{ background: slots.cur, animation: `aspire-fade-in ${ms}ms ${EASE} both` }} />
        </>
      )}

      {/* Cloud banks up top drift like the fog (transform only); the second bank comes in past half cover. */}
      {["animate-fog-110", "animate-fog-80"].map((anim, i) => (
        <div
          key={`cloud-${anim}`}
          className={cn("absolute -left-1/2 w-[200%]", anim, i ? "top-[6vh] h-[30vh]" : "-top-[8vh] h-[42vh]")}
          style={{
            background: band(CLOUD[phase], Math.max(cloudA * (i ? 0.8 : 1), 0.01), i * 29 + 7),
            opacity: cloudA > 0 && (i === 0 || cover > 0.5) ? 1 : 0,
            transition: fade,
            animationPlayState: cloudA > 0 && !still && tier >= 1 ? "running" : "paused",
          }}
        />
      ))}

      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* Fog: two layers of noise drift at different speeds (transform only, the --animate-fog-* tokens), denser low; the low tier keeps them still. */}
      {FOG_LAYERS.map(({ anim, box, noise, mask }) => (
        <div
          key={anim}
          className={cn("absolute -left-1/2 w-[200%]", box, anim)}
          style={{
            ...noise,
            maskImage: mask,
            WebkitMaskImage: mask,
            opacity: clamp(fogA * 3, 0, 0.85),
            transition: fade,
            animationPlayState: fogA > 0 && !still && tier >= 1 ? "running" : "paused",
          }}
        />
      ))}
      <div
        className="absolute inset-x-0 bottom-0 h-[55%]"
        style={{
          background: `linear-gradient(0deg, ${rgba(FOG, veilA)} 0%, ${rgba(FOG, veilA * 0.4)} 45%, ${rgba(FOG, 0)} 100%)`,
          opacity: veilA > 0 ? (night ? 0.6 : 1) : 0,
          transition: fade,
        }}
      />
      <div ref={flashRef} className="absolute inset-0" style={{ opacity: 0 }} />
      {kind === "storm" && (
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
          <polyline ref={boltRef} fill="none" stroke="rgb(236 240 255)" strokeWidth={1.5} strokeLinejoin="round" vectorEffect="non-scaling-stroke" opacity={0} style={{ filter: "drop-shadow(0 0 4px rgb(190 210 255 / 0.9))" }} />
        </svg>
      )}
      {overlay && photo && GLASS.has(kind) && <RainGlass src={photo} intensity={I} still={still} tier={tier} />}
      {!overlay && <div className="absolute inset-0" style={{ background: "radial-gradient(130% 100% at 50% 35%, rgb(2 6 16 / 0) 55%, rgb(2 6 16 / 0.38) 100%)" }} />}
    </div>
  );
}
