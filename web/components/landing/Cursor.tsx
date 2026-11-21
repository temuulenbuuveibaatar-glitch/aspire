"use client";

// A small crosshair that trails the mouse over the opening page and opens into four corner brackets
// over anything that can be pressed (landing.css .lp-cursor). Decoration only: the system's arrow
// stays, nothing depends on the mark, and it is not rendered at all for touch, reduced motion or
// Calm mode.

import { motion, useMotionValue, useSpring } from "motion/react";
import { useEffect, useState } from "react";
import { useMedia, useStill } from "@/lib/display-prefs";

/** The mark lags the arrow a little, with no overshoot. */
const TRAIL = { stiffness: 520, damping: 40, mass: 0.45 } as const;
const PRESSABLE = "a, button, summary, [role='button']";

type State = "off" | "on" | "over";

export function Cursor() {
  const fine = useMedia("(hover: hover) and (pointer: fine)");
  const still = useStill();
  const on = fine && !still;
  const x = useMotionValue(-100);
  const y = useMotionValue(-100);
  const sx = useSpring(x, TRAIL);
  const sy = useSpring(y, TRAIL);
  const [state, setState] = useState<State>("off");

  useEffect(() => {
    if (!on) return;
    let seen = false;
    const move = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      x.set(e.clientX);
      y.set(e.clientY);
      // The first position is a place, not a movement: the mark starts there instead of flying in.
      if (!seen) {
        seen = true;
        sx.jump(e.clientX);
        sy.jump(e.clientY);
      }
      setState(e.target instanceof Element && e.target.closest(PRESSABLE) ? "over" : "on");
    };
    const leave = () => {
      seen = false;
      setState("off");
    };
    window.addEventListener("pointermove", move, { passive: true });
    document.documentElement.addEventListener("pointerleave", leave);
    return () => {
      window.removeEventListener("pointermove", move);
      document.documentElement.removeEventListener("pointerleave", leave);
      setState("off");
    };
  }, [on, x, y, sx, sy]);

  if (!on) return null;
  return (
    <motion.div aria-hidden className="lp-cursor" data-state={state} style={{ x: sx, y: sy }}>
      <span className="lp-cursor-cross" />
      <span className="lp-cursor-box" />
    </motion.div>
  );
}
