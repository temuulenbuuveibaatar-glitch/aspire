"use client";

// Rain on the glass over the hero photo: drops bead up, merge, and run down leaving small drops behind.
// Each drop is a little lens that shows a blurred, upside-down piece of the photo behind it, with a
// dark rim and a highlight. One WebGL canvas, no dependency. Sky mounts it only for drizzle, rain and
// storm over a photo. No WebGL: nothing is drawn (Sky's 2D streaks stay). A photo host without CORS:
// the drops are plain glassy beads. Still (reduced motion or Calm): one settled frame, no loop.

import { useEffect, useRef } from "react";
import { httpsUrl } from "@/lib/utils";

export interface RainGlassProps {
  /** The hero photo (https only; anything else draws beads without refraction). */
  src: string | null | undefined;
  /** 0..1: how hard it rains. */
  intensity: number;
  still?: boolean;
  /** 0.5 on low-end devices (half the drops, 24 fps). */
  tier?: number;
}

/** A drop in CSS px. vy 0: resting on the glass; above: running down. */
export interface Drop {
  x: number;
  y: number;
  r: number;
  vy: number;
  drift: number;
  /** Distance run since the last drop it left behind. */
  slid: number;
}

/** Hard ceiling on drops (vertex buffer size). */
export const MAX_DROPS = 160;
/** A resting drop this big may start to run; a running one smaller than RUN_MIN stops. */
const SLIDE_R = 7;
const RUN_MIN = 4.5;
const MAX_R = 16;
/** px/s a resting drop dries up. */
const EVAP = 0.08;

/** Drop cap for a canvas and device tier: scales with area, 40..160 (half on the low tier). */
export function dropCap(w: number, h: number, tier: number): number {
  const n = Math.min(MAX_DROPS, Math.max(40, ((w * h) / (390 * 320)) * 70));
  return Math.round(n * (tier < 1 ? 0.5 : 1));
}

/** Texture scale and offset so screen position p (0..1) samples an object-fit: cover image of iw x ih. */
export function coverUv(w: number, h: number, iw: number, ih: number): [number, number, number, number] {
  const s = Math.max(w / iw, h / ih);
  const dw = iw * s, dh = ih * s;
  return [w / dw, h / dh, (dw - w) / 2 / dw, (dh - h) / 2 / dh];
}

const drop = (x: number, y: number, r: number): Drop => ({ x, y, r, vy: 0, drift: 0, slid: 0 });
/** A whole number of events for a fractional rate (2.3 -> 2, or 3 three times in ten). */
const count = (rate: number, rand: () => number) => Math.floor(rate) + (rand() < rate % 1 ? 1 : 0);

/** One simulation step, in place: new beads, running drops (with stalls and trails), merges, removal. */
export function stepDrops(drops: Drop[], dt: number, w: number, h: number, intensity: number, cap: number, rand: () => number): void {
  const area = (w * h) / (390 * 320);
  for (let k = count((12 + 40 * intensity) * area * dt, rand); k > 0 && drops.length < cap * 0.85; k--) drops.push(drop(rand() * w, rand() * h, 1.2 + 2.3 * rand()));
  for (let k = count((0.6 + 2 * intensity) * area * dt, rand); k > 0 && drops.length < cap; k--) drops.push(drop(rand() * w, rand() * h * 0.7, 5 + 9 * rand() ** 2));

  const n = drops.length;
  for (let i = 0; i < n; i++) {
    const d = drops[i];
    if (d.vy === 0) {
      d.r -= EVAP * dt;
      if (d.r >= SLIDE_R && rand() < 0.35 * dt) d.vy = 20;
      continue;
    }
    // Bigger drops run faster; now and then one catches on the glass and nearly stops.
    d.vy += (25 + (d.r - 5) * 22 - d.vy) * Math.min(1, 3 * dt);
    if (rand() < 1.2 * dt) d.vy *= 0.15;
    if (rand() < 2 * dt) d.drift = (rand() - 0.5) * d.r * 3;
    const dy = d.vy * dt;
    d.y += dy;
    d.x += d.drift * dt;
    d.slid += dy;
    // Every so often it leaves a small drop behind and loses that water (volume goes as r^3).
    if (d.slid > d.r * 1.6 && drops.length < cap) {
      d.slid = 0;
      const tr = d.r * (0.18 + 0.17 * rand());
      drops.push(drop(d.x + (rand() - 0.5) * d.r * 0.4, d.y - d.r * 1.1, tr));
      d.r = Math.cbrt(d.r ** 3 - tr ** 3);
    }
    if (d.r < RUN_MIN) d.vy = d.drift = 0;
  }
  // A running drop swallows what it touches, keeping the water: r^3 adds.
  for (const a of drops) {
    if (a.vy === 0 || a.r <= 0) continue;
    for (const b of drops) {
      if (b === a || b.r <= 0) continue;
      const dx = a.x - b.x, dy = a.y - b.y, rr = (a.r + b.r) * 0.75;
      if (dx * dx + dy * dy < rr * rr) {
        a.r = Math.min(MAX_R, Math.cbrt(a.r ** 3 + b.r ** 3));
        b.r = 0;
      }
    }
  }
  // Gone: swallowed, dried up or run off the bottom. Compacted in place.
  let j = 0;
  for (const d of drops) if (d.r >= 1 && d.y - d.r * 2 < h) drops[j++] = d;
  drops.length = j;
}

const VERT = `
attribute vec2 aPos; attribute vec2 aLocal; attribute vec2 aCenter; attribute float aR;
uniform vec2 uRes; uniform vec4 uCover;
varying vec2 vLocal; varying vec2 vUv;
void main() {
  vLocal = aLocal;
  // A lens: the scene behind shows inverted and squeezed. Linear in aLocal, so it can be done per vertex.
  vUv = (aCenter - aLocal * aR * 2.4) / uRes * uCover.xy + uCover.zw;
  vec2 c = aPos / uRes * 2.0 - 1.0;
  gl_Position = vec4(c.x, -c.y, 0.0, 1.0);
}`;

const FRAG = `
precision mediump float;
uniform sampler2D uTex; uniform float uHasTex;
varying vec2 vLocal; varying vec2 vUv;
void main() {
  vec2 l = vLocal;
  l.x *= 1.0 + 0.3 * max(0.0, -l.y);
  float d = length(l);
  if (d > 1.0) discard;
  float z = sqrt(1.0 - d * d);
  vec3 col = mix(vec3(0.62, 0.68, 0.76), texture2D(uTex, vUv).rgb, uHasTex);
  col *= 1.0 - 0.45 * smoothstep(0.55, 1.0, d);
  col += 0.22 * smoothstep(0.6, 1.0, d) * max(0.0, l.y);
  col += 0.6 * pow(max(0.0, dot(normalize(vec3(l, z)), normalize(vec3(-0.4, -0.6, 0.7)))), 28.0);
  float a = smoothstep(1.0, 0.84, d) * mix(0.35, 0.9, uHasTex);
  gl_FragColor = vec4(col * a, a);
}`;

/** Per vertex: pos.xy, local.xy, center.xy, r. */
const FLOATS = 7;
const QUAD = [-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1];

function compile(gl: WebGLRenderingContext): WebGLProgram | null {
  const prog = gl.createProgram();
  if (!prog) return null;
  for (const [type, src] of [[gl.VERTEX_SHADER, VERT], [gl.FRAGMENT_SHADER, FRAG]] as const) {
    const sh = gl.createShader(type);
    if (!sh) return null;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    gl.attachShader(prog, sh);
    gl.deleteShader(sh);
  }
  gl.linkProgram(prog);
  if (gl.getProgramParameter(prog, gl.LINK_STATUS)) return prog;
  gl.deleteProgram(prog);
  return null;
}

/** Starts the glass on a canvas; returns its cleanup, or null without WebGL. */
function createGlass(canvas: HTMLCanvasElement, src: string | null, intensity: number, still: boolean, tier: number): (() => void) | null {
  // The context is not force-lost on cleanup: the same canvas gets it back on the next run (Strict Mode, a new photo).
  const gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, powerPreference: "low-power" });
  if (!gl || gl.isContextLost()) return null;
  const prog = compile(gl);
  const buf = gl.createBuffer();
  const tex = gl.createTexture();
  if (!prog || !buf || !tex) return null;
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  const attrs: [string, number, number][] = [["aPos", 2, 0], ["aLocal", 2, 2], ["aCenter", 2, 4], ["aR", 1, 6]];
  for (const [name, size, at] of attrs) {
    const loc = gl.getAttribLocation(prog, name);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, FLOATS * 4, at * 4);
  }
  const u = (name: string) => gl.getUniformLocation(prog, name);
  const uRes = u("uRes"), uCover = u("uCover"), uHasTex = u("uHasTex");
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
  for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
  gl.uniform1i(u("uTex"), 0);
  gl.uniform1f(uHasTex, 0);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  const verts = new Float32Array(MAX_DROPS * 6 * FLOATS);
  const drops: Drop[] = [];
  // Seeded, so the still frame is the same each time.
  let seed = 0x9e3779b9;
  const rand = () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = Math.imul(seed ^ (seed >>> 15), seed | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  let w = 0, h = 0, iw = 0, ih = 0;
  let raf = 0, last = 0, dead = false, onScreen = true;
  const fps = tier < 1 ? 24 : 30;
  const cap = () => dropCap(w, h, tier);

  function cover() {
    if (iw && ih && w && h) gl!.uniform4fv(uCover, coverUv(w, h, iw, ih));
  }

  function draw() {
    if (dead || gl!.isContextLost()) return;
    let k = 0;
    for (const d of drops) {
      if (k + 6 * FLOATS > verts.length) break;
      // Two triangles; a running drop stretches along its path.
      const hw = d.r, hh = d.r * (1 + Math.min(d.vy / 150, 0.6));
      for (let c = 0; c < 12; c += 2) {
        const lx = QUAD[c], ly = QUAD[c + 1];
        verts[k] = d.x + lx * hw;
        verts[k + 1] = d.y + ly * hh;
        verts[k + 2] = lx;
        verts[k + 3] = ly;
        verts[k + 4] = d.x;
        verts[k + 5] = d.y;
        verts[k + 6] = d.r;
        k += FLOATS;
      }
    }
    gl!.clearColor(0, 0, 0, 0);
    gl!.clear(gl!.COLOR_BUFFER_BIT);
    if (!k) return;
    gl!.bufferData(gl!.ARRAY_BUFFER, verts.subarray(0, k), gl!.DYNAMIC_DRAW);
    gl!.drawArrays(gl!.TRIANGLES, 0, k / FLOATS);
  }

  function frame(now: number) {
    raf = 0;
    if (dead || document.hidden || !onScreen) return;
    if (now - last >= 1000 / fps - 2) {
      stepDrops(drops, Math.min(0.1, (now - last) / 1000), w, h, intensity, cap(), rand);
      last = now;
      draw();
    }
    raf = requestAnimationFrame(frame);
  }
  function kick() {
    if (still || raf || dead || document.hidden || !onScreen || !w) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }
  function stop() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const nw = Math.round(rect.width), nh = Math.round(rect.height);
    if (nw < 2 || nh < 2 || (nw === w && nh === h)) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(4e6 / (nw * nh))); // at most about 4 MP
    const first = !w;
    [w, h] = [nw, nh];
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    gl!.viewport(0, 0, canvas.width, canvas.height);
    gl!.uniform2f(uRes, w, h);
    cover();
    // Start with glass that has been raining a while, not an empty pane.
    if (first) for (let s = 0; s < 90; s++) stepDrops(drops, 1 / 15, w, h, intensity, cap(), rand);
    draw();
    kick();
  }

  // A blurred copy of the photo, at most 512 px wide (bounded memory whatever the source size).
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.referrerPolicy = "no-referrer";
  img.decoding = "async";
  img.onload = () => {
    if (dead || !img.naturalWidth || !img.naturalHeight) return;
    const tw = Math.min(512, img.naturalWidth), th = Math.max(1, Math.round((tw * img.naturalHeight) / img.naturalWidth));
    const c = document.createElement("canvas");
    [c.width, c.height] = [tw, th];
    const g = c.getContext("2d");
    if (!g) return;
    g.filter = "blur(3px)";
    g.drawImage(img, -6, -6, tw + 12, th + 12);
    try {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
      gl.uniform1f(uHasTex, 1);
      [iw, ih] = [img.naturalWidth, img.naturalHeight];
      cover();
      draw();
    } catch {
      // A tainted canvas (no CORS after all): keep the plain beads.
    }
    c.width = c.height = 0;
  };
  if (src) img.src = src;

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
  const onLost = () => {
    dead = true;
    stop();
  };
  document.addEventListener("visibilitychange", onVis);
  canvas.addEventListener("webglcontextlost", onLost);
  resize();

  return () => {
    dead = true;
    stop();
    ro?.disconnect();
    io?.disconnect();
    document.removeEventListener("visibilitychange", onVis);
    canvas.removeEventListener("webglcontextlost", onLost);
    img.onload = null;
    img.src = "";
    if (!gl.isContextLost()) {
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.deleteBuffer(buf);
      gl.deleteTexture(tex);
      gl.deleteProgram(prog);
    }
  };
}

export function RainGlass({ src, intensity, still = false, tier = 1 }: RainGlassProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const url = httpsUrl(src);
  // Rounded, so a tiny weather update does not restart the glass.
  const I = Math.round((Number.isFinite(intensity) ? Math.min(1, Math.max(0, intensity)) : 0.5) * 10) / 10;
  useEffect(() => (ref.current ? (createGlass(ref.current, url, I, still, tier) ?? undefined) : undefined), [url, I, still, tier]);
  return <canvas ref={ref} aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" />;
}
