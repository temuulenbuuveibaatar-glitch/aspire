"use client";

// Scene 003, Real weather: the page's own sky is the picture. While the stage is pinned the scene
// asks the page for a clear sky, then rain, then snow (sky-store.ts, drawn by the one sky layer
// behind the page), and before it lets go it hands the page back its real sky. The stage itself
// only names what is overhead, in outlined type the weather shows through.
//
// The four numbered marks are buttons: each scrolls the page to its sky, so the scene can be
// worked without a scroll wheel. The three demonstration skies carry the Example label. The last
// step shows the visitor's own reading (place, temperature, sky, source) when there is one, and
// nothing invented when there is not. Without motion nothing is ever asked of the page: the scene
// lists the three skies and the reading.

import { motion, useMotionValueEvent, useTransform, type MotionValue } from "motion/react";
import { createElement, Suspense, use, useContext, useEffect, useId, useState, type CSSProperties } from "react";
import { PROVIDER } from "@/components/v6/Card";
import { skyIcon } from "@/components/v6/HourlyStrip";
import { textFor, type V6Text } from "@/components/v6/text";
import type { Lang } from "@/lib/lang";
import { temp } from "@/lib/utils";
import { setSkyOverride } from "../sky-store";
import { placeName, type ReadingPromise } from "./cards";
import { storyCopy, type StoryCopy } from "./copy";
import { fadeStops, fadeValues, type Reading, SKY_DEMO, SKY_STARTS, skyStep, stepAt, stepTarget } from "./math";
import { ModeContext, usePlaceInBar } from "./mode";
import { SceneBar, SceneFrame, SceneLine, SceneTitle, useSceneJump, useSceneProgress } from "./scene";
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

/**
 * The fourth word: the visitor's own place when the reading is real, else just "Now". Where the
 * page's bar already names the place it is "Now" as well, so the name is on the screen once.
 */
function YoursWord({ pin, rich, reading, c, v }: { pin: MotionValue<number>; rich: boolean; reading: ReadingPromise; c: StoryCopy; v: V6Text }) {
  const r = reading ? use(reading) : null;
  const named = usePlaceInBar();
  return (
    <Word pin={pin} i={YOURS} rich={rich}>
      {r && r.current && !named ? placeName(r, c) : v.now}
    </Word>
  );
}

/**
 * "Erdenet · −12°C · Snow · Open-Meteo": the reading behind the page's sky and who gave it, only
 * when it is real. `named`: the place is already on the screen as the giant word, so it is not
 * said twice (the same holds where the page's bar names it). The source is the provider's name
 * alone for the same reason: the scene's own line, right above, already says the sky is drawn from
 * the forecast.
 */
function Yours({ reading, c, v, named = false, legend = false }: { reading: ReadingPromise; c: StoryCopy; v: V6Text; named?: boolean; legend?: boolean }) {
  const r = reading ? use(reading) : null;
  const inBar = usePlaceInBar();
  if (!r || !r.current) return null;
  const noPlace = named || inBar;
  // Under the legend a sky that has its own chip is not written out a second time: the icon shows
  // it, and screen readers still hear the word.
  const shown = legend && (SKY_DEMO as readonly string[]).includes(r.kind);
  return (
    <div data-yours className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <p className="st-yours v6-on-photo">
        {createElement(skyIcon(r.kind, r.isDay), { "aria-hidden": true, className: "size-4 shrink-0" })}
        {!noPlace && (
          <>
            <span className="font-semibold">{placeName(r, c)}</span> <span aria-hidden>·</span>{" "}
          </>
        )}
        <data value={r.tempC} className="num">
          {temp(r.tempC, false)}
        </data>{" "}
        {shown ? (
          <span className="sr-only">{v.kinds[r.kind]}</span>
        ) : (
          <>
            <span aria-hidden>·</span> <span>{v.kinds[r.kind]}</span>
          </>
        )}
      </p>{" "}
      <p data-prov="forecast" className="st-yours-src readout v6-on-photo">
        {PROVIDER["open-meteo"]}
      </p>
    </div>
  );
}

/**
 * One numbered mark. A press scrolls the page to that sky. Its name is the number it shows and the
 * sky it stands for ("2 Rain"): the giant word under the marks says the sky by sight.
 */
function Step({ i, on, children }: { i: number; on: boolean; children: string }) {
  const jump = useSceneJump();
  return (
    <li>
      <button type="button" className="st-step press readout" aria-current={on ? "step" : undefined} onClick={() => jump(stepTarget(SKY_STARTS, i))}>
        {i + 1}
        <span className="sr-only"> {children}</span>
      </button>
    </li>
  );
}

/** Erdenet's sky, standing in for a place that is not known, is ours and never called the visitor's. */
const isHome = (r: Reading | null) => r !== null && !r.local;

/** The fourth mark, named for whose sky it is. */
function YoursStep({ on, reading, c }: { on: boolean; reading: ReadingPromise; c: StoryCopy }) {
  const r = reading ? use(reading) : null;
  return (
    <Step i={YOURS} on={on}>
      {isHome(r) ? c.weather.ours : c.weather.yours}
    </Step>
  );
}

/** The scene's one line, by whose forecast the sky is drawn from. */
function ForecastLine({ reading, c }: { reading: ReadingPromise; c: StoryCopy }) {
  const r = reading ? use(reading) : null;
  return <>{isHome(r) ? c.weather.lineHome : c.weather.line}</>;
}

/** Live: one sky named at a time, in step with what the page draws behind the stage. */
function Reel({ pin, rich, reading, c, v }: { pin: MotionValue<number>; rich: boolean; reading: ReadingPromise; c: StoryCopy; v: V6Text }) {
  const last = fadeStops(SKY_STARTS, YOURS, FADE);
  const demo = useTransform(pin, last, [1, 0]);
  const real = useTransform(pin, last, [0, 1]);
  // Which sky is on: its mark is lit. Read where the pin stands now, then kept up by the scroll:
  // a page that opens at the end of the scene never sends a change for it.
  const [on, setOn] = useState(() => stepAt(SKY_STARTS, pin.get()));
  useMotionValueEvent(pin, "change", (p) => setOn(stepAt(SKY_STARTS, p)));
  return (
    <div className="st-reel">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <ul className="st-steps">
          {SKY_DEMO.map((kind, i) => (
            <Step key={kind} i={i} on={on === i}>
              {v.kinds[kind]}
            </Step>
          ))}
          <Suspense
            fallback={
              <Step i={YOURS} on={on === YOURS}>
                {c.weather.yours}
              </Step>
            }
          >
            <YoursStep on={on === YOURS} reading={reading} c={c} />
          </Suspense>
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
          <Yours reading={reading} c={c} v={v} named />
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
          <li key={kind} className="st-sky-chip">
            {createElement(skyIcon(kind), { "aria-hidden": true, className: "size-5 shrink-0 text-accent" })}
            {v.kinds[kind]}
          </li>
        ))}
      </ul>
      <Suspense fallback={null}>
        <Yours reading={reading} c={c} v={v} legend />
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
      <div className="st-head">
        <SceneTitle id="weather" rows={c.weather.title} scene={scene} />
        <SceneLine scene={scene}>
          <Suspense fallback={c.weather.line}>
            <ForecastLine reading={reading} c={c} />
          </Suspense>
          {/* Only true while scrolling does change the sky. Chinese sets no space between sentences. */}
          {mode.live && (lang === "zh" ? c.weather.hint : ` ${c.weather.hint}`)}
        </SceneLine>
      </div>
      <div className="st-fill">{mode.live ? <Reel pin={pin} rich={mode.rich} reading={reading} c={c} v={v} /> : <Legend reading={reading} c={c} v={v} />}</div>
    </SceneFrame>
  );
}
