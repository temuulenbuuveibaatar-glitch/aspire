"use client";

// Scene 03, Real weather: the page's own sky is the picture. While the stage is pinned the scene
// asks the page for a clear sky, then rain, then snow (sky-store.ts, drawn by the one sky layer
// behind the page at the visitor's own hour), and before it lets go it hands the page back its
// real sky. The stage itself only names what is overhead, in outlined type the weather shows through.
//
// The three demonstration skies carry the Example label. The last step shows the visitor's own
// reading (place, temperature, sky, source) when there is one, and nothing invented when there is not.
// Without motion nothing is ever asked of the page: the scene lists the three skies and the reading.

import { motion, useMotionValueEvent, useTransform, type MotionValue } from "motion/react";
import { createElement, Suspense, use, useContext, useEffect, useId, type CSSProperties } from "react";
import { skyIcon } from "@/components/v6/HourlyStrip";
import { textFor, type V6Text } from "@/components/v6/text";
import type { Lang } from "@/lib/lang";
import { temp } from "@/lib/utils";
import { setSkyOverride } from "../sky-store";
import { placeName, type ReadingPromise, SourceLine } from "./cards";
import { storyCopy, type StoryCopy } from "./copy";
import { fadeStops, fadeValues, SKY_DEMO, SKY_STARTS, skyStep } from "./math";
import { ModeContext } from "./mode";
import { SceneBar, SceneFrame, SceneLine, SceneTitle, useSceneProgress } from "./scene";
import { Tag } from "./Tag";

const FADE = 0.035;
const YOURS = SKY_DEMO.length;

/** Opacity, rise and (with a mouse) blur for step `i`: it trades places with its neighbours as the pin moves on. */
function useStep(pin: MotionValue<number>, i: number, rich: boolean) {
  const at = fadeStops(SKY_STARTS, i, FADE);
  const opacity = useTransform(pin, at, fadeValues(SKY_STARTS, i, 0, 1, 0));
  // In from below, out upward by less: the way out is the quieter one.
  const y = useTransform(pin, at, fadeValues(SKY_STARTS, i, "18%", "0%", "-7%"));
  const blur = useTransform(pin, at, fadeValues(SKY_STARTS, i, 8, 0, 6));
  const filter = useTransform(blur, (b) => (rich && b > 0.05 ? `blur(${b.toFixed(1)}px)` : "none"));
  return { opacity, y, filter };
}

/** A word that would overflow the stage at full size is set smaller (a long place name). */
const fit = (word: string): CSSProperties => ({ "--st-fit": word.length <= 7 ? 1 : word.length <= 11 ? 0.62 : word.length <= 16 ? 0.44 : 0.32 }) as CSSProperties;

/**
 * A word as an outline only, so the sky behind the page shows through the letters. Drawn through a
 * mask (white stroke, black fill painted over it): a plain text stroke would also trace the
 * overlapping shapes inside each letter of a variable font, and this keeps just the outer edge.
 */
function Outline({ children }: { children: string }) {
  const id = useId();
  return (
    <svg className="st-outline" focusable="false">
      {/* The mask reaches past the box, for the feet of letters like the Cyrillic Д. */}
      <mask id={id} maskUnits="userSpaceOnUse" x="-2%" y="-10%" width="104%" height="130%">
        <text x="0.03em" y="0.8em" fill="#000" stroke="#fff" strokeLinejoin="round" paintOrder="stroke">
          {children}
        </text>
      </mask>
      <rect x="-2%" y="-10%" width="104%" height="130%" fill="currentColor" mask={`url(#${id})`} />
    </svg>
  );
}

function Word({ pin, i, rich, children }: { pin: MotionValue<number>; i: number; rich: boolean; children: string }) {
  const style = useStep(pin, i, rich);
  return (
    <motion.div className="st-word" style={{ ...style, ...fit(children) }}>
      <Outline>{children}</Outline>
    </motion.div>
  );
}

/** The fourth word: the visitor's own place when the reading is real, else just "Now". */
function YoursWord({ pin, rich, reading, c, v }: { pin: MotionValue<number>; rich: boolean; reading: ReadingPromise; c: StoryCopy; v: V6Text }) {
  const r = reading ? use(reading) : null;
  return (
    <Word pin={pin} i={YOURS} rich={rich}>
      {r && r.current ? placeName(r, c) : v.now}
    </Word>
  );
}

/** "Erdenet · −12°C · Snow" with its source line: the reading behind the page's sky, only when it is real. */
function Yours({ reading, c, v }: { reading: ReadingPromise; c: StoryCopy; v: V6Text }) {
  const r = reading ? use(reading) : null;
  if (!r || !r.current) return null;
  return (
    <div data-yours className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <p className="v6-on-photo flex flex-wrap items-center gap-x-2 text-copy text-ink">
        {createElement(skyIcon(r.kind, r.isDay), { "aria-hidden": true, className: "size-4 shrink-0" })}
        <span className="font-semibold">{placeName(r, c)}</span> <span aria-hidden>·</span>{" "}
        <data value={r.tempC} className="num">
          {temp(r.tempC, false)}
        </data>{" "}
        <span aria-hidden>·</span> <span>{v.kinds[r.kind]}</span>
      </p>
      <SourceLine v={v} className="v6-on-photo text-copy text-ink" />
    </div>
  );
}

function Step({ pin, i, children }: { pin: MotionValue<number>; i: number; children: string }) {
  const opacity = useTransform(pin, fadeStops(SKY_STARTS, i, FADE), fadeValues(SKY_STARTS, i, 0.42, 1, 0.42));
  return (
    <motion.li className="st-step v6-on-photo" style={{ opacity }}>
      <span aria-hidden className="st-step-dot" />
      {/* The giant word under the dots says it by sight; said twice it would only repeat itself. */}
      <span className="sr-only">{children}</span>
    </motion.li>
  );
}

/** Live: one sky named at a time, in step with what the page draws behind the stage. */
function Reel({ pin, rich, reading, c, v }: { pin: MotionValue<number>; rich: boolean; reading: ReadingPromise; c: StoryCopy; v: V6Text }) {
  const last = fadeStops(SKY_STARTS, YOURS, FADE);
  const demo = useTransform(pin, last, [1, 0]);
  const real = useTransform(pin, last, [0, 1]);
  return (
    <div className="st-reel">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <ul className="st-steps">
          {SKY_DEMO.map((kind, i) => (
            <Step key={kind} pin={pin} i={i}>
              {v.kinds[kind]}
            </Step>
          ))}
          <Step pin={pin} i={YOURS}>
            {c.weather.yours}
          </Step>
        </ul>
        <motion.span style={{ opacity: demo }}>
          <Tag>{c.example}</Tag>
        </motion.span>
      </div>
      <div className="st-words" aria-hidden>
        {SKY_DEMO.map((kind, i) => (
          <Word key={kind} pin={pin} i={i} rich={rich}>
            {v.kinds[kind]}
          </Word>
        ))}
        <Suspense
          fallback={
            <Word pin={pin} i={YOURS} rich={rich}>
              {v.now}
            </Word>
          }
        >
          <YoursWord pin={pin} rich={rich} reading={reading} c={c} v={v} />
        </Suspense>
      </div>
      <motion.div className="min-h-6" style={{ opacity: real }}>
        <Suspense fallback={null}>
          <Yours reading={reading} c={c} v={v} />
        </Suspense>
      </motion.div>
    </div>
  );
}

/** Still: the three skies the app draws, as a legend, and the visitor's own reading under them. */
function Legend({ reading, c, v }: { reading: ReadingPromise; c: StoryCopy; v: V6Text }) {
  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-wrap gap-2">
        {SKY_DEMO.map((kind) => (
          <li key={kind} className="v6-chip min-h-11 gap-2 px-3.5 text-copy">
            {createElement(skyIcon(kind), { "aria-hidden": true, className: "size-5 shrink-0 text-accent" })}
            {v.kinds[kind]}
          </li>
        ))}
      </ul>
      <Suspense fallback={null}>
        <Yours reading={reading} c={c} v={v} />
      </Suspense>
    </div>
  );
}

export function SceneWeather({ lang, reading }: { lang: Lang; reading: ReadingPromise }) {
  const mode = useContext(ModeContext);
  const scene = useSceneProgress();
  const c = storyCopy(lang);
  const v = textFor(lang);

  // Which sky the page should draw: a number that only changes when the answer does.
  const { enter, pin, exit } = scene;
  const step = useTransform(() => skyStep(enter.get(), pin.get(), exit.get()));
  useMotionValueEvent(step, "change", (s) => setSkyOverride(SKY_DEMO[s] ?? null));
  // Whatever happens to this scene, the page gets its own sky back.
  useEffect(() => () => setSkyOverride(null), []);

  return (
    <SceneFrame id="weather" scene={scene} tall={[2, 2.5]}>
      <SceneBar n={3} label={c.weather.label} scene={scene} />
      <div className="grid min-h-0 flex-1 content-between gap-6">
        <div className="min-w-0">
          <SceneTitle id="weather" rows={c.weather.title} scene={scene} />
          <SceneLine scene={scene} className="mt-3 max-w-[42rem] sm:mt-6">
            {c.weather.line}
            {/* Only true while scrolling does change the sky. Chinese sets no space between sentences. */}
            {mode.live && (lang === "zh" ? c.weather.hint : ` ${c.weather.hint}`)}
          </SceneLine>
        </div>
        {mode.live ? <Reel pin={pin} rich={mode.rich} reading={reading} c={c} v={v} /> : <Legend reading={reading} c={c} v={v} />}
      </div>
    </SceneFrame>
  );
}
