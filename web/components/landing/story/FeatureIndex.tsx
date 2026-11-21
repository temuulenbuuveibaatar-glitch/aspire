"use client";

// The feature index: what Aspire does, as eight large numbered rows. Each row names something the
// code really does (copy.ts FEATURE_IDS): a number, a big title and one line.
//
// With a mouse a small picture of the row follows the pointer (previews.tsx), the row under it
// steps forward and the others fall back. As the list scrolls into view its rows rise one after
// another. None of this is needed to read it: the server's HTML is the finished list, and a page
// that may not move, or has no mouse, simply keeps it.

import { motion, useMotionValue, useSpring, useTransform, type MotionValue } from "motion/react";
import { useRef, useState, type PointerEvent } from "react";
import type { Lang } from "@/lib/lang";
import { FEATURE_IDS, storyCopy, type FeatureId, type FeatureRow } from "./copy";
import { useStoryMode } from "./mode";
import { FeaturePreview } from "./previews";
import { EASE_OUT, SCROLL_SPRING, ScrollFeed } from "./scene";

/** The picture trails the pointer loosely: a soft spring, no overshoot. */
const POINTER = { stiffness: 320, damping: 34, mass: 0.5 } as const;
/** The gap between the pointer and the picture, in px. */
const GAP = 28;
const two = (n: number) => String(n).padStart(2, "0");

function Row({ i, id, row, reveal, onEnter }: { i: number; id: FeatureId; row: FeatureRow; reveal: MotionValue<number>; onEnter?: (id: FeatureId) => void }) {
  const from = i * 0.085;
  const opacity = useTransform(reveal, [from, from + 0.3], [0, 1]);
  const y = useTransform(reveal, [from, from + 0.4], [44, 0], { ease: EASE_OUT });
  return (
    <motion.li data-row={id} className="st-ix-row" style={{ opacity, y }} onPointerEnter={onEnter && (() => onEnter(id))}>
      <span className="st-ix-num numeral">{two(i + 1)}</span> <h3 className="st-ix-title v6-on-photo">{row.title}</h3> <p className="st-ix-line v6-on-photo">{row.line}</p>
    </motion.li>
  );
}

export function FeatureList({ lang }: { lang: Lang }) {
  const mode = useStoryMode();
  const c = storyCopy(lang).index;
  const root = useRef<HTMLElement>(null);
  const preview = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<FeatureId | null>(null);
  // 0 as the list's top comes up from the bottom of the screen, 1 once it is well in. At rest: 1, all rows shown.
  const reveal = useSpring(1, SCROLL_SPRING);
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const x = useSpring(px, POINTER);
  const y = useSpring(py, POINTER);

  const pointer = mode.rich;
  const onPointerMove = (e: PointerEvent<HTMLElement>) => {
    if (!pointer || e.pointerType !== "mouse") return;
    const box = e.currentTarget.getBoundingClientRect();
    const card = preview.current;
    const w = card?.offsetWidth ?? 0;
    const h = card?.offsetHeight ?? 0;
    // Below and to the right of the pointer, so the row being read stays clear; never past the
    // right edge or the end of the list.
    px.set(Math.max(0, Math.min(e.clientX - box.left + GAP, box.width - w)));
    py.set(Math.max(0, Math.min(e.clientY - box.top + GAP, box.height - h)));
  };

  return (
    <section ref={root} aria-labelledby="story-index-title" className="st-ix" data-live={mode.moving || undefined} onPointerMove={onPointerMove} onPointerLeave={() => setActive(null)}>
      {mode.moving && <ScrollFeed target={root} offset={["start 92%", "start 18%"]} into={reveal} rest={1} smooth={mode.rich} />}
      <div className="st-ix-head">
        <h2 id="story-index-title" className="st-label v6-on-photo">
          {c.label}
        </h2>
        <span aria-hidden className="st-rule" />
        <span aria-hidden className="st-count numeral v6-on-photo">
          {two(FEATURE_IDS.length)}
        </span>
      </div>
      <ul className="st-ix-rows">
        {FEATURE_IDS.map((id, i) => (
          <Row key={id} i={i} id={id} row={c.rows[id]} reveal={reveal} onEnter={pointer ? setActive : undefined} />
        ))}
      </ul>
      {pointer && (
        <motion.div ref={preview} aria-hidden className="st-ix-preview" data-on={active !== null} style={{ x, y }}>
          <div className="st-ix-card hud">
            {FEATURE_IDS.map((id) => (
              <div key={id} className="st-ix-pic" data-on={active === id}>
                <FeaturePreview id={id} lang={lang} />
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </section>
  );
}
