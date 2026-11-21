"use client";

// The living sky (design spec section 5): a full-screen, decorative layer behind everything.
// - CSS layers: a gradient per weather family x time-of-day phase (two slots that crossfade by opacity),
//   a sun bloom or moon glow (desktop), film grain, soft cloud decks, fog bands, AQI haze, a storm
//   flash overlay and a vignette. Everything that moves animates transform or opacity only.
// - ONE canvas: stars (pre-rendered once, a few twinkle), the moon with its real phase, rare
//   meteors on clear nights, and the precipitation particles (rain, drizzle, storm, snow, sleet, hail)
//   from a preallocated Float32Array pool, so a frame allocates nothing.
// - Landing surfaces (spec 5.3): rain splashes and snow settles on the halo and on the tiles. Elements
//   marked data-sky-surface="arc" | "edge" are measured at most 10 times a second while scrolling and
//   once a second otherwise (never per frame); near and mid particles that cross their top edge land.
// Reduced motion or Calm mode: one still frame, no rAF, no flashes.

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { SKY_KINDS, type SkyKind } from "@/lib/ambient-types";
import { cn } from "@/lib/utils";

export interface SkyProps {
  kind: SkyKind;
  /** 0..1: how hard it rains or snows, how thick the fog is. */
  intensity: number;
  isDay: boolean;
  windKph?: number | null;
  /** 0..23 in the place's time zone; falls back to the device clock. */
  localHour?: number | null;
  className?: string;
  /** Optional: force the still frame (in-app Calm mode). `<html data-calm="true">` is honoured too. */
  calm?: boolean;
  /** Optional: particle density multiplier, e.g. 0.6 in conversation mode (spec 5.3). Default 1. */
  density?: number;
  /** Optional: AQI severity 1..6 (good..hazardous) for the haze layer. Default 1 (no haze). */
  aqiSeverity?: number;
  /**
   * Optional: the sun's elevation and compass bearing in degrees (lib/sun.ts). When given they set
   * the phase (spec 5.1: night < -6, dawn/dusk -6..0, golden 0..10, day >= 10) and place the bloom;
   * without them the isDay / local-hour fallback is used.
   */
  sunAltDeg?: number | null;
  sunAzDeg?: number | null;
}

/* ------------------------------------------------------------------------------------------------
 * Palette (spec 2.2)
 * ---------------------------------------------------------------------------------------------- */

type Family = "clear" | "cloudy" | "fog" | "rain" | "storm" | "snow";
type Phase = "night" | "dawn" | "golden" | "day" | "dusk";

const FAMILY: Record<SkyKind, Family> = {
  clear: "clear",
  partly: "clear",
  cloudy: "cloudy",
  fog: "fog",
  drizzle: "rain",
  rain: "rain",
  sleet: "rain",
  hail: "rain",
  storm: "storm",
  snow: "snow",
};

const GRADIENTS: Record<Family, Record<Phase, [top: string, horizon: string]>> = {
  clear: {
    night: ["#050A18", "#1B2A4A"],
    dawn: ["#2B3A67", "#F0A98A"],
    golden: ["#6A5ACD", "#F29E6B"],
    day: ["#3B82C4", "#9CC9EE"],
    dusk: ["#1E2450", "#C7708A"],
  },
  cloudy: {
    night: ["#0A0F1A", "#222B3A"],
    dawn: ["#3A4258", "#9C8A8A"],
    golden: ["#6E6A86", "#C9A08A"],
    day: ["#6E8296", "#B4C2CF"],
    dusk: ["#2A2F45", "#7A6878"],
  },
  fog: {
    night: ["#10151E", "#2C333D"],
    dawn: ["#5A6070", "#A8A6A8"],
    golden: ["#8F8A90", "#D2BFAE"],
    day: ["#8A96A3", "#C3CBD3"],
    dusk: ["#3E4350", "#858792"],
  },
  rain: {
    night: ["#070B12", "#1A2330"],
    dawn: ["#2A3340", "#5E6672"],
    golden: ["#3A3A4A", "#7A6A6A"],
    day: ["#2E3A48", "#5B6B7A"],
    dusk: ["#1C2230", "#3E4656"],
  },
  storm: {
    night: ["#05070D", "#161A26"],
    dawn: ["#1A1F2B", "#3A3550"],
    golden: ["#24202E", "#4A3A48"],
    day: ["#1A1F2B", "#3A3550"],
    dusk: ["#10131C", "#2A2638"],
  },
  snow: {
    night: ["#0E1626", "#2E3D55"],
    dawn: ["#6F7C99", "#D9C9CF"],
    golden: ["#A9A3BC", "#F1D5C2"],
    day: ["#C9D6E3", "#EEF3F8"],
    dusk: ["#3D4763", "#8E93AE"],
  },
};

/** Cloud cover by kind (spec 5.1 defaults; clear draws no deck). */
const COVER: Record<SkyKind, number> = {
  clear: 0,
  partly: 40,
  cloudy: 90,
  fog: 100,
  drizzle: 85,
  rain: 85,
  sleet: 85,
  hail: 90,
  storm: 95,
  snow: 85,
};

/** How much of the sun's bloom survives the weather. */
const SUN_THROUGH: Record<SkyKind, number> = {
  clear: 1,
  partly: 0.8,
  cloudy: 0.35,
  fog: 0.3,
  drizzle: 0.2,
  rain: 0.15,
  sleet: 0.15,
  hail: 0.12,
  storm: 0.08,
  snow: 0.35,
};

/** Spec 5.1 fallback: phase from isDay and the local hour. */
function phaseOf(isDay: boolean, hour: number | null): Phase {
  if (!isDay) return "night";
  if (hour == null) return "day";
  if (hour === 5 || hour === 6) return "dawn";
  if (hour === 7 || hour === 17 || hour === 18) return "golden";
  if (hour === 19 || hour === 20) return "dusk";
  return "day";
}

/** The phase from the sun's position when known (spec 5.1), else from isDay and the hour. */
function phaseFor(isDay: boolean, hour: number | null, alt: number | null | undefined, az: number | null | undefined): Phase {
  if (typeof alt === "number" && Number.isFinite(alt)) {
    if (alt < -6) return "night";
    if (alt < 0) return typeof az === "number" && az >= 180 ? "dusk" : "dawn";
    if (alt < 10) return "golden";
    return "day";
  }
  return phaseOf(isDay, hour);
}

/**
 * The still two-stop gradient for a sky (used when sky effects are off), so the fallback follows
 * the weather and the time of day instead of always showing a clear blue day.
 */
export function stillSkyGradient(kind: SkyKind, isDay: boolean, hour: number | null, sunAltDeg?: number | null, sunAzDeg?: number | null): string {
  const k: SkyKind = (SKY_KINDS as readonly string[]).includes(kind) ? kind : "clear";
  const [top, horizon] = GRADIENTS[FAMILY[k]][phaseFor(isDay, hour, sunAltDeg, sunAzDeg)];
  return `linear-gradient(180deg, ${top} 0%, ${horizon} 100%)`;
}

/* ------------------------------------------------------------------------------------------------
 * Colour helpers
 * ---------------------------------------------------------------------------------------------- */

function hexRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mixHex(a: string, b: string, t: number): string {
  const x = hexRgb(a);
  const y = hexRgb(b);
  const c = x.map((v, i) => Math.round(v + (y[i] - v) * t));
  return "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");
}

function rgba(hex: string, a: number): string {
  const [r, g, b] = hexRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, a)).toFixed(3)})`;
}

/** WCAG relative luminance, 0..1. */
function luminance(hex: string): number {
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const [r, g, b] = hexRgb(hex);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** The full CSS background for one family x phase: base gradient, a deeper zenith and a horizon glow. */
function skyBackground(top: string, horizon: string, phase: Phase): string {
  const mid = mixHex(top, horizon, 0.38);
  const warm = phase === "dawn" || phase === "golden" || phase === "dusk";
  const glow = mixHex(horizon, "#FFFFFF", warm ? 0.18 : 0.08);
  const glowA = warm ? 0.55 : phase === "night" ? 0.22 : 0.32;
  const zenithA = phase === "day" ? 0.06 : 0.16;
  return [
    `radial-gradient(140% 55% at 50% 108%, ${rgba(glow, glowA)} 0%, ${rgba(glow, 0)} 70%)`,
    `linear-gradient(180deg, ${rgba("#02060F", zenithA)} 0%, ${rgba("#02060F", 0)} 38%)`,
    `linear-gradient(180deg, ${top} 0%, ${mid} 52%, ${horizon} 100%)`,
  ].join(", ");
}

/* ------------------------------------------------------------------------------------------------
 * Environment stores (useSyncExternalStore keeps SSR and hydration honest)
 * ---------------------------------------------------------------------------------------------- */

const mediaSubs = new Map<string, (cb: () => void) => () => void>();
function mediaSubscribe(query: string) {
  let sub = mediaSubs.get(query);
  if (!sub) {
    sub = (cb: () => void) => {
      // jsdom and very old engines have no matchMedia: treat the query as never matching.
      if (typeof window.matchMedia !== "function") return () => {};
      const m = window.matchMedia(query);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    };
    mediaSubs.set(query, sub);
  }
  return sub;
}
function useMedia(query: string): boolean {
  return useSyncExternalStore(
    mediaSubscribe(query),
    () => typeof window.matchMedia === "function" && window.matchMedia(query).matches,
    () => false,
  );
}

function subscribeCalm(cb: () => void) {
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-calm"] });
  return () => mo.disconnect();
}
const getCalm = () => document.documentElement.dataset.calm === "true";

function subscribeHour(cb: () => void) {
  const id = window.setInterval(cb, 60_000);
  return () => window.clearInterval(id);
}
const getHour = (): number | null => new Date().getHours();
const getNull = (): number | null => null;

const noopSubscribe = () => () => {};
/** 0.5 on low-end devices (spec 5.3 budget), otherwise 1. */
function getTier(): number {
  const nav = navigator as Navigator & { connection?: { saveData?: boolean }; deviceMemory?: number };
  const lowCpu = (nav.hardwareConcurrency ?? 8) <= 4;
  const lowMem = (nav.deviceMemory ?? 8) <= 4;
  return lowCpu || lowMem || nav.connection?.saveData ? 0.5 : 1;
}
const getTierServer = () => 1;

/* ------------------------------------------------------------------------------------------------
 * Particle engine
 * ---------------------------------------------------------------------------------------------- */

interface EngineScene {
  kind: SkyKind;
  intensity: number;
  windKph: number;
  night: boolean;
  /** Near-white sky (snow or fog by day): flakes get a slate shadow to stay visible. */
  bright: boolean;
  storm: boolean;
  /** 0..1 star visibility (0 = none). */
  starVis: number;
  moon: boolean;
  density: number;
  still: boolean;
}

interface Engine {
  setScene(s: EngineScene): void;
  destroy(): void;
}

const STRIDE = 11;
const X = 0, Y = 1, VY = 2, LEN = 3, SIZE = 4, PH = 5, FQ = 6, AMP = 7, LAYER = 8, TYPE = 9, ALPHA = 10;
const T_STREAK = 0, T_DOT = 1, T_PELLET = 2;

const BASE: Record<SkyKind, number> = {
  clear: 0, partly: 0, cloudy: 0, fog: 0,
  drizzle: 60, rain: 180, storm: 320, snow: 120, sleet: 140, hail: 90,
};

type Range = readonly [number, number];
const RAIN_V: readonly Range[] = [[450, 600], [650, 850], [900, 1200]];
const SNOW_V: readonly Range[] = [[25, 35], [40, 55], [60, 80]];
const SLEET_DOT_V: readonly Range[] = [[150, 190], [200, 250], [260, 320]];
const HAIL_V: readonly Range[] = [[560, 640], [650, 740], [720, 820]];
const SNOW_R: readonly Range[] = [[0.8, 1.2], [1.4, 2], [2.2, 3]];
const HAIL_R: readonly Range[] = [[1.5, 1.9], [1.8, 2.2], [2.1, 2.5]];
const LEN_BY_KIND: Partial<Record<SkyKind, Range>> = {
  drizzle: [6, 10], rain: [10, 20], storm: [14, 22], sleet: [8, 12], hail: [3, 6],
};
const SPEED_BY_KIND: Partial<Record<SkyKind, number>> = { drizzle: 0.6, rain: 1, storm: 1.12, sleet: 0.85 };
const LAYER_LEN = [0.8, 1, 1.35];
const LAYER_PARALLAX = [0.6, 0.8, 1];
const RAIN_A = [0.2, 0.34, 0.5];
const SNOW_A = [0.45, 0.65, 0.8];
const SLEET_DOT_A = [0.35, 0.5, 0.65];
const HAIL_A = [0.5, 0.6, 0.7];
const HAIL_W = [2.6, 3.4, 4.4];
const STAR_TINTS = ["rgb(240, 244, 255)", "rgb(255, 236, 214)", "rgb(205, 220, 255)"];
const DEG = Math.PI / 180;

// Landing surfaces.
const SURF_MAX = 12;
/** Settled flakes kept per surface (a ring buffer: the oldest is replaced). */
const FLAKE_MAX = 40;
/** Per flake: position (angle for an arc, x offset for an edge), size, born, life, slide. */
const FS = 5;
const SPLASH_MAX = 96;
/** Per splash dot: x, y, vx, vy, age. */
const SS = 5;
const SPLASH_LIFE = 0.12;
/** Gravity for a 6px splash arc that peaks after about 60 ms. */
const SPLASH_G = 3300;
/** Top 120 degrees of an arc: |dx| <= r * sin(60). */
const ARC_SPAN = Math.sin(60 * DEG);

interface Surface {
  arc: boolean;
  cx: number;
  cy: number;
  r: number;
  x0: number;
  x1: number;
  y: number;
  flakes: Float32Array;
  head: number;
}

interface Sys {
  kind: SkyKind;
  data: Float32Array;
  count: number;
  fade: number;
  dir: number;
  rand: () => number;
  streaks: boolean;
  dots: boolean;
  pellets: boolean;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Moon phase 0..1 (0 new, 0.5 full) from the synodic month (spec 5.1). */
function moonPhase(now: number): number {
  const epoch = Date.UTC(2000, 0, 6, 18, 14);
  const days = (now - epoch) / 86_400_000;
  return (((days / 29.530588) % 1) + 1) % 1;
}

function makeSprite(size: number, stops: [number, string][]): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g2 = c.getContext("2d");
  if (g2) {
    const h = size / 2;
    const g = g2.createRadialGradient(h, h, 0, h, h, h);
    for (const [o, col] of stops) g.addColorStop(o, col);
    g2.fillStyle = g;
    g2.fillRect(0, 0, size, size);
  }
  return c;
}

function createEngine(canvas: HTMLCanvasElement, tier: number): Engine | null {
  const ctx0 = canvas.getContext("2d");
  if (!ctx0) return null;
  const ctx: CanvasRenderingContext2D = ctx0;
  const MAX = tier < 1 ? 260 : 520;

  const starCanvas = document.createElement("canvas");
  const sctx = starCanvas.getContext("2d");

  // Flake sprites: crisp (far, mid), crisp with a faint dark ring for bright day skies, soft bokeh (near).
  const crisp = makeSprite(32, [
    [0, "rgba(244, 248, 255, 1)"],
    [0.42, "rgba(234, 242, 255, 0.95)"],
    [0.62, "rgba(234, 242, 255, 0.28)"],
    [1, "rgba(234, 242, 255, 0)"],
  ]);
  // Bright skies (white snow day, fog day): a white core inside a soft slate shadow, so the flake
  // still reads against the near-white sky the way real snow does against bright overcast.
  const crispDay = makeSprite(32, [
    [0, "rgba(248, 250, 255, 1)"],
    [0.36, "rgba(240, 245, 252, 0.95)"],
    [0.5, "rgba(70, 85, 110, 0.5)"],
    [0.75, "rgba(70, 85, 110, 0.16)"],
    [1, "rgba(70, 85, 110, 0)"],
  ]);
  const soft = makeSprite(64, [
    [0, "rgba(240, 246, 255, 0.9)"],
    [0.3, "rgba(236, 243, 255, 0.55)"],
    [0.65, "rgba(234, 242, 255, 0.14)"],
    [1, "rgba(234, 242, 255, 0)"],
  ]);
  const softDay = makeSprite(64, [
    [0, "rgba(246, 249, 255, 0.95)"],
    [0.26, "rgba(236, 242, 250, 0.7)"],
    [0.42, "rgba(80, 95, 120, 0.3)"],
    [0.7, "rgba(80, 95, 120, 0.08)"],
    [1, "rgba(80, 95, 120, 0)"],
  ]);

  let w = 0;
  let h = 0;
  let dpr = 1;
  let scene: EngineScene | null = null;
  let cur: Sys | null = null;
  let prev: Sys | null = null;
  let theta = 0;
  let thetaTarget = 0;
  let tanT = 0;
  let drift = 0;
  let sway = 1;
  let raf = 0;
  let last = 0;
  let lastDraw = 0;
  let t = 0;
  let destroyed = false;
  let hasStarLayer = false;
  let starKey = "";

  const tw = new Float32Array(16 * 6); // x, y, r, omega, phase, tint
  let twCount = 0;

  const meteor = { on: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 0.8, next: 25 };
  const meteorRand = mulberry32(97);

  // ---- landing surfaces ----
  const surfMemo = new WeakMap<Element, Surface>();
  let surfaces: Surface[] = [];
  let surfAt = -Infinity;
  let surfDirty = true;
  const splash = new Float32Array(SPLASH_MAX * SS);
  let nSplash = 0;
  /** Scene time until which a settled flake is still fading (keeps the loop alive for it). */
  let flakesUntil = 0;
  const surfRand = mulberry32(4242);

  function readSurfaces(now: number) {
    surfAt = now;
    surfDirty = false;
    const next: Surface[] = [];
    const els = document.querySelectorAll("[data-sky-surface]");
    for (let k = 0; k < els.length && next.length < SURF_MAX; k++) {
      const el = els[k];
      const r = el.getBoundingClientRect();
      if (r.width < 8 || r.height < 8 || r.bottom < 0 || r.top > h || r.right < 0 || r.left > w) continue;
      const arc = el.getAttribute("data-sky-surface") === "arc";
      let sf = surfMemo.get(el);
      if (!sf) {
        sf = { arc, cx: 0, cy: 0, r: 0, x0: 0, x1: 0, y: 0, flakes: new Float32Array(FLAKE_MAX * FS), head: 0 };
        surfMemo.set(el, sf);
      }
      sf.arc = arc;
      sf.cx = r.left + r.width / 2;
      sf.cy = r.top + r.height / 2;
      sf.r = r.width / 2;
      const inset = arc ? 0 : Math.min(22, r.width / 4); // skip the rounded corners
      sf.x0 = r.left + inset;
      sf.x1 = r.right - inset;
      sf.y = r.top;
      next.push(sf);
    }
    surfaces = next;
  }
  const markSurfaces = () => {
    surfDirty = true;
  };

  /** The y of a surface's top under x, or NaN when x is outside its landing span. */
  function surfaceY(sf: Surface, x: number): number {
    if (sf.arc) {
      const dx = x - sf.cx;
      if (Math.abs(dx) > sf.r * ARC_SPAN) return NaN;
      return sf.cy - Math.sqrt(sf.r * sf.r - dx * dx);
    }
    return x < sf.x0 || x > sf.x1 ? NaN : sf.y;
  }

  function addSplash(x: number, y: number) {
    for (let k = 0; k < 2 && nSplash < SPLASH_MAX; k++) {
      const o = nSplash * SS;
      const side = k === 0 ? -1 : 1;
      splash[o] = x;
      splash[o + 1] = y;
      splash[o + 2] = side * (30 + 40 * surfRand());
      splash[o + 3] = -(170 + 60 * surfRand());
      splash[o + 4] = 0;
      nSplash++;
    }
  }

  function settle(sf: Surface, x: number, y: number, size: number) {
    const o = sf.head * FS;
    sf.head = (sf.head + 1) % FLAKE_MAX;
    const life = 6 + 4 * surfRand();
    if (sf.arc) {
      const ang = Math.atan2(y - sf.cy, x - sf.cx);
      sf.flakes[o] = ang;
      // A slow slide away from the crown (about 5% of the fall speed, along the tangent).
      sf.flakes[o + 4] = (x >= sf.cx ? 1 : -1) * 0.004;
    } else {
      sf.flakes[o] = x - sf.x0;
      sf.flakes[o + 4] = (surfRand() - 0.5) * 1.2;
    }
    sf.flakes[o + 1] = size;
    sf.flakes[o + 2] = t;
    sf.flakes[o + 3] = life;
    flakesUntil = Math.max(flakesUntil, t + life);
  }

  /** A near or mid particle that crossed a surface's top this step lands on it. */
  function land(sys: Sys, i: number, prevY: number): boolean {
    const d = sys.data;
    const o = i * STRIDE;
    const x = d[o + X];
    const y = d[o + Y];
    for (let k = 0; k < surfaces.length; k++) {
      const sf = surfaces[k];
      const sy = surfaceY(sf, x);
      if (!(sy > prevY && sy <= y)) continue;
      if (d[o + TYPE] === T_DOT && sys.kind === "snow") settle(sf, x, sy, d[o + SIZE]);
      else addSplash(x, sy);
      spawn(sys, i, 1);
      return true;
    }
    return false;
  }

  function updateSplashes(dt: number) {
    for (let k = 0; k < nSplash; ) {
      const o = k * SS;
      splash[o + 4] += dt;
      if (splash[o + 4] >= SPLASH_LIFE) {
        // Swap-remove.
        nSplash--;
        const last = nSplash * SS;
        for (let j = 0; j < SS; j++) splash[o + j] = splash[last + j];
        continue;
      }
      splash[o + 3] += SPLASH_G * dt;
      splash[o] += splash[o + 2] * dt;
      splash[o + 1] += splash[o + 3] * dt;
      k++;
    }
  }

  function drawLanded() {
    if (nSplash > 0) {
      ctx.fillStyle = head[2] || "rgba(225, 232, 245, 0.5)";
      for (let k = 0; k < nSplash; k++) {
        const o = k * SS;
        ctx.globalAlpha = 1 - splash[o + 4] / SPLASH_LIFE;
        ctx.fillRect(splash[o] - 0.5, splash[o + 1] - 0.5, 1, 1);
      }
    }
    if (t < flakesUntil) {
      const sprite = scene && scene.bright ? crispDay : crisp;
      for (let s2 = 0; s2 < surfaces.length; s2++) {
        const sf = surfaces[s2];
        const f = sf.flakes;
        for (let k = 0; k < FLAKE_MAX; k++) {
          const o = k * FS;
          const life = f[o + 3];
          if (life <= 0) continue;
          const age = t - f[o + 2];
          if (age >= life || age < 0) {
            f[o + 3] = 0;
            continue;
          }
          const size = f[o + 1];
          const a = age < life * 0.6 ? 1 : 1 - (age - life * 0.6) / (life * 0.4);
          let x: number;
          let y: number;
          if (sf.arc) {
            const ang = f[o] + f[o + 4] * age;
            // Off the crown's 120 degrees the flake has slid away: let it go.
            if (Math.abs(Math.cos(ang)) > ARC_SPAN + 0.05) continue;
            x = sf.cx + Math.cos(ang) * (sf.r + size);
            y = sf.cy + Math.sin(ang) * (sf.r + size);
          } else {
            x = sf.x0 + f[o] + f[o + 4] * age;
            if (x < sf.x0 || x > sf.x1) continue;
            y = sf.y - size;
          }
          const half = size * 2;
          ctx.globalAlpha = a * 0.9;
          ctx.drawImage(sprite, x - half, y - half, half * 2, half * 2);
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  const tail: string[] = ["", "", ""];
  const head: string[] = ["", "", ""];
  const hailStyle: string[] = HAIL_A.map((a) => `rgba(236, 242, 252, ${a})`);

  function streakColours(s: EngineScene) {
    const c = s.night || s.storm ? "170, 200, 255" : "225, 232, 245";
    const boost = 0.85 + 0.15 * s.intensity;
    for (let L = 0; L < 3; L++) {
      const a = Math.min(RAIN_A[L], RAIN_A[L] * boost);
      tail[L] = `rgba(${c}, ${(a * 0.4).toFixed(3)})`;
      head[L] = `rgba(${c}, ${a.toFixed(3)})`;
    }
  }

  function budget(s: EngineScene): number {
    const area = clamp((w * h) / (390 * 844), 0.6, 2.2);
    let n = BASE[s.kind] * (0.4 + 0.6 * s.intensity) * area * tier * s.density;
    if (s.still) n *= 0.3;
    return Math.min(MAX, Math.max(0, Math.round(n)));
  }

  function newSys(kind: SkyKind): Sys {
    return {
      kind,
      data: new Float32Array(MAX * STRIDE),
      count: 0,
      fade: 1,
      dir: 0,
      rand: mulberry32(hashStr(kind) ^ 0x9e3779b9),
      streaks: kind === "drizzle" || kind === "rain" || kind === "storm" || kind === "sleet",
      dots: kind === "snow" || kind === "sleet",
      pellets: kind === "hail",
    };
  }

  /** mode 0: scatter over the whole screen; 1: respawn above the top; 2: flow in from well above. */
  function spawn(sys: Sys, i: number, mode: 0 | 1 | 2) {
    const d = sys.data;
    const o = i * STRIDE;
    const r = sys.rand;
    const k = sys.kind;
    const I = scene ? scene.intensity : 0.5;
    const pick = r();
    const L = pick < 0.45 ? 0 : pick < 0.8 ? 1 : 2;
    let type = T_STREAK;
    if (k === "snow") type = T_DOT;
    else if (k === "hail") type = T_PELLET;
    else if (k === "sleet") type = r() < 0.5 ? T_STREAK : T_DOT;

    const lerp = (rg: Range) => rg[0] + (rg[1] - rg[0]) * r();
    let vy: number;
    let len: number;
    let size = 1;
    let alpha = 1;
    if (type === T_STREAK) {
      vy = lerp(RAIN_V[L]) * (SPEED_BY_KIND[k] ?? 1) * (0.92 + 0.16 * I);
      len = lerp(LEN_BY_KIND[k] ?? [10, 20]) * LAYER_LEN[L];
    } else if (type === T_PELLET) {
      vy = lerp(HAIL_V[L]);
      len = lerp(LEN_BY_KIND.hail ?? [3, 6]);
      size = lerp(HAIL_R[L]);
    } else if (k === "sleet") {
      vy = lerp(SLEET_DOT_V[L]);
      size = 1 + 0.5 * r();
      alpha = SLEET_DOT_A[L];
      len = size * 3;
    } else {
      vy = lerp(SNOW_V[L]) * (0.9 + 0.25 * I);
      size = lerp(SNOW_R[L]) * (0.9 + 0.3 * I);
      alpha = SNOW_A[L];
      len = size * 3;
    }

    let y: number;
    if (mode === 0) y = r() * (h + len) - len;
    else if (mode === 1) y = -len - r() * 60;
    else y = -len - r() * h * 0.6;

    let x: number;
    if (mode === 0) {
      x = r() * w;
    } else {
      const extra =
        type === T_DOT ? clamp((drift * h) / Math.max(vy, 20), 0, w * 0.6) : clamp(h * Math.max(tanT, 0), 0, w);
      x = r() * (w + extra) - extra;
    }

    d[o + X] = x;
    d[o + Y] = y;
    d[o + VY] = vy;
    d[o + LEN] = len;
    d[o + SIZE] = size;
    d[o + PH] = r() * Math.PI * 2;
    d[o + FQ] = (0.3 + 0.5 * r()) * Math.PI * 2;
    d[o + AMP] = 6 + 18 * r();
    d[o + LAYER] = L;
    d[o + TYPE] = type;
    d[o + ALPHA] = alpha;
  }

  function setCount(sys: Sys, n: number, mode: 0 | 2) {
    if (n > sys.count) for (let i = sys.count; i < n; i++) spawn(sys, i, mode);
    sys.count = n;
  }

  function buildStars() {
    if (!sctx || !scene) return;
    const want = scene.starVis > 0 || scene.moon;
    // The day index keeps the moon's phase current in a tab left open for days.
    const key = `${w}x${h}@${dpr}|${scene.starVis}|${scene.moon}|${Math.floor(Date.now() / 86_400_000)}`;
    if (key === starKey) return;
    starKey = key;
    twCount = 0;
    hasStarLayer = false;
    if (!want) return;
    starCanvas.width = Math.round(w * dpr);
    starCanvas.height = Math.round(h * dpr);
    sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    sctx.clearRect(0, 0, w, h);

    if (scene.starVis > 0) {
      const r = mulberry32(1337 + Math.round(w) * 7 + Math.round(h));
      const n = Math.round(60 + 60 * clamp((w - 390) / (1440 - 390), 0, 1));
      for (let k = 0; k < n; k++) {
        const x = r() * w;
        const y = Math.pow(r(), 1.5) * h * 0.72;
        const rad = 0.5 + r();
        const tintPick = r();
        const tint = tintPick < 0.12 ? 1 : tintPick < 0.28 ? 2 : 0;
        const fall = 1 - (y / (h * 0.72)) * 0.55;
        const a = (0.4 + 0.6 * r()) * fall * scene.starVis;
        if (r() < 0.1 && twCount < 16) {
          const o = twCount * 6;
          tw[o] = x;
          tw[o + 1] = y;
          tw[o + 2] = rad;
          tw[o + 3] = (Math.PI * 2) / (2 + 3 * r());
          tw[o + 4] = r() * Math.PI * 2;
          tw[o + 5] = tint;
          twCount++;
          continue;
        }
        if (rad > 1.25) {
          const g = sctx.createRadialGradient(x, y, 0, x, y, rad * 4);
          g.addColorStop(0, `rgba(220, 230, 255, ${(a * 0.25).toFixed(3)})`);
          g.addColorStop(1, "rgba(220, 230, 255, 0)");
          sctx.fillStyle = g;
          sctx.fillRect(x - rad * 4, y - rad * 4, rad * 8, rad * 8);
        }
        sctx.globalAlpha = a;
        sctx.fillStyle = STAR_TINTS[tint];
        sctx.beginPath();
        sctx.arc(x, y, rad, 0, Math.PI * 2);
        sctx.fill();
      }
      sctx.globalAlpha = 1;
    }

    if (scene.moon) drawMoon(sctx);
    hasStarLayer = true;
  }

  function drawMoon(c: CanvasRenderingContext2D) {
    const rad = w >= 1024 ? 20 : 14;
    const cx = w * 0.8;
    const cy = Math.max(84, h * 0.15);
    const p = moonPhase(Date.now());

    // Halo.
    const g = c.createRadialGradient(cx, cy, rad * 0.8, cx, cy, rad * 6);
    g.addColorStop(0, "rgba(220, 230, 255, 0.14)");
    g.addColorStop(1, "rgba(220, 230, 255, 0)");
    c.fillStyle = g;
    c.fillRect(cx - rad * 6, cy - rad * 6, rad * 12, rad * 12);

    // Earthshine on the dark limb.
    c.fillStyle = "rgba(233, 238, 248, 0.07)";
    c.beginPath();
    c.arc(cx, cy, rad, 0, Math.PI * 2);
    c.fill();

    const lit = (1 - Math.cos(2 * Math.PI * p)) / 2;
    if (lit < 0.02) return;

    // Lit part, bounded by the terminator ellipse.
    c.save();
    c.translate(cx, cy);
    if (p >= 0.5) c.scale(-1, 1);
    const k = Math.cos(2 * Math.PI * p);
    const rx = Math.abs(k) * rad;
    c.beginPath();
    c.arc(0, 0, rad, -Math.PI / 2, Math.PI / 2, false);
    if (k >= 0) c.ellipse(0, 0, rx, rad, 0, Math.PI / 2, -Math.PI / 2, true);
    else c.ellipse(0, 0, rx, rad, 0, Math.PI / 2, Math.PI * 1.5, false);
    c.closePath();
    c.clip();
    const shade = c.createRadialGradient(-rad * 0.3, -rad * 0.35, rad * 0.1, 0, 0, rad * 1.05);
    shade.addColorStop(0, "#F6F8FD");
    shade.addColorStop(0.7, "#E9EEF8");
    shade.addColorStop(1, "#C9D2E2");
    c.fillStyle = shade;
    c.fillRect(-rad, -rad, rad * 2, rad * 2);
    c.restore();
  }

  function particlesActive(): boolean {
    return (cur !== null && cur.count > 0) || prev !== null;
  }

  function meteorsAllowed(): boolean {
    return !!scene && !scene.still && tier >= 1 && scene.kind === "clear" && scene.starVis >= 0.9;
  }

  function wantsAnim(): boolean {
    if (!scene || scene.still) return false;
    return particlesActive() || twCount > 0 || meteorsAllowed() || nSplash > 0 || t < flakesUntil;
  }

  function update(dt: number) {
    if (!scene) return;
    theta += (thetaTarget - theta) * Math.min(1, dt * 0.8);
    const gust = scene.storm
      ? 1 + 0.2 * Math.sin(t * 0.35) + 0.08 * Math.sin(t * 1.9 + 1.3)
      : 1 + 0.06 * Math.sin(t * 0.25);
    tanT = Math.tan(theta * gust);

    for (const sys of [prev, cur]) {
      if (!sys) continue;
      if (sys.dir !== 0) {
        sys.fade = clamp(sys.fade + (sys.dir * dt) / 1.2, 0, 1);
        if (sys.fade === 1 && sys.dir > 0) sys.dir = 0;
      }
      const d = sys.data;
      const n = sys.count;
      const landing = surfaces.length > 0 && sys.fade > 0.2;
      for (let i = 0; i < n; i++) {
        const o = i * STRIDE;
        const vy = d[o + VY];
        const prevY = d[o + Y];
        d[o + Y] += vy * dt;
        if (d[o + TYPE] === T_DOT) {
          d[o + X] += (drift * LAYER_PARALLAX[d[o + LAYER]] + Math.sin(t * d[o + FQ] + d[o + PH]) * d[o + AMP] * sway) * dt;
        } else {
          d[o + X] += vy * tanT * dt;
        }
        // Near and mid layers land on the halo and the tiles; the far layer falls behind them.
        if (landing && d[o + LAYER] >= 1 && land(sys, i, prevY)) continue;
        if (d[o + Y] - d[o + LEN] > h) spawn(sys, i, 1);
        else if (d[o + X] > w + 30) d[o + X] -= w + 60;
        else if (d[o + X] < -30) d[o + X] += w + 60;
      }
    }
    if (prev && prev.fade <= 0) prev = null;
    updateSplashes(dt);

    if (meteorsAllowed()) {
      if (!meteor.on && t > meteor.next) {
        const side = meteorRand() < 0.5 ? -1 : 1;
        const ang = (20 + 15 * meteorRand()) * DEG;
        const speed = 1000;
        meteor.on = true;
        meteor.x = w * (0.15 + 0.7 * meteorRand());
        meteor.y = h * (0.04 + 0.22 * meteorRand());
        meteor.vx = Math.cos(ang) * speed * side;
        meteor.vy = Math.sin(ang) * speed;
        meteor.life = 0;
      } else if (meteor.on) {
        meteor.x += meteor.vx * dt;
        meteor.y += meteor.vy * dt;
        meteor.life += dt;
        if (meteor.life >= meteor.max) {
          meteor.on = false;
          meteor.next = t + 45 + 75 * meteorRand();
        }
      }
    } else {
      meteor.on = false;
    }
  }

  function drawSys(sys: Sys, fade: number) {
    if (fade <= 0 || sys.count === 0) return;
    const d = sys.data;
    const n = sys.count;

    if (sys.streaks) {
      const norm = 1 / Math.sqrt(1 + tanT * tanT);
      const dx = tanT * norm;
      const dy = norm;
      ctx.lineCap = "round";
      ctx.globalAlpha = fade;
      for (let L = 0; L < 3; L++) {
        ctx.lineWidth = L === 2 ? 1.5 : L === 1 ? 1.15 : 1;
        // Faint tail.
        ctx.strokeStyle = tail[L];
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const o = i * STRIDE;
          if (d[o + TYPE] !== T_STREAK || d[o + LAYER] !== L) continue;
          const x = d[o + X], y = d[o + Y], len = d[o + LEN];
          ctx.moveTo(x - dx * len, y - dy * len);
          ctx.lineTo(x - dx * len * 0.45, y - dy * len * 0.45);
        }
        ctx.stroke();
        // Brighter head: the streak tapers instead of ending in a hard bar.
        ctx.strokeStyle = head[L];
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const o = i * STRIDE;
          if (d[o + TYPE] !== T_STREAK || d[o + LAYER] !== L) continue;
          const x = d[o + X], y = d[o + Y], len = d[o + LEN];
          ctx.moveTo(x - dx * len * 0.55, y - dy * len * 0.55);
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }

    if (sys.pellets) {
      const norm = 1 / Math.sqrt(1 + tanT * tanT);
      const dx = tanT * norm;
      const dy = norm;
      ctx.lineCap = "round";
      ctx.globalAlpha = fade;
      for (let L = 0; L < 3; L++) {
        ctx.lineWidth = HAIL_W[L];
        ctx.strokeStyle = hailStyle[L];
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const o = i * STRIDE;
          if (d[o + TYPE] !== T_PELLET || d[o + LAYER] !== L) continue;
          const x = d[o + X], y = d[o + Y], len = d[o + LEN];
          ctx.moveTo(x - dx * len, y - dy * len);
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }

    if (sys.dots) {
      const bright = !!scene && scene.bright;
      for (let L = 0; L < 3; L++) {
        const sprite = L === 2 ? (bright ? softDay : soft) : bright ? crispDay : crisp;
        const k = L === 2 ? 2.6 : 2;
        for (let i = 0; i < n; i++) {
          const o = i * STRIDE;
          if (d[o + TYPE] !== T_DOT || d[o + LAYER] !== L) continue;
          const half = d[o + SIZE] * k;
          ctx.globalAlpha = fade * d[o + ALPHA];
          ctx.drawImage(sprite, d[o + X] - half, d[o + Y] - half, half * 2, half * 2);
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  function draw() {
    if (!scene) return;
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, w, h);
    if (hasStarLayer) ctx.drawImage(starCanvas, 0, 0, w, h);

    if (twCount > 0) {
      for (let k = 0; k < twCount; k++) {
        const o = k * 6;
        const a = scene.still ? 0.8 : 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * tw[o + 3] + tw[o + 4]));
        ctx.globalAlpha = a * scene.starVis;
        ctx.fillStyle = STAR_TINTS[tw[o + 5]];
        ctx.beginPath();
        ctx.arc(tw[o], tw[o + 1], tw[o + 2], 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    if (meteor.on) {
      const a = Math.sin((Math.PI * meteor.life) / meteor.max) * 0.55 * scene.starVis;
      const sp = Math.hypot(meteor.vx, meteor.vy) || 1;
      const tx = meteor.x - (meteor.vx / sp) * 140;
      const ty = meteor.y - (meteor.vy / sp) * 140;
      const g = ctx.createLinearGradient(meteor.x, meteor.y, tx, ty);
      g.addColorStop(0, `rgba(240, 246, 255, ${a.toFixed(3)})`);
      g.addColorStop(1, "rgba(240, 246, 255, 0)");
      ctx.strokeStyle = g;
      ctx.lineWidth = 1.2;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(meteor.x, meteor.y);
      ctx.lineTo(tx, ty);
      ctx.stroke();
    }

    if (prev) drawSys(prev, prev.fade);
    if (cur) drawSys(cur, cur.fade);
    if (!scene.still) drawLanded();
  }

  function frame(now: number) {
    raf = 0;
    if (destroyed || document.hidden) return;
    // Per-scene cap: rain, snow and meteors at 60 fps (30 on the low tier); a clear night that only
    // twinkles at 10 fps, enough for 2-5 s twinkle periods, so the full-screen layer mostly rests.
    const gap = meteor.on || particlesActive() ? (tier < 1 ? 1000 / 30 : 1000 / 60) : 1000 / 10;
    if (now - lastDraw < gap - 2) {
      raf = requestAnimationFrame(frame);
      return;
    }
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    lastDraw = now;
    t += dt;
    if (particlesActive() || t < flakesUntil) {
      if (now - surfAt > (surfDirty ? 100 : 1000)) readSurfaces(now);
    } else if (surfaces.length) {
      surfaces = [];
    }
    update(dt);
    draw();
    if (wantsAnim()) raf = requestAnimationFrame(frame);
  }

  function kick() {
    if (raf || destroyed || document.hidden || !wantsAnim()) return;
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
    const ndpr = Math.min(window.devicePixelRatio || 1, 1.5);
    if (nw === w && nh === h && ndpr === dpr) return;
    surfDirty = true;
    const sx = w ? nw / w : 1;
    const sy = h ? nh / h : 1;
    w = nw;
    h = nh;
    dpr = ndpr;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const sys of [prev, cur]) {
      if (!sys) continue;
      for (let i = 0; i < sys.count; i++) {
        sys.data[i * STRIDE + X] *= sx;
        sys.data[i * STRIDE + Y] *= sy;
      }
    }
    if (scene && cur) {
      const n = budget(scene);
      if (n < cur.count) cur.count = n;
      else setCount(cur, n, scene.still ? 0 : 2);
    }
    buildStars();
    // Resizing clears the bitmap: repaint now unless the loop will.
    if (!raf) draw();
    kick();
  }

  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => resize()) : null;
  ro?.observe(canvas);
  const onWinResize = () => resize();
  window.addEventListener("resize", onWinResize);
  const onVis = () => {
    if (document.hidden) stop();
    else kick();
  };
  document.addEventListener("visibilitychange", onVis);
  window.addEventListener("scroll", markSurfaces, { passive: true, capture: true });
  resize();

  return {
    setScene(s) {
      const first = scene === null;
      scene = s;
      streakColours(s);
      const wind = Math.max(0, s.windKph);
      thetaTarget = clamp(wind / 60, 0, 1) * 25 * DEG;
      if (s.storm) thetaTarget = Math.max(thetaTarget, 8 * DEG);
      drift = wind * 1.2;
      sway = clamp(1 + wind / 30, 1, 3);
      if (s.still || first) {
        theta = thetaTarget;
        tanT = Math.tan(theta);
      }

      const n = budget(s);
      if (!cur || cur.kind !== s.kind) {
        // Fade the outgoing set out. On a rapid second change keep whichever set is more visible
        // fading out, so nothing pops; an empty set (cloudy, fog) never replaces one still fading.
        if (cur && !s.still && cur.count > 0 && (!prev || cur.fade >= prev.fade)) {
          prev = cur;
          prev.dir = -1;
        }
        cur = newSys(s.kind);
        setCount(cur, n, 0);
        cur.fade = s.still ? 1 : 0;
        cur.dir = s.still ? 0 : 1;
      } else if (n < cur.count) {
        cur.count = n;
      } else {
        setCount(cur, n, s.still ? 0 : 2);
      }
      if (s.still) {
        prev = null;
        cur.fade = 1;
        cur.dir = 0;
        meteor.on = false;
      }

      buildStars();
      if (s.still || !wantsAnim()) {
        stop();
        draw();
      } else {
        kick();
      }
    },
    destroy() {
      destroyed = true;
      stop();
      ro?.disconnect();
      window.removeEventListener("resize", onWinResize);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("scroll", markSurfaces, { capture: true });
      canvas.width = 0;
      canvas.height = 0;
      starCanvas.width = 0;
      starCanvas.height = 0;
    },
  };
}

/* ------------------------------------------------------------------------------------------------
 * Static decor
 * ---------------------------------------------------------------------------------------------- */

// Static film grain: breaks up gradient banding on wide screens. Drawn once, never animated.
const GRAIN =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'>" +
  "<filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/>" +
  "<feColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.55 0'/></filter>" +
  "<rect width='100%' height='100%' filter='url(%23n)'/></svg>\")";

type Blob = readonly [x: number, y: number, rx: number, ry: number];
const CLOUD_DECKS: readonly { top: string; height: string; dur: number; dist: number; op: number; blobs: readonly Blob[] }[] = [
  {
    top: "-8%", height: "50%", dur: 60_000, dist: 5, op: 1,
    blobs: [[10, 48, 22, 38], [30, 56, 18, 30], [50, 44, 24, 40], [72, 58, 20, 32], [92, 46, 22, 36]],
  },
  {
    top: "10%", height: "42%", dur: 75_000, dist: 6, op: 0.75,
    blobs: [[18, 52, 20, 34], [44, 60, 24, 30], [66, 50, 18, 36], [86, 58, 22, 30]],
  },
  {
    top: "26%", height: "34%", dur: 90_000, dist: 7, op: 0.55,
    blobs: [[8, 56, 18, 30], [34, 50, 22, 34], [58, 60, 20, 28], [80, 52, 24, 34]],
  },
];

function cloudBackground(light: string, shade: string, blobs: readonly Blob[]): string {
  const tops = blobs.map(
    ([x, y, rx, ry]) =>
      `radial-gradient(${rx}% ${ry}% at ${x}% ${y}%, ${rgba(light, 0.9)} 0%, ${rgba(light, 0.45)} 45%, ${rgba(light, 0)} 100%)`,
  );
  const undersides = blobs.map(
    ([x, y, rx, ry]) =>
      `radial-gradient(${rx * 1.1}% ${ry * 0.8}% at ${x + 2}% ${y + 12}%, ${rgba(shade, 0.35)} 0%, ${rgba(shade, 0)} 100%)`,
  );
  return [...tops, ...undersides].join(", ");
}

const FOG_RGB = "#DCE2EA";
function fogBand(a: number, offset: number): string {
  const p = (v: number) => (v + offset) % 100;
  return [
    `radial-gradient(30% 50% at ${p(12)}% 50%, ${rgba(FOG_RGB, a)} 0%, ${rgba(FOG_RGB, 0)} 100%)`,
    `radial-gradient(26% 46% at ${p(36)}% 56%, ${rgba(FOG_RGB, a * 0.85)} 0%, ${rgba(FOG_RGB, 0)} 100%)`,
    `radial-gradient(32% 52% at ${p(62)}% 46%, ${rgba(FOG_RGB, a)} 0%, ${rgba(FOG_RGB, 0)} 100%)`,
    `radial-gradient(24% 44% at ${p(86)}% 54%, ${rgba(FOG_RGB, a * 0.8)} 0%, ${rgba(FOG_RGB, 0)} 100%)`,
    `linear-gradient(180deg, ${rgba(FOG_RGB, 0)} 0%, ${rgba(FOG_RGB, a * 0.55)} 50%, ${rgba(FOG_RGB, 0)} 100%)`,
  ].join(", ");
}

const EASE_IN_OUT = "cubic-bezier(0.45, 0, 0.55, 1)";

/* ------------------------------------------------------------------------------------------------
 * Component
 * ---------------------------------------------------------------------------------------------- */

export function Sky({
  kind: kindProp,
  intensity,
  isDay,
  windKph,
  localHour,
  className,
  calm,
  density,
  aqiSeverity,
  sunAltDeg,
  sunAzDeg,
}: SkyProps) {
  const reducedMotion = useMedia("(prefers-reduced-motion: reduce)");
  const reducedTransparency = useMedia("(prefers-reduced-transparency: reduce)");
  const calmAttr = useSyncExternalStore(subscribeCalm, getCalm, () => false);
  const deviceHour = useSyncExternalStore(subscribeHour, getHour, getNull);
  const tier = useSyncExternalStore(noopSubscribe, getTier, getTierServer);

  const still = reducedMotion || calmAttr || !!calm;
  // Calm mode takes the reduced-transparency path as well (spec 13.4).
  const lowTransparency = reducedTransparency || calmAttr || !!calm;
  // Trust boundary: the kind comes from the ambient API. Anything unknown draws a clear sky.
  const kind: SkyKind = (SKY_KINDS as readonly string[]).includes(kindProp) ? kindProp : "clear";
  const I = Number.isFinite(intensity) ? clamp(intensity, 0, 1) : 0.5;
  const wind = typeof windKph === "number" && Number.isFinite(windKph) ? Math.max(0, windKph) : 0;
  const hour =
    typeof localHour === "number" && Number.isFinite(localHour) ? ((Math.floor(localHour) % 24) + 24) % 24 : deviceHour;
  const family = FAMILY[kind];
  const phase = phaseFor(isDay === true, hour, sunAltDeg, sunAzDeg);
  const sunKnown = typeof sunAltDeg === "number" && Number.isFinite(sunAltDeg) && typeof sunAzDeg === "number" && Number.isFinite(sunAzDeg);
  const [top, horizon] = GRADIENTS[family][phase];
  const bg = useMemo(() => skyBackground(top, horizon, phase), [top, horizon, phase]);
  const night = phase === "night";
  const bright = !night && luminance(horizon) > 0.4 && luminance(top) > 0.25;
  const cover = COVER[kind] ?? 0;

  /* --- Gradient crossfade: two slots, the canvas is never remounted. --- */
  const [firstBg] = useState(bg);
  const slotA = useRef<HTMLDivElement>(null);
  const slotB = useRef<HTMLDivElement>(null);
  const frontRef = useRef<0 | 1>(0);
  const shownRef = useRef(firstBg);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--sky-top", top);
    root.style.setProperty("--sky-horizon", horizon);
  }, [top, horizon]);

  useEffect(
    () => () => {
      const root = document.documentElement;
      root.style.removeProperty("--sky-top");
      root.style.removeProperty("--sky-horizon");
    },
    [],
  );

  useEffect(() => {
    if (bg === shownRef.current) return;
    const a = slotA.current;
    const b = slotB.current;
    if (!a || !b) return;
    const front = frontRef.current === 0 ? a : b;
    const back = frontRef.current === 0 ? b : a;
    const ms = still ? 150 : 1200;
    // Settle the current front instantly (it may be mid-fade), then fade the new sky in on top.
    front.style.transition = "none";
    front.style.opacity = "1";
    front.style.zIndex = "0";
    back.style.transition = "none";
    back.style.opacity = "0";
    back.style.zIndex = "1";
    back.style.background = bg;
    void back.offsetWidth;
    back.style.transition = `opacity ${ms}ms ${EASE_IN_OUT}`;
    back.style.opacity = "1";
    frontRef.current = frontRef.current === 0 ? 1 : 0;
    shownRef.current = bg;
    const id = window.setTimeout(() => {
      front.style.opacity = "0";
    }, ms + 60);
    return () => window.clearTimeout(id);
  }, [bg, still]);

  /* --- Canvas engine --- */
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const eng = createEngine(canvas, tier);
    engineRef.current = eng;
    return () => {
      eng?.destroy();
      engineRef.current = null;
    };
  }, [tier]);

  const starVis = night ? (kind === "clear" ? 1 : kind === "partly" ? 0.7 : 0) : 0;
  const moon = night && (kind === "clear" || kind === "partly");
  const dens = typeof density === "number" && Number.isFinite(density) ? clamp(density, 0, 1.5) : 1;

  const scene = useMemo<EngineScene>(
    () => ({
      kind,
      intensity: I,
      windKph: wind,
      night,
      bright,
      storm: kind === "storm",
      starVis,
      moon,
      density: dens,
      still,
    }),
    [kind, I, wind, night, bright, starVis, moon, dens, still],
  );

  useEffect(() => {
    engineRef.current?.setScene(scene);
  }, [scene, tier]);

  /* --- Cloud and fog drift (compositor-only transform animations) --- */
  // Created once and then played or paused, never cancelled mid-scene: pausing freezes a deck where
  // it is (the still frame for reduced motion and Calm mode) and resuming never jumps. Decks that are
  // invisible (clear sky, no fog) stay paused so no compositor work runs for them.
  const cloudRefs = useRef<(HTMLDivElement | null)[]>([]);
  const fogRefs = useRef<(HTMLDivElement | null)[]>([]);
  const driftRef = useRef<{ anim: Animation; fog: boolean }[]>([]);

  useEffect(() => {
    const list: { anim: Animation; fog: boolean }[] = [];
    CLOUD_DECKS.forEach((deck, i) => {
      const el = cloudRefs.current[i];
      if (!el || typeof el.animate !== "function") return;
      const from = `translate3d(${-deck.dist}%, 0, 0)`;
      const to = `translate3d(${deck.dist}%, 0, 0)`;
      const anim = el.animate([{ transform: i % 2 ? to : from }, { transform: i % 2 ? from : to }], {
        duration: deck.dur,
        delay: -deck.dur * 0.35 * (i + 1),
        iterations: Infinity,
        direction: "alternate",
        easing: "ease-in-out",
      });
      anim.pause();
      list.push({ anim, fog: false });
    });
    [80_000, 110_000].forEach((dur, i) => {
      const el = fogRefs.current[i];
      if (!el || typeof el.animate !== "function") return;
      const d = i ? 9 : 7;
      const anim = el.animate(
        [{ transform: `translate3d(${i ? d : -d}%, 0, 0)` }, { transform: `translate3d(${i ? -d : d}%, 0, 0)` }],
        { duration: dur, delay: -dur * 0.4, iterations: Infinity, direction: "alternate", easing: "ease-in-out" },
      );
      anim.pause();
      list.push({ anim, fog: true });
    });
    driftRef.current = list;
    return () => {
      list.forEach((d) => d.anim.cancel());
      driftRef.current = [];
    };
  }, []);

  /* --- Storm lightning: soft, single, at most one flash per 8-14 s, never in still mode. --- */
  const flashRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (kind !== "storm" || still) return;
    const el = flashRef.current;
    if (!el || typeof el.animate !== "function") return;
    let timer = 0;
    let anim: Animation | null = null;
    let lastFlash = -Infinity;
    const schedule = () => {
      timer = window.setTimeout(fire, 8000 + Math.random() * 6000);
    };
    const fire = () => {
      const now = performance.now();
      if (!document.hidden && now - lastFlash >= 8000) {
        lastFlash = now;
        const x = Math.round(15 + Math.random() * 70);
        el.style.background =
          `radial-gradient(ellipse 70% 55% at ${x}% 12%, rgb(220 230 255) 0%, ` +
          `rgb(220 230 255 / 0.45) 38%, rgb(220 230 255 / 0) 72%)`;
        anim?.cancel();
        anim = el.animate(
          [
            { opacity: 0, easing: "cubic-bezier(0.2, 0, 0.4, 1)" },
            { opacity: 0.1, offset: 0.2 },
            { opacity: 0.1, offset: 0.333, easing: "cubic-bezier(0.25, 0, 0.3, 1)" },
            { opacity: 0 },
          ],
          { duration: 600, fill: "none" },
        );
        window.dispatchEvent(new CustomEvent("aspire:sky-lightning"));
      }
      schedule();
    };
    schedule();
    return () => {
      window.clearTimeout(timer);
      anim?.cancel();
    };
  }, [kind, still]);

  /* --- Derived decor --- */
  const cloudLight = mixHex(horizon, "#FFFFFF", 0.08);
  const cloudShade = mixHex(top, "#02060F", 0.25);
  const deckOpacity = (cover / 100) * 0.55 * (night ? 0.85 : 1);

  const fogA = kind === "fog" ? (0.18 * I + 0.1) * (night ? 0.7 : 1) : 0;
  const veilA =
    kind === "fog"
      ? 0.22 + 0.2 * I
      : family === "rain" || family === "storm" || family === "snow"
        ? 0.06 + 0.08 * I
        : 0;

  const cloudsOn = deckOpacity > 0;
  const fogOn = fogA > 0;
  useEffect(() => {
    for (const { anim, fog } of driftRef.current) {
      // The low tier skips the fog drift (spec 5.3).
      const run = !still && (fog ? fogOn && tier >= 1 : cloudsOn);
      if (run) anim.play();
      else anim.pause();
    }
  }, [still, cloudsOn, fogOn, tier]);

  const bloom = useMemo(() => {
    if (night) {
      if (!(kind === "clear" || kind === "partly")) return null;
      return { x: 80, y: 16, color: "#DCE6FF", alpha: 0.12 };
    }
    const through = SUN_THROUGH[kind] ?? 0;
    if (through <= 0) return null;
    let x = 50;
    let y = 22;
    if (sunKnown) {
      // Placed by the real sun: east on the left, west on the right, higher with elevation.
      if ((sunAltDeg as number) < -2) return null;
      x = 12 + 76 * clamp(((sunAzDeg as number) - 90) / 180, 0, 1);
      y = 62 - 50 * clamp((sunAltDeg as number) / 60, 0, 1);
    } else if (hour != null) {
      const tt = clamp((hour + 0.5 - 6) / 12, 0, 1);
      x = 12 + 76 * tt;
      y = 62 - 50 * Math.sin(Math.PI * tt);
    }
    if (y > 60) return null;
    const warm = phase !== "day";
    return warm
      ? { x, y, color: "#FFAA78", alpha: 0.4 * through }
      : { x, y, color: "#FFECC8", alpha: 0.35 * through };
  }, [night, kind, hour, phase, sunKnown, sunAltDeg, sunAzDeg]);

  const haze = typeof aqiSeverity === "number" && aqiSeverity > 1 ? 0.04 * (clamp(Math.round(aqiSeverity), 1, 6) - 1) : 0;
  const fade = `opacity ${still ? 150 : 1200}ms ${EASE_IN_OUT}`;

  return (
    <div
      aria-hidden="true"
      className={cn("pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-[#060B16]", className)}
      style={{ contain: "strict" }}
    >
      {/* 1. Gradient slots */}
      <div ref={slotA} className="absolute inset-0" style={{ background: firstBg, opacity: 1, zIndex: 1 }} />
      <div ref={slotB} className="absolute inset-0" style={{ opacity: 0, zIndex: 0 }} />

      {/* 2. Sun bloom or moon glow (desktop only) */}
      {!lowTransparency && (
        <div
          className="absolute left-0 top-0 hidden lg:block"
          style={{
            width: "60vmax",
            height: "60vmax",
            zIndex: 2,
            opacity: bloom ? 1 : 0,
            transform: bloom
              ? `translate3d(calc(${bloom.x}vw - 30vmax), calc(${bloom.y}vh - 30vmax), 0)`
              : "translate3d(calc(50vw - 30vmax), calc(20vh - 30vmax), 0)",
            background: bloom
              ? `radial-gradient(circle, ${rgba(bloom.color, bloom.alpha)} 0%, ${rgba(bloom.color, bloom.alpha * 0.35)} 30%, ${rgba(bloom.color, 0)} 70%)`
              : "none",
            transition: `${fade}, transform ${still ? 150 : 1200}ms ${EASE_IN_OUT}`,
          }}
        />
      )}

      {/* 3. Grain (static) */}
      {!lowTransparency && (
        <div
          className="absolute inset-0"
          style={{ zIndex: 2, backgroundImage: GRAIN, backgroundSize: "180px 180px", opacity: 0.045 }}
        />
      )}

      {/* 4. Canvas: stars, moon, meteors, precipitation */}
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" style={{ zIndex: 3 }} />

      {/* 5. Cloud decks */}
      {CLOUD_DECKS.map((deck, i) => (
        <div
          key={i}
          ref={(el) => {
            cloudRefs.current[i] = el;
          }}
          className="absolute"
          style={{
            zIndex: 4,
            left: "-30%",
            width: "160%",
            top: deck.top,
            height: deck.height,
            background: cloudBackground(cloudLight, cloudShade, deck.blobs),
            opacity: deckOpacity * deck.op,
            transition: fade,
          }}
        />
      ))}

      {/* 6. Fog bands and the low veil */}
      {[55, 75].map((at, i) => (
        <div
          key={at}
          ref={(el) => {
            fogRefs.current[i] = el;
          }}
          className="absolute"
          style={{
            zIndex: 5,
            left: "-50%",
            width: "200%",
            top: `calc(${at}% - 20vh)`,
            height: "40vh",
            background: fogBand(Math.max(fogA, 0.01), i * 17),
            opacity: fogA > 0 ? 1 : 0,
            transition: fade,
          }}
        />
      ))}
      <div
        className="absolute inset-x-0 bottom-0"
        style={{
          zIndex: 5,
          height: "55%",
          background: `linear-gradient(0deg, ${rgba(FOG_RGB, veilA)} 0%, ${rgba(FOG_RGB, veilA * 0.4)} 45%, ${rgba(FOG_RGB, 0)} 100%)`,
          opacity: veilA > 0 ? (night ? 0.6 : 1) : 0,
          transition: fade,
        }}
      />

      {/* 7. Storm, still mode: a static horizon glow instead of any flash */}
      <div
        className="absolute inset-0"
        style={{
          zIndex: 6,
          background: "radial-gradient(120% 45% at 50% 100%, rgb(200 190 255 / 0.06) 0%, rgb(200 190 255 / 0) 70%)",
          opacity: kind === "storm" && still ? 1 : 0,
          transition: fade,
        }}
      />

      {/* 8. AQI haze */}
      <div className="absolute inset-0" style={{ zIndex: 6, background: "#8A7A5A", opacity: haze, transition: fade }} />

      {/* 9. Lightning overlay (opacity animated only) */}
      <div ref={flashRef} className="absolute inset-0" style={{ zIndex: 7, opacity: 0 }} />

      {/* 10. Vignette: grounds the panels and frames the sky */}
      <div
        className="absolute inset-0"
        style={{
          zIndex: 8,
          background: "radial-gradient(130% 100% at 50% 35%, rgb(2 6 16 / 0) 55%, rgb(2 6 16 / 0.38) 100%)",
        }}
      />
    </div>
  );
}

export default Sky;
