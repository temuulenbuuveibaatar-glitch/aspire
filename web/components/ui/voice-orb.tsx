"use client";

// Voice Orb from 21st.dev (aadixc0de / chatcn: https://chatcn.dev), trimmed for Aspire:
// no speech simulator, no injected theme variables (color comes from `currentColor`).

import * as React from "react";
import { cn } from "@/lib/utils";

export type VoiceOrbState =
  | "idle"
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking"
  | "interrupted"
  | "muted"
  | "error";

/** A level from 0 to 1, or a function that returns the current one (read every frame). */
type Level = number | (() => number);

export interface VoiceOrbProps extends Omit<React.ComponentProps<"div">, "children"> {
  state?: VoiceOrbState;
  /** Audio level 0..1: the user's input while listening, the voice output while speaking. */
  level?: Level;
  /** Size in px. */
  size?: number;
  /** Force reduced motion on or off. Defaults to the user's setting. */
  reducedMotion?: boolean;
  /** Accessible name. */
  label?: string;
}

const REDUCED = "(prefers-reduced-motion: reduce)";

function usePrefersReducedMotion() {
  const [reduced, setReduced] = React.useState(false);
  React.useEffect(() => {
    const query = window.matchMedia?.(REDUCED);
    if (!query) return;
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);
const readLevel = (l: Level | undefined) => (l === undefined ? 0 : clamp01(typeof l === "function" ? l() : l));

/* ---------------------------------------------------------------------------------------------
 * Form: a sphere drawn as contour lines. Each state is a set of form parameters; the canvas
 * eases toward the target every frame, so states morph instead of cutting. Waves travel inward
 * while listening and outward while speaking, so the orb reads with the sound off.
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
}

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
    ...partial,
  };
}

const FORMS: Record<VoiceOrbState, OrbForm> = {
  idle: f({ flow: 0.022, stir: 0.32, turn: 0.1, breathe: 0.014 }),
  connecting: f({ scale: 0.86, flow: 0.012, stir: 0.4, turn: 0.5, trace: 0.3, back: 0.08 }),
  listening: f({ flow: 0.03, stir: 0.6, wave: 0.014, travel: -0.9, turn: 0.16, breathe: 0.01 }),
  thinking: f({ scale: 0.84, flow: 0.08, stir: 1.3, turn: 1, breathe: 0.024, shimmer: 1 }),
  speaking: f({ flow: 0.026, stir: 0.7, wave: 0.02, travel: 1.3, turn: 0.22 }),
  interrupted: f({ scale: 0.88, flow: 0.016, squash: 0.16, back: 0.1 }),
  muted: f({ scale: 0.86, ink: 0.62, back: 0.05, dots: 1 }),
  error: f({ scale: 0.86, ink: 0.55, back: 0.06, split: 1 }),
};

const STILL_LEVEL = 0.4;

function stillForm(state: VoiceOrbState): OrbForm {
  const form = withLevel(FORMS[state], state, STILL_LEVEL);
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
}

type Point = [number, number];
interface Strokes {
  front: Point[][][];
  back: Point[][];
}

const BANDS = 5;
const GLOWS = 4;
const TILT = 0.36;
const COS_T = Math.cos(TILT);
const SIN_T = Math.sin(TILT);

function sphere(form: OrbForm, phase: OrbPhase, cx: number, cy: number, r: number, lines: number, samples: number): Strokes {
  const front: Point[][][] = Array.from({ length: BANDS * GLOWS }, () => []);
  const back: Point[][] = [];
  const breath = 1 + form.breathe * Math.sin(phase.breath);
  const radius = r * form.scale * breath;
  const sx = 1 + form.squash * 0.5;
  const sy = 1 - form.squash;
  const ct = Math.cos(phase.turn);
  const st = Math.sin(phase.turn);

  for (let i = 0; i < lines; i++) {
    const lat = -Math.PI / 2 + (Math.PI * (i + 1)) / (lines + 1);
    const cl = Math.cos(lat);
    const sl = Math.sin(lat);
    const start = phase.trace + i * 0.06;
    const off = (1 - (i + 0.5) / lines - (phase.sweep * 1.3 - 0.15)) / 0.18;
    const near = Math.exp(-off * off);
    const lit = 1 - form.shimmer * (1 - near);
    const step = Math.round(lit * (GLOWS - 1));

    let line: Point[] | null = null;
    let band = -2;
    let prev: Point | null = null;
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
      const wave = Math.sin(dist * 8 - phase.wave) * front01;

      const give = 0.3 + 0.7 * cl;
      const rr = radius * (1 + give * (form.flow * flow + form.wave * wave));
      const lift = form.wave * wave * radius * 0.7 * give;
      const point: Point = [cx + ux * rr * sx, cy - (vy * rr + lift) * sy];

      let on = true;
      if (form.trace < 0.985) {
        const u = (((j / samples - start) % 1) + 1) % 1;
        on = u < form.trace;
      }

      if (prev && on && prevOn) {
        const z = (prevZ + vz) / 2;
        const next = z < 0 ? -1 : Math.min(BANDS - 1, Math.floor(z * BANDS)) * GLOWS + step;
        if (next !== band || !line) {
          line = [prev];
          if (next < 0) back.push(line);
          else (front[next] as Point[][]).push(line);
          band = next;
        }
        line.push(point);
      } else {
        line = null;
        band = -2;
      }
      prev = point;
      prevZ = vz;
      prevOn = on;
    }
  }
  return { front, back };
}

const STILL_PHASE: OrbPhase = { flow: 1.3, wave: 2.2, turn: 0.6, breath: 0, trace: 0.15, sweep: 0.4 };

const lineWeight = (px: number) => Math.min(1.6, Math.max(0.9, px / 130));

function approach(current: number, target: number, rate: number, dt: number) {
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}

function bandStyle(index: number) {
  const z = (Math.floor(index / GLOWS) + 0.5) / BANDS;
  const lit = (index % GLOWS) / (GLOWS - 1);
  return { alpha: (0.28 + 0.72 * z ** 0.8) * (0.45 + 0.55 * lit), weight: 0.7 + 0.55 * z };
}

function tracePolyline(ctx: CanvasRenderingContext2D, points: Point[]) {
  const first = points[0] as Point;
  ctx.moveTo(first[0], first[1]);
  for (let k = 1; k < points.length; k++) {
    const p = points[k] as Point;
    ctx.lineTo(p[0], p[1]);
  }
}

const KEYS = Object.keys(FORMS.idle) as (keyof OrbForm)[];
const BREATH: Partial<Record<VoiceOrbState, number>> = { idle: 4.6, listening: 3.4, thinking: 1.8 };

/* ---------------------------------------------------------------------------------------------
 * Canvas renderer: a sleeping rAF loop (pauses off screen / hidden tab / when settled).
 * -------------------------------------------------------------------------------------------*/

function OrbCanvas({ state, levelFor, reducedMotion }: { state: VoiceOrbState; levelFor: () => number; reducedMotion: boolean }) {
  const stateRef = React.useRef(state);
  const levelRef = React.useRef(levelFor);
  const reducedRef = React.useRef(reducedMotion);
  React.useLayoutEffect(() => {
    stateRef.current = state;
    levelRef.current = levelFor;
    reducedRef.current = reducedMotion;
  });

  const loop = React.useRef({
    canvas: null as HTMLCanvasElement | null,
    ctx: null as CanvasRenderingContext2D | null,
    color: "",
    raf: 0,
    running: false,
    visible: true,
    last: 0,
    form: { ...FORMS[state] },
    phase: { ...STILL_PHASE },
    level: 0,
    first: true,
  });

  const draw = React.useCallback((now: number) => {
    const st = loop.current;
    st.raf = 0;
    const { canvas, ctx } = st;
    if (!canvas || !ctx) {
      st.running = false;
      return;
    }
    const dt = st.last ? Math.min(0.05, Math.max(0, (now - st.last) / 1000)) : 1 / 60;
    st.last = now;

    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const bw = Math.max(1, Math.round(width * dpr));
    const bh = Math.max(1, Math.round(height * dpr));
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
    st.color = getComputedStyle(canvas).color || "#fff";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const current = stateRef.current;
    const reduced = reducedRef.current;
    const raw = current === "listening" || current === "speaking" ? levelRef.current() : 0;

    let form: OrbForm;
    let phase: OrbPhase;
    if (reduced) {
      form = stillForm(current);
      phase = STILL_PHASE;
      st.form = { ...form };
      st.phase = { ...STILL_PHASE };
      st.level = 0;
    } else {
      st.level = approach(st.level, raw, raw > st.level ? 16 : 5, dt);
      const target = withLevel(FORMS[current], current, st.level);
      for (const key of KEYS) {
        const rate = key === "split" || key === "squash" ? 11 : key === "trace" ? 4 : 6;
        st.form[key] = st.first ? target[key] : approach(st.form[key], target[key], rate, dt);
      }
      st.first = false;
      form = st.form;
      st.phase.flow += dt * form.stir;
      st.phase.wave += dt * form.travel * 6;
      st.phase.turn += dt * form.turn;
      st.phase.breath += (dt * Math.PI * 2) / (BREATH[current] ?? 3.6);
      st.phase.trace += dt * 0.42;
      st.phase.sweep = (st.phase.sweep + dt / 1.8) % 1;
      phase = st.phase;
    }

    const px = Math.min(width, height);
    const cx = width / 2;
    const cy = height / 2;
    const r = (px / 2) * 0.9;
    const { lines, samples } = density(px);
    const strokes = sphere(form, phase, cx, cy, r, lines, samples);
    const weight = lineWeight(px);

    const paint = () => {
      ctx.strokeStyle = st.color;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      if (form.dots > 0.5) ctx.setLineDash([0, weight * 3.2]);
      else if (form.dots > 0.01) ctx.setLineDash([weight * 6 * (1 - form.dots), weight * 3.2]);
      if (form.back > 0.005 && strokes.back.length) {
        ctx.beginPath();
        for (const line of strokes.back) tracePolyline(ctx, line);
        ctx.globalAlpha = form.back * form.ink;
        ctx.lineWidth = weight * 0.7;
        ctx.stroke();
      }
      strokes.front.forEach((bandLines, band) => {
        if (!bandLines.length) return;
        const style = bandStyle(band);
        ctx.beginPath();
        for (const line of bandLines) tracePolyline(ctx, line);
        ctx.globalAlpha = style.alpha * form.ink;
        ctx.lineWidth = weight * style.weight * (form.dots > 0.5 ? 1.5 : 1);
        ctx.stroke();
      });
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    };

    if (form.split > 0.01) {
      const gap = form.split * r * 0.12;
      for (const half of [-1, 1]) {
        ctx.save();
        ctx.translate(0, (gap / 2) * half);
        ctx.beginPath();
        ctx.rect(0, half < 0 ? 0 : cy, width, half < 0 ? cy : height - cy);
        ctx.clip();
        paint();
        ctx.restore();
      }
    } else {
      paint();
    }

    let keep = false;
    if (!reduced) {
      const target = withLevel(FORMS[current], current, st.level);
      const settled = KEYS.every((key) => Math.abs(st.form[key] - target[key]) < 0.0015);
      const moving =
        (form.stir > 0.002 && form.flow > 0.0005) ||
        form.breathe > 0.0005 ||
        form.turn > 0.002 ||
        form.trace < 0.985 ||
        form.shimmer > 0.005 ||
        (Math.abs(form.travel) > 0.002 && form.wave > 0.0005);
      keep = !settled || moving || st.level > 0.002;
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
      if (!canvas) return;
      const resize = new ResizeObserver(() => invalidate());
      resize.observe(canvas);
      const io = new IntersectionObserver((entries) => {
        const entry = entries[entries.length - 1];
        st.visible = entry ? entry.isIntersecting && !document.hidden : true;
        if (st.visible) invalidate();
      });
      io.observe(canvas);
      const onVisibility = () => {
        st.visible = !document.hidden;
        if (st.visible) invalidate();
      };
      document.addEventListener("visibilitychange", onVisibility);
      invalidate();
      return () => {
        resize.disconnect();
        io.disconnect();
        document.removeEventListener("visibilitychange", onVisibility);
        if (st.raf) cancelAnimationFrame(st.raf);
        st.running = false;
      };
    },
    [invalidate],
  );

  // State, color class or reduced motion changed: draw again.
  React.useEffect(() => {
    invalidate();
  }, [state, reducedMotion, invalidate]);

  return <canvas ref={ref} data-slot="voice-orb-canvas" className="absolute inset-0 size-full" />;
}

/** The voice presence: a sphere of contour lines tinted with `currentColor`. */
export function VoiceOrb({ state = "idle", level, size = 144, reducedMotion: reducedProp, label, className, style, ...props }: VoiceOrbProps) {
  const prefersReduced = usePrefersReducedMotion();
  const reducedMotion = reducedProp ?? prefersReduced;
  const source = React.useRef(level);
  React.useLayoutEffect(() => {
    source.current = level;
  });
  const levelFor = React.useCallback(() => readLevel(source.current), []);

  return (
    <div
      role="img"
      aria-label={label ?? `Voice: ${state}`}
      data-slot="voice-orb"
      data-voice-state={state}
      style={{ width: size, height: size, ...style }}
      className={cn("relative shrink-0 select-none", className)}
      {...props}
    >
      <OrbCanvas state={state} levelFor={levelFor} reducedMotion={reducedMotion} />
    </div>
  );
}

export default VoiceOrb;
