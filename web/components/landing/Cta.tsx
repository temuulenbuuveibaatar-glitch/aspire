"use client";

// The close of the opening page: one line, the button, and the wordmark set as wide as the screen.
// As the section scrolls in, the six letters rise out of their masks one after another, each tied
// to the scroll position through a spring. The button leans toward a mouse that comes near it and
// springs back when it leaves.
//
// The server renders the letters in place and the button at rest, so without JavaScript, under
// reduced motion and in Calm mode everything is simply there. Transform only.

import { ArrowUpRight } from "lucide-react";
import { motion, useMotionValue, useScroll, useSpring, useTransform, type MotionValue } from "motion/react";
import { useRef, useSyncExternalStore, type PointerEvent, type ReactNode } from "react";
import { useMedia, useStill } from "@/lib/display-prefs";

const LETTERS = ["A", "S", "P", "I", "R", "E"];
/** Each letter starts this much later than the one before it, as a share of the section's scroll. */
const STEP = 0.09;
const FIRST = 0.2;
const RISE = 0.35;

const never = () => () => {};

/** `mode`: "live" follows the scroll; "rest" is in place (motion switched off); "html" is the server's markup. */
type Mode = "live" | "rest" | "html";

function Letter({ ch, index, progress, mode }: { ch: string; index: number; progress: MotionValue<number>; mode: Mode }) {
  const from = FIRST + index * STEP;
  const y = useTransform(progress, [from, from + RISE], ["104%", "0%"]);
  return (
    <span className="lp-mark-letter">
      {/* At rest the value is given by name: leaving it out would keep wherever the scroll had put it. */}
      <motion.span style={mode === "live" ? { y } : mode === "rest" ? { y: "0%" } : undefined}>{ch}</motion.span>
    </span>
  );
}

/** A zone a little larger than its child: inside it, the child follows the mouse by a quarter of the way. */
function Magnetic({ on, children }: { on: boolean; children: ReactNode }) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  // A light spring with a little give: the one place on the page that may overshoot.
  const sx = useSpring(x, { stiffness: 190, damping: 14, mass: 0.45 });
  const sy = useSpring(y, { stiffness: 190, damping: 14, mass: 0.45 });
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!on || e.pointerType !== "mouse") return;
    const box = e.currentTarget.getBoundingClientRect();
    x.set((e.clientX - (box.left + box.width / 2)) * 0.26);
    y.set((e.clientY - (box.top + box.height / 2)) * 0.26);
  };
  const onPointerLeave = () => {
    x.set(0);
    y.set(0);
  };
  return (
    <div className="lp-magnet" onPointerMove={onPointerMove} onPointerLeave={onPointerLeave}>
      <motion.div style={on ? { x: sx, y: sy } : undefined}>{children}</motion.div>
    </div>
  );
}

export function Cta({ label, line, cta }: { label: string; line: string; cta: string }) {
  const root = useRef<HTMLElement>(null);
  const hydrated = useSyncExternalStore(
    never,
    () => true,
    () => false,
  );
  const still = useStill();
  const fine = useMedia("(hover: hover) and (pointer: fine)");
  const live = hydrated && !still;
  const mode: Mode = live ? "live" : hydrated ? "rest" : "html";
  // 0 when the section's top reaches the bottom of the screen, 1 when its own bottom does.
  const { scrollYProgress } = useScroll({ target: root, offset: ["start end", "end end"] });
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 24, mass: 0.5 });

  return (
    <section ref={root} aria-labelledby="end-title" className="lp-end">
      <div className="lp-wrap lp-end-top">
        <p className="lp-label">{label}</p>
        <h2 id="end-title" className="lp-end-line">
          {line}
        </h2>
        <Magnetic on={live && fine}>
          <a href="/login" data-on-accent className="press lp-end-button">
            <span>{cta}</span>
            <span aria-hidden className="lp-end-arrow">
              <ArrowUpRight />
            </span>
          </a>
        </Magnetic>
      </div>
      <p aria-hidden className="lp-mark">
        {LETTERS.map((ch, i) => (
          <Letter key={ch} ch={ch} index={i} progress={progress} mode={mode} />
        ))}
      </p>
    </section>
  );
}
