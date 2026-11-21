"use client";

// The hero of the opening page: the app's voice orb as a core inside two slowly turning rings, with
// the headline, the buttons and the four corner readings laid out around it (Landing renders those
// on the server and passes them in, so every word is in the HTML before any script runs).
//
// What this file adds once it has hydrated, and only then:
// - the live orb (the app's own VoiceOrb) fades in over its still drawing, and listens while the
//   pointer is near it: the ring follows how fast the pointer moves, the way it follows a voice;
// - a small pointer parallax on desktop: the orb, the rings and the copy sit at different depths,
//   and a soft light follows the mouse across the hero;
// - the way out on scroll: the copy lifts and blurs away, the rings open, the core dims.
// Reduced motion or Calm mode: none of the three. No JavaScript: the still core and all the text.
// Motion is transform, opacity and filter only; nothing here waits for an observer to be seen.

import { Pause, Play } from "lucide-react";
import { motion, useMotionValue, useScroll, useSpring, useTransform } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type PointerEvent, type ReactNode } from "react";
import { VoiceOrb } from "@/components/ui/voice-orb";
import { useDisplayPrefs, useMedia, useStill } from "@/lib/display-prefs";
import type { Lang } from "@/lib/lang";

/* ---- the still core: the orb as a drawing, and its two rings ---- */

// Plain markup, as strings: the hero renders it on the server, and the intro's inline script builds
// its own copy from the same strings before any other script has loaded (Intro.tsx). One source, so
// the core the intro shows and the core it opens onto are the same drawing in the same place.

// The geometry VoiceOrb draws (components/ui/voice-orb.tsx): a sphere of latitude lines tipped
// toward the viewer, radius 0.36 of the box, with the 48 ticks of the voice ring at 0.455.
const SPHERE = 36;
const TILT = 0.36;
const LINES = 18;
const round = (v: number) => Number(v.toFixed(2));

const SVG = 'fill="none" stroke="currentColor" aria-hidden="true" focusable="false"';

/** The orb before its canvas draws (first paint, no JavaScript, the intro): lines, rim and voice ring. */
export const ORB_STILL = (() => {
  let far = "";
  const near = ["", "", ""];
  for (let i = 0; i < LINES; i++) {
    const lat = -Math.PI / 2 + (Math.PI * (i + 1)) / (LINES + 1);
    const rx = round(SPHERE * Math.cos(lat));
    const ry = round(rx * Math.sin(TILT));
    const cy = round(-SPHERE * Math.sin(lat) * Math.cos(TILT));
    // Each latitude is an ellipse: its upper arc is the far side, its lower arc faces the viewer.
    far += `M${-rx} ${cy}A${rx} ${ry} 0 0 1 ${rx} ${cy}`;
    const facing = Math.cos(lat);
    near[facing > 0.82 ? 2 : facing > 0.5 ? 1 : 0] += `M${-rx} ${cy}A${rx} ${ry} 0 0 0 ${rx} ${cy}`;
  }
  return (
    `<svg class="lp-orb-still" viewBox="-50 -50 100 100" ${SVG} stroke-linecap="round">` +
    `<path d="${far}" stroke-opacity="0.13" stroke-width="0.36"/>` +
    `<path d="${near[0]}" stroke-opacity="0.4" stroke-width="0.42"/>` +
    `<path d="${near[1]}" stroke-opacity="0.64" stroke-width="0.5"/>` +
    `<path d="${near[2]}" stroke-opacity="0.92" stroke-width="0.58"/>` +
    `<circle r="37.3" stroke-opacity="0.3" stroke-width="0.5"/>` +
    `<circle r="46.2" stroke-opacity="0.36" stroke-width="1.4" stroke-linecap="butt" pathLength="48" stroke-dasharray="0.09 0.91" stroke-dashoffset="-0.455"/>` +
    `</svg>`
  );
})();

/** The outer ring: 72 fine ticks with a longer one every 30 degrees. It turns against the inner ring. */
export const TICK_RING =
  `<span class="lp-ring lp-ring-ticks"><svg viewBox="-100 -100 200 200" ${SVG}>` +
  `<circle r="97" stroke-opacity="0.3" stroke-width="3.2" pathLength="360" stroke-dasharray="0.28 4.72"/>` +
  `<circle r="95.9" stroke-opacity="0.55" stroke-width="5.4" pathLength="360" stroke-dasharray="0.36 29.64"/>` +
  `</svg></span>`;

/** The inner ring: a hairline circle, and one point of light travelling round it with a fading tail. */
export const ORBIT_RING =
  `<span class="lp-ring lp-ring-orbit"><span class="lp-ring-line"></span>` +
  `<span class="lp-orbit"><span class="lp-comet"></span><span class="lp-sat"></span></span></span>`;

/** The whole core, still: what the intro shows, in the place the hero's core takes. */
export const CORE = `<div class="lp-core">${TICK_RING}${ORBIT_RING}<span class="lp-orb">${ORB_STILL}</span></div>`;

/* ---- the clock in the corner ---- */

const subscribeMinute = (onChange: () => void) => {
  const id = window.setInterval(onChange, 10_000);
  return () => window.clearInterval(id);
};
/** Whole minutes since the epoch: the snapshot only changes when the clock face does. */
const minuteNow = () => Math.floor(Date.now() / 60_000);

function clockFace(minute: number, timeZone: string): string {
  try {
    // A fixed locale: the server and the browser must write the same digits for the same minute.
    return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone }).format(new Date(minute * 60_000));
  } catch {
    return "";
  }
}

/**
 * The time at the place, to the minute. The server writes the minute it rendered at (`minute`), so
 * the time is in the HTML; the browser then keeps it running from the device's own clock.
 */
export function PlaceTime({ timeZone, minute }: { timeZone: string; minute: number }) {
  const now = useSyncExternalStore(subscribeMinute, minuteNow, () => minute);
  const face = useMemo(() => clockFace(now, timeZone), [now, timeZone]);
  return (
    <time dateTime={new Date(now * 60_000).toISOString()} suppressHydrationWarning>
      {face}
    </time>
  );
}

/* ---- the pause button ---- */

/**
 * Stops and restarts everything that moves on the page (WCAG 2.2.2): the orb, the rings, the sky
 * and every scroll effect. It is the app's own Calm mode (lib/display-prefs.ts), so the choice is
 * kept for the app as well. Hidden when the system already asks for reduced motion.
 */
export function MotionSwitch({ pause, play }: { pause: string; play: string }) {
  const [prefs, setPrefs] = useDisplayPrefs();
  const reduced = useMedia("(prefers-reduced-motion: reduce)");
  if (reduced) return null;
  const Icon = prefs.calm ? Play : Pause;
  // The name says what a press does, so there is no pressed state to announce on top of it.
  const name = prefs.calm ? play : pause;
  return (
    <button type="button" onClick={() => setPrefs({ calm: !prefs.calm })} aria-label={name} title={name} className="press v6-chip size-11 shrink-0 justify-center p-0">
      <Icon aria-hidden className="size-4" />
    </button>
  );
}

/* ---- the hero ---- */

const never = () => () => {};
/** False on the server and while hydrating, true from the first render after. */
function useHydrated(): boolean {
  return useSyncExternalStore(
    never,
    () => true,
    () => false,
  );
}

/** The pointer is followed loosely: a soft spring, no overshoot. */
const POINTER = { stiffness: 90, damping: 20, mass: 0.6 } as const;
/** Scroll is followed closely: enough spring to take the steps out of a mouse wheel, no more. */
const SCROLL = { stiffness: 260, damping: 36, mass: 0.35 } as const;
/** How far each layer moves with the pointer, in px at the edge of the screen: nearer layers move more. */
const DEPTH = { orb: 7, orbit: 13, ticks: 21, copy: -5 } as const;
/** How long a pointer movement keeps the orb's ring up, in ms. */
const VOICE_FADE = 260;
// At rest. Given by name when motion is switched off on a page that was moving (the pause button,
// pressed part of the way down the hero): leaving a value out would leave its last state behind.
const REST_LAYER = { x: 0, y: 0, scale: 1 } as const;
const REST_CORE = { y: 0, opacity: 1 } as const;
const REST_COPY = { x: 0, y: 0, opacity: 1, filter: "none" } as const;
const REST_HINT = { opacity: 1 } as const;

interface HeroSceneProps {
  lang: Lang;
  /** The word under the scroll line. */
  hint: string;
  /** The four corner readings (Landing streams them in when the weather arrives). */
  hud?: ReactNode;
  /** The headline, the line under it and the buttons. */
  children: ReactNode;
}

export function HeroScene({ lang, hint, hud, children }: HeroSceneProps) {
  const root = useRef<HTMLElement>(null);
  const core = useRef<HTMLDivElement>(null);
  const hydrated = useHydrated();
  const still = useStill();
  const fine = useMedia("(hover: hover) and (pointer: fine)");
  const live = hydrated && !still;
  // Scrolled away: the rings rest (landing.css) and the live orb is not drawn, so one orb canvas
  // runs at a time (scene 01 of the story has its own).
  const [away, setAway] = useState(false);
  useEffect(() => {
    const el = root.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const seen = new IntersectionObserver(([entry]) => setAway(!entry.isIntersecting));
    seen.observe(el);
    return () => seen.disconnect();
  }, []);
  /** What a layer wears when nothing may move: nothing at all in the server's HTML, rest after it. */
  const rest = <T,>(style: T) => (hydrated ? style : undefined);

  // The way out: 0 with the hero at the top of the screen, 1 when it has scrolled away.
  const { scrollYProgress } = useScroll({ target: root, offset: ["start start", "end start"] });
  const p = useSpring(scrollYProgress, SCROLL);
  const copyY = useTransform(p, [0, 1], [0, -96]);
  const copyOpacity = useTransform(p, [0, 0.5], [1, 0]);
  const copyFilter = useTransform(p, (v) => (v < 0.02 ? "none" : `blur(${Math.min(8, v * 16).toFixed(2)}px)`));
  const coreY = useTransform(p, [0, 1], [0, 140]);
  const coreOpacity = useTransform(p, [0.3, 0.85], [1, 0]);
  const orbScale = useTransform(p, [0, 1], [1, 1.12]);
  const orbitScale = useTransform(p, [0, 1], [1, 1.4]);
  const ticksScale = useTransform(p, [0, 1], [1, 1.8]);
  const hintOpacity = useTransform(p, [0, 0.1], [1, 0]);

  // The pointer, as -1..1 across the hero. Each layer takes its own share of it.
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, POINTER);
  const sy = useSpring(my, POINTER);
  const orbX = useTransform(sx, (v) => v * DEPTH.orb);
  const orbY = useTransform(sy, (v) => v * DEPTH.orb);
  const orbitX = useTransform(sx, (v) => v * DEPTH.orbit);
  const orbitY = useTransform(sy, (v) => v * DEPTH.orbit);
  const ticksX = useTransform(sx, (v) => v * DEPTH.ticks);
  const ticksY = useTransform(sy, (v) => v * DEPTH.ticks);
  const copyX = useTransform(sx, (v) => v * DEPTH.copy);
  // The light under the mouse, in px from the hero's corner. It fades in on the first movement.
  const lx = useMotionValue(0);
  const ly = useMotionValue(0);
  const lit = useMotionValue(0);
  const spotX = useSpring(lx, POINTER);
  const spotY = useSpring(ly, POINTER);
  const spotOpacity = useSpring(lit, POINTER);

  // The orb hears the pointer: while it is inside the rings, its speed is the level the ring draws.
  const voice = useRef({ level: 0, at: 0, x: 0, y: 0, near: false });
  const [near, setNear] = useState(false);
  const level = useCallback(() => {
    const v = voice.current;
    return v.level * Math.exp(-Math.max(0, performance.now() - v.at) / VOICE_FADE);
  }, []);

  const follow = live && fine;
  const onPointerMove = (e: PointerEvent<HTMLElement>) => {
    if (!follow || e.pointerType !== "mouse") return;
    const box = e.currentTarget.getBoundingClientRect();
    mx.set(Math.min(1, Math.max(-1, ((e.clientX - box.left) / Math.max(1, box.width)) * 2 - 1)));
    my.set(Math.min(1, Math.max(-1, ((e.clientY - box.top) / Math.max(1, Math.min(box.height, window.innerHeight))) * 2 - 1)));
    // The first reading is a place, not a movement: the light starts under the mouse.
    if (lit.get() === 0) {
      spotX.jump(e.clientX - box.left);
      spotY.jump(e.clientY - box.top);
    }
    lx.set(e.clientX - box.left);
    ly.set(e.clientY - box.top);
    lit.set(1);
    const c = core.current?.getBoundingClientRect();
    if (!c) return;
    const v = voice.current;
    const inside = Math.hypot(e.clientX - (c.left + c.width / 2), e.clientY - (c.top + c.height / 2)) < c.width * 0.95;
    const dt = Math.max(8, e.timeStamp - v.at);
    const kept = v.level * Math.exp(-dt / VOICE_FADE);
    const heard = inside && v.at ? Math.min(1, Math.hypot(e.clientX - v.x, e.clientY - v.y) / dt / 1.4) : 0;
    voice.current = { level: Math.max(kept, heard), at: e.timeStamp, x: e.clientX, y: e.clientY, near: inside };
    if (inside !== v.near) setNear(inside);
  };
  const onPointerLeave = () => {
    mx.set(0);
    my.set(0);
    lit.set(0);
    if (voice.current.near) {
      voice.current.near = false;
      setNear(false);
    }
  };

  return (
    <section ref={root} aria-labelledby="hero-title" className="lp-hero" data-away={away || undefined} onPointerMove={onPointerMove} onPointerLeave={onPointerLeave}>
      {follow && <motion.div aria-hidden className="lp-spot" style={{ x: spotX, y: spotY, opacity: spotOpacity }} />}
      <motion.div ref={core} aria-hidden className="lp-core" style={live ? { y: coreY, opacity: coreOpacity } : rest(REST_CORE)}>
        <div className="lp-core-in">
          {/* The art is fixed markup (see the strings above): nothing in it for React to keep in step. */}
          <motion.div className="lp-layer" style={live ? { x: ticksX, y: ticksY, scale: ticksScale } : rest(REST_LAYER)} dangerouslySetInnerHTML={{ __html: TICK_RING }} suppressHydrationWarning />
          <motion.div className="lp-layer" style={live ? { x: orbitX, y: orbitY, scale: orbitScale } : rest(REST_LAYER)} dangerouslySetInnerHTML={{ __html: ORBIT_RING }} suppressHydrationWarning />
          <motion.div className="lp-layer" style={live ? { x: orbX, y: orbY, scale: orbScale } : rest(REST_LAYER)}>
            <span className="lp-orb" data-live={(hydrated && !away) || undefined}>
              <span dangerouslySetInnerHTML={{ __html: ORB_STILL }} suppressHydrationWarning />
              {hydrated && !away && (
                <VoiceOrb aria-hidden className="lp-orb-live" state={near && follow ? "listening" : "idle"} level={level} size={220} lang={lang} style={{ width: "100%", height: "100%" }} />
              )}
            </span>
          </motion.div>
        </div>
      </motion.div>

      <motion.div className="lp-copy" style={live ? { x: fine ? copyX : 0, y: copyY, opacity: copyOpacity, filter: fine ? copyFilter : "none" } : rest(REST_COPY)}>
        {children}
      </motion.div>

      {hud}

      <motion.p aria-hidden className="lp-hint" style={live ? { opacity: hintOpacity } : rest(REST_HINT)}>
        <span className="lp-hint-word">{hint}</span>
        <span className="lp-hint-line" />
      </motion.p>
    </section>
  );
}
