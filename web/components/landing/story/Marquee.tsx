"use client";

// The marquee: cities where Aspire has a public street camera source (copy.ts lists which source
// for which city), in huge outlined type. Two rows that travel in opposite directions.
//
// It moves only with the page: each row's position is the scroll position, so its speed is the
// scroll speed, it stops the moment the scrolling does, and nothing here loops on its own (no
// motion to pause). With a mouse the letters also lean into the scroll, by its velocity.
// Without motion the same names are a wrapped list.

import { motion, useMotionValueEvent, useSpring, useTransform, useVelocity, type MotionValue } from "motion/react";
import { useRef } from "react";
import type { Lang } from "@/lib/lang";
import { storyCopy } from "./copy";
import { useStoryMode } from "./mode";
import { SCROLL_SPRING, ScrollFeed } from "./scene";

/** Where a row starts and ends while the section crosses the screen, in percent of the row's own length. */
const TRAVEL: readonly [number, number] = [-3, -25];
/** Degrees of lean per unit of scroll velocity (section crossings per second), and the most it leans. */
const LEAN = 5;
const MAX_LEAN = 7;
const LEAN_SPRING = { stiffness: 180, damping: 28, mass: 0.4 } as const;

function Row({ names, home, moving, reverse, progress, lean }: { names: string[]; home: string | null; moving: boolean; reverse: boolean; progress: MotionValue<number>; lean: MotionValue<number> }) {
  const [from, to] = reverse ? [TRAVEL[1], TRAVEL[0]] : TRAVEL;
  // Still: the row is a wrapped list and stays where it is.
  const x = useTransform(progress, (p) => (moving ? `${(from + (to - from) * p).toFixed(3)}%` : "0%"));
  return (
    <motion.ul className="st-mq-track" style={{ x, skewX: lean }}>
      {names.map((name) => (
        <li key={name} className="st-mq-item" data-home={name === home || undefined}>
          {name}
        </li>
      ))}
      {/* A second run of the same names keeps the row longer than its travel. Decoration: it is not in the server's HTML. */}
      {moving &&
        names.map((name) => (
          <li key={`${name} again`} aria-hidden className="st-mq-item">
            {name}
          </li>
        ))}
    </motion.ul>
  );
}

export function CityMarquee({ lang }: { lang: Lang }) {
  const mode = useStoryMode();
  const c = storyCopy(lang).marquee;
  const root = useRef<HTMLElement>(null);
  // 0 as the section's top reaches the bottom of the screen, 1 as its bottom leaves the top.
  const progress = useSpring(0.5, SCROLL_SPRING);
  // On screen right now: the two long rows are promoted to their own layers only then (story.css).
  useMotionValueEvent(progress, "change", (p) => root.current?.toggleAttribute("data-active", p > 0.001 && p < 0.999));
  const velocity = useVelocity(progress);
  const rich = mode.rich;
  const tilt = useTransform(velocity, (v) => (rich ? Math.max(-MAX_LEAN, Math.min(MAX_LEAN, v * LEAN)) : 0));
  const lean = useSpring(tilt, LEAN_SPRING);
  const half = Math.ceil(c.cities.length / 2);
  const home = c.cities[0] ?? null;
  const first = c.cities.slice(0, half);
  // A moving row starts a little off the left edge and travels further left, so its first name is
  // never seen: the home city, the one name filled in, then stands third, well inside the screen.
  const lead = mode.moving && first.length > 2 ? [...first.slice(1, 3), first[0], ...first.slice(3)] : first;
  return (
    <section ref={root} aria-labelledby="story-cities-label" className="st-mq" data-live={mode.moving || undefined}>
      {mode.moving && <ScrollFeed target={root} offset={["start end", "end start"]} into={progress} rest={0.5} smooth={mode.rich} />}
      <p id="story-cities-label" className="st-mq-label readout v6-on-photo">
        {c.label}
      </p>
      <div className="st-mq-rows">
        <Row names={lead} home={home} moving={mode.moving} reverse={false} progress={progress} lean={lean} />
        <Row names={c.cities.slice(half)} home={null} moving={mode.moving} reverse progress={progress} lean={lean} />
      </div>
      <p className="st-mq-note v6-on-photo">{c.note}</p>
    </section>
  );
}
