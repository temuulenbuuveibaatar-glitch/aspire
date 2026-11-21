"use client";

// The close of the opening page: an orange haze rising from the foot, one line, the button, and the
// wordmark set as wide as the screen. As the section scrolls in, the haze comes up and the six
// letters rise out of their masks one after another, each tied to the scroll position through a
// spring. The button leans toward a mouse that comes near it and springs back when it leaves.
//
// The server renders the haze, the letters in place and the button at rest, so without JavaScript,
// under reduced motion and in Calm mode everything is simply there. Transform and opacity only.
//
// Also here: the footer's stamp (the device's own date, time and UTC offset), which only the
// browser can write.

import { ArrowUpRight } from "lucide-react";
import { motion, useMotionValue, useMotionValueEvent, useScroll, useSpring, useTransform, type MotionValue } from "motion/react";
import { useEffect, useMemo, useRef, useSyncExternalStore, type PointerEvent, type ReactNode } from "react";
import { useMedia, useStill } from "@/lib/display-prefs";

const LETTERS = ["A", "S", "P", "I", "R", "E"];
/** Each letter starts this much later than the one before it, as a share of the section's scroll. */
const STEP = 0.09;
const FIRST = 0.2;
const RISE = 0.35;
/** From this share of the section's scroll on, the first letter is well up and the bar's wordmark gives way. */
const END_AT = 0.4;

const never = () => () => {};
/** Marks the page's root while the giant wordmark is up (landing.css reads the mark). */
const markEnd = (section: HTMLElement | null, on: boolean) => {
  section?.closest(".lp-root")?.toggleAttribute("data-end", on);
};

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
  // The haze comes up from under the foot of the section as it is scrolled in.
  const hazeY = useTransform(progress, [0, 1], ["42%", "0%"]);
  const hazeOpacity = useTransform(progress, [0.05, 0.9], [0, 1]);
  // While the giant wordmark is coming up, the page's root is marked: the small wordmark in the
  // bar then steps aside (landing.css), so the name is on the screen once.
  useMotionValueEvent(progress, "change", (p) => markEnd(root.current, p > END_AT));
  useEffect(() => {
    const section = root.current;
    markEnd(section, progress.get() > END_AT);
    return () => markEnd(section, false);
  }, [progress]);

  return (
    <section ref={root} aria-labelledby="end-title" className="lp-end">
      <motion.div aria-hidden className="lp-haze" style={mode === "live" ? { y: hazeY, opacity: hazeOpacity } : mode === "rest" ? { y: "0%", opacity: 1 } : undefined} />
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

/* ---- the footer's stamp ---- */

const subscribeMinute = (onChange: () => void) => {
  const id = window.setInterval(onChange, 10_000);
  return () => window.clearInterval(id);
};
/** Whole minutes since the epoch: the snapshot only changes when the stamp does. */
const minuteNow = () => Math.floor(Date.now() / 60_000);
const noMinute = () => null;
const two = (n: number) => String(n).padStart(2, "0");

/**
 * A clock's distance from UTC, from its minutes east of it: "UTC+8", "UTC+5:30", plain "UTC" at
 * zero, and west of it a real minus sign (U+2212), like the temperatures.
 */
export function utcLabel(eastMinutes: number): string {
  const east = Number.isFinite(eastMinutes) ? Math.round(eastMinutes) : 0;
  if (east === 0) return "UTC";
  const hours = Math.floor(Math.abs(east) / 60);
  const rest = Math.abs(east) % 60;
  return `UTC${east < 0 ? "−" : "+"}${hours}${rest ? `:${two(rest)}` : ""}`;
}

/** The date, the time and the UTC offset on this device, as plain figures every language reads. */
function stampOf(minute: number): { iso: string; date: string; time: string; zone: string } {
  const d = new Date(minute * 60_000);
  return {
    iso: d.toISOString(),
    date: `${d.getFullYear()}.${two(d.getMonth() + 1)}.${two(d.getDate())}`,
    time: `${two(d.getHours())}:${two(d.getMinutes())}`,
    // getTimezoneOffset counts minutes west of UTC.
    zone: utcLabel(-d.getTimezoneOffset()),
  };
}

/**
 * The stamp in the footer: the date, the time and the UTC offset of the device the page is open on.
 * The server cannot know any of the three, so it writes an empty line and the browser fills it in
 * after hydration: the two can never disagree. No JavaScript: the line stays empty.
 */
export function Stamp() {
  const minute = useSyncExternalStore(subscribeMinute, minuteNow, noMinute);
  const stamp = useMemo(() => (minute === null ? null : stampOf(minute)), [minute]);
  return (
    <p className="lp-stamp">
      {stamp && (
        <time dateTime={stamp.iso}>
          {stamp.date}{" "}
          {/* Left out where the bar already shows a running clock (landing.css). */}
          <span className="lp-stamp-time">
            <span aria-hidden>·</span> {stamp.time}{" "}
          </span>
          <span aria-hidden>·</span> {stamp.zone}
        </time>
      )}
    </p>
  );
}
