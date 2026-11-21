"use client";

// What every scene of the scroll story is built from: the section that turns into a tall strip
// with a pinned full-screen stage, its scroll progress, and the head (index numeral, label,
// progress rule, giant title, one line).
//
// Three numbers drive a scene, each 0 to 1: `enter` while its stage scrolls in, `pin` while the
// stage is pinned, `exit` while it scrolls away. Without motion they rest at 1, 1 and 0: fully in,
// played to the end, nothing leaving. So the very same markup is the still page (the server's HTML,
// reduced motion, a short screen), and there is no second layout to keep in step. The scroll
// listeners are only mounted while the story is live.
//
// Every moving part stays bound to these numbers in both modes (at rest each one works out to "no
// transform, fully opaque"). Nothing is ever unbound, so switching to the still page mid-scroll
// (Calm mode, a rotated phone) cannot leave an element stuck half way.
//
// How tall a scene is lives in CSS alone (--st-k-s and --st-k-l, story.css): the three numbers are
// measured from the section itself, so script never needs to know.

import { cubicBezier, motion, useScroll, useSpring, useTransform, type MotionValue } from "motion/react";
import { useContext, useEffect, useRef, type CSSProperties, type ReactNode, type RefObject } from "react";
import { cn } from "@/lib/utils";
import { ModeContext } from "./mode";

/** Arriving: quick off the mark, a long soft landing. */
export const EASE_OUT = cubicBezier(0.22, 1, 0.36, 1);
/** Scroll is followed closely: enough spring to take the steps out of a mouse wheel, no bounce. The hero's values. */
export const SCROLL_SPRING = { stiffness: 260, damping: 36, mass: 0.35 } as const;

const two = (n: number) => String(n).padStart(2, "0");

export interface SceneProgress {
  /** 0..1 while the stage scrolls in. At rest: 1. */
  enter: MotionValue<number>;
  /** 0..1 while the stage is pinned. At rest: 1. */
  pin: MotionValue<number>;
  /** 0..1 while the stage scrolls away. At rest: 0. */
  exit: MotionValue<number>;
}

export function useSceneProgress(): SceneProgress {
  const enter = useSpring(1, SCROLL_SPRING);
  const pin = useSpring(1, SCROLL_SPRING);
  const exit = useSpring(0, SCROLL_SPRING);
  return { enter, pin, exit };
}

/**
 * Makes `to` follow the scroll value `from`, and puts it back to `rest` when it stops following.
 * The first reading is a position, not a movement, so it is taken at once. After that a mouse
 * wheel's steps are smoothed by the spring; touch scrolling is already smooth and is followed directly.
 */
function follow(from: MotionValue<number>, to: MotionValue<number>, rest: number, smooth: boolean, onChange: () => void): () => void {
  let first = true;
  to.jump(from.get());
  const stopFrom = from.on("change", (v) => {
    if (first || !smooth) to.jump(v);
    else to.set(v);
    first = false;
  });
  const stopTo = to.on("change", onChange);
  return () => {
    stopFrom();
    stopTo();
    to.jump(rest);
  };
}

/**
 * Feeds the scroll position into a scene. Mounted only while the story is live, so a still page
 * has no scroll listener at all. It also marks the section while its stage is on screen
 * (data-active): layers are promoted only then (story.css), never for the whole page at once.
 */
function SceneLink({ target, scene, smooth }: { target: RefObject<HTMLElement | null>; scene: SceneProgress; smooth: boolean }) {
  const { enter, pin, exit } = scene;
  const arriving = useScroll({ target, offset: ["start end", "start start"] }).scrollYProgress;
  const pinned = useScroll({ target, offset: ["start start", "end end"] }).scrollYProgress;
  const leaving = useScroll({ target, offset: ["end end", "end start"] }).scrollYProgress;
  useEffect(() => {
    const mark = () => target.current?.toggleAttribute("data-active", enter.get() > 0.001 && exit.get() < 0.999);
    const stops = [follow(arriving, enter, 1, smooth, mark), follow(pinned, pin, 1, smooth, mark), follow(leaving, exit, 0, smooth, mark)];
    const section = target.current;
    return () => {
      for (const stop of stops) stop();
      section?.removeAttribute("data-active");
    };
  }, [target, arriving, pinned, leaving, enter, pin, exit, smooth]);
  return null;
}

const nothing = () => {};

/** The scroll offsets useScroll takes, e.g. ["start end", "end start"]. */
type Offsets = NonNullable<NonNullable<Parameters<typeof useScroll>[0]>["offset"]>;

/**
 * The same feed for a part that is not a pinned scene (the marquee, the feature index): `into`
 * follows the scroll progress of `target` between two offsets while this is mounted, and goes back
 * to `rest` when it is not.
 */
export function ScrollFeed({ target, offset, into, rest, smooth }: { target: RefObject<HTMLElement | null>; offset: Offsets; into: MotionValue<number>; rest: number; smooth: boolean }) {
  const { scrollYProgress } = useScroll({ target, offset });
  useEffect(() => follow(scrollYProgress, into, rest, smooth, nothing), [scrollYProgress, into, rest, smooth]);
  return null;
}

interface SceneFrameProps {
  id: string;
  scene: SceneProgress;
  /** Screens the section is tall while live: on phones, and from 768 px. */
  tall: readonly [number, number];
  className?: string;
  children: ReactNode;
}

/** One scene: a plain section, or (live) a tall strip whose stage stays on screen while it is scrolled through. */
export function SceneFrame({ id, scene, tall, className, children }: SceneFrameProps) {
  const mode = useContext(ModeContext);
  // The tall section: what the scroll progress is measured against.
  const target = useRef<HTMLElement>(null);
  // The way out is quieter than the way in: the stage dims and settles back a little as it leaves.
  const dim = useTransform(scene.exit, [0, 1], [1, 0.3]);
  const settle = useTransform(scene.exit, [0, 1], [1, 0.965]);
  return (
    <section
      ref={target}
      id={`story-${id}`}
      data-scene={id}
      data-live={mode.live || undefined}
      aria-labelledby={`story-${id}-title`}
      className={cn("st-scene", className)}
      style={{ "--st-k-s": tall[0], "--st-k-l": tall[1] } as CSSProperties}
    >
      {mode.live && <SceneLink target={target} scene={scene} smooth={mode.rich} />}
      <div className="st-stage">
        <motion.div className="st-inner" style={mode.rich ? { opacity: dim, scale: settle } : { opacity: 1, scale: 1 }}>
          {children}
        </motion.div>
      </div>
    </section>
  );
}

/** The band on top of a stage: the index numeral, the label, and a rule that fills as the pin is used up. */
export function SceneBar({ n, label, scene }: { n: number; label: string; scene: SceneProgress }) {
  const mode = useContext(ModeContext);
  const rise = useTransform(scene.enter, [0.2, 0.78], ["70%", "0%"], { ease: EASE_OUT });
  const numeral = useTransform(scene.enter, [0.2, 0.6], [0, 1]);
  const words = useTransform(scene.enter, [0.42, 0.88], [0, 1]);
  const draw = useTransform(scene.enter, [0.35, 1], [0, 1], { ease: EASE_OUT });
  // Without a mouse the bar is simply there (given by name, so nothing is left where a scroll put it).
  const rich = mode.rich;
  return (
    <div className="st-bar">
      <span className="st-mask" aria-hidden>
        <motion.span className="st-num numeral" style={rich ? { y: rise, opacity: numeral } : { y: "0%", opacity: 1 }}>
          {two(n)}
        </motion.span>
      </span>
      <motion.p className="st-label v6-on-photo" style={{ opacity: rich ? words : 1 }}>
        <span className="sr-only">{two(n)} </span>
        {label}
      </motion.p>
      <motion.span aria-hidden className="st-rule" style={{ scaleX: rich ? draw : 1 }}>
        {/* How much of this scene is left: a pinned page would otherwise feel stuck. */}
        <motion.span className="st-rule-fill" style={{ scaleX: mode.live ? scene.pin : 0 }} />
      </motion.span>
    </div>
  );
}

/** One line of a giant title, rising out of its mask as the stage scrolls in. */
function TitleRow({ index, enter, children }: { index: number; enter: MotionValue<number>; children: string }) {
  const y = useTransform(enter, [0.32 + index * 0.13, Math.min(1, 0.84 + index * 0.08)], ["112%", "0%"], { ease: EASE_OUT });
  return (
    <span className="st-mask">
      <motion.span className="st-row" style={{ y }}>
        {children}
      </motion.span>{" "}
    </span>
  );
}

/** The scene's heading: giant type, one mask per line. */
export function SceneTitle({ id, rows, scene, className }: { id: string; rows: string[]; scene: SceneProgress; className?: string }) {
  return (
    <h2 id={`story-${id}-title`} className={cn("st-title v6-on-photo", className)}>
      {rows.map((row, i) => (
        <TitleRow key={row} index={i} enter={scene.enter}>
          {row}
        </TitleRow>
      ))}
    </h2>
  );
}

/** The one short line under a title. */
export function SceneLine({ scene, className, children }: { scene: SceneProgress; className?: string; children: ReactNode }) {
  const { rich } = useContext(ModeContext);
  const opacity = useTransform(scene.enter, [0.62, 1], [0, 1]);
  const y = useTransform(scene.enter, [0.62, 1], [18, 0], { ease: EASE_OUT });
  return (
    <motion.p className={cn("st-line v6-on-photo", className)} style={rich ? { opacity, y } : { opacity: 1, y: 0 }}>
      {children}
    </motion.p>
  );
}

/** A block that arrives with the stage: it fades up and settles over the last part of the way in. */
export function SceneArrive({ scene, from = 0.5, className, children }: { scene: SceneProgress; from?: number; className?: string; children: ReactNode }) {
  const opacity = useTransform(scene.enter, [from, Math.min(1, from + 0.35)], [0, 1]);
  const y = useTransform(scene.enter, [from, 1], [36, 0], { ease: EASE_OUT });
  return (
    <motion.div className={className} style={{ opacity, y }}>
      {children}
    </motion.div>
  );
}
