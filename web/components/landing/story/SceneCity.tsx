"use client";

// Scene 002, The city, live: the visitor's own readings on one gauge, one after another while the
// stage is pinned. Temperature, wind, cloud cover and air quality come from the reading the page
// was given; the clock is the visitor's device, set to the place's time zone. Each has its name at
// the far left, its index at the far right, the figure in the middle of the gauge and one line
// saying where it comes from.
//
// Nothing here is staged. A dial exists only for a figure that is real (dials.ts): a reading
// without wind has no wind dial, and with no reading at all the clock stands alone. A reading that
// ?sky= or ?hour= changed is named a preview, loses its live mark and its source, and has no clock.
//
// While pinned the figures sit on a drum: scrolling rolls the next one into the middle, the one
// before and the one after show as ghosts above and below, and the arc sweeps from one figure's
// place to the next. Without motion the same dials are a grid, every figure in view at once.
//
// The whole scene waits on the reading inside its own boundary, because how tall it is depends on
// how many dials there are. Until the reading arrives, and when there is none, it is the scene
// with no weather: nothing is drawn that could later turn out wrong.

import { motion, useMotionValueEvent, useTransform, type MotionValue } from "motion/react";
import { Suspense, use, useContext, useMemo, useState, useSyncExternalStore, type CSSProperties } from "react";
import { PROVIDER } from "@/components/v6/Card";
import { textFor, type V6Text } from "@/components/v6/text";
import type { Lang } from "@/lib/lang";
import { placeName, type ReadingPromise } from "./cards";
import { storyCopy, type StoryCopy } from "./copy";
import { Decode } from "./Decode";
import { clockDial, type Dial, type DialId, dialsTall, dialTurn, figureFit, ghostAlpha, minutesAt, readingDials, soloAlpha, utcOffsetLabel } from "./dials";
import { GaugeArc, GaugeRing } from "./Gauge";
import { lerp, type Reading } from "./math";
import { ModeContext, usePlaceInBar } from "./mode";
import { SceneBar, SceneFrame, SceneLine, SceneTitle, type SceneProgress, useSceneProgress } from "./scene";

/**
 * The word beside the live dot. The app has two for it, "Live" and "Now" (components/v6/text);
 * the one the scene's own label does not already say is used, so no word is on the screen twice.
 */
export function liveWord(lang: Lang): string {
  const v = textFor(lang);
  return storyCopy(lang).city.label.toLowerCase().includes(v.live.toLowerCase()) ? v.now : v.live;
}

/* ---- the device's clock ---- */

const subscribeMinute = (onChange: () => void) => {
  const id = window.setInterval(onChange, 5_000);
  return () => window.clearInterval(id);
};
/** Whole minutes since the epoch: the snapshot only changes when the clock face does. */
const minuteNow = () => Math.floor(Date.now() / 60_000);
const noMinute = () => null;

/** The device's clock to the minute. null on the server and while hydrating: the server never guesses the visitor's time. */
function useMinute(): number | null {
  return useSyncExternalStore<number | null>(subscribeMinute, minuteNow, noMinute);
}

/* ---- one dial ---- */

interface Shown {
  dial: Dial;
  name: string;
  unit: string | null;
  /** The caption's words, in order. */
  caption: string[];
  /** A real, current figure: it carries the live mark. */
  live: boolean;
}

const vars = (v: Record<`--${string}`, string | number>) => v as CSSProperties;

/** The live mark: a green dot that pulses three times when its dial comes up (story.css), then rests. */
function Caption({ words, live, play, className }: { words: string[]; live: boolean; play: boolean; className?: string }) {
  return (
    <p className={className} data-live={live || undefined}>
      {live && <span aria-hidden className="st-live-dot" />}
      <Decode text={words.join(" · ")} play={play} />
    </p>
  );
}

/** The figure with its unit: a number, or a time. */
function Figure({ dial, unit }: { dial: Dial; unit: string | null }) {
  return (
    <span className="st-dial-fig">
      {dial.id === "time" ? <time dateTime={dial.text}>{dial.text}</time> : <data value={dial.value}>{dial.text}</data>}
      {/* The space keeps figure and unit apart when the page is read as plain text ("17 °C"). */}
      {unit && " "}
      {unit && <span className="st-dial-unit">{unit}</span>}
    </span>
  );
}

interface DialProps {
  shown: Shown;
  i: number;
  /** A still page: this card's own source, when it differs from the one under the grid. */
  own: string | null;
}

/** A dial as a card of the still grid: its name and index, its own small gauge, the figure inside it. */
function StillDial({ shown, i, own }: DialProps) {
  const { dial, name, unit } = shown;
  return (
    <li className="st-dial" data-dial={dial.id} style={vars({ "--st-fill": dial.fill.toFixed(4), "--st-fit": figureFit(dial.text) })}>
      <h3 className="st-dial-name">{name}</h3>{" "}
      <span aria-hidden className="st-dial-idx numeral">
        {`2.${i + 1}`}
      </span>{" "}
      <div className="st-gauge">
        <GaugeRing />
        <GaugeArc />
        <p className="st-dial-roll numeral">
          <Figure dial={dial} unit={unit} />
        </p>
      </div>
      {own && <p className="st-dial-own readout">{own}</p>}
    </li>
  );
}

/**
 * A dial on the pinned stage. All dials share one place: its name, index and caption show only
 * while it is the one in the middle, and its figure rides the drum (one row per dial).
 */
function LiveDial({ shown, i, turn, on }: Omit<DialProps, "own"> & { turn: MotionValue<number>; on: boolean }) {
  const { dial, name, unit, caption, live } = shown;
  const away = useTransform(turn, (t) => i - t);
  const solo = useTransform(away, soloAlpha);
  const ghost = useTransform(away, ghostAlpha);
  const y = useTransform(away, (o) => `${(o * 100).toFixed(2)}%`);
  return (
    <li className="st-dial" data-dial={dial.id} data-on={on || undefined} style={vars({ "--st-fit": figureFit(dial.text) })}>
      <motion.h3 className="st-dial-name v6-on-photo" style={{ opacity: solo }}>
        {name}
      </motion.h3>
      <motion.span aria-hidden className="st-dial-idx numeral v6-on-photo" style={{ opacity: solo }}>
        {`2.${i + 1}`}
      </motion.span>
      <div className="st-gauge">
        <motion.p className="st-dial-roll numeral" style={{ y, opacity: ghost }}>
          <Figure dial={dial} unit={unit} />
        </motion.p>
      </div>
      <motion.div className="st-dial-foot" style={{ opacity: solo }}>
        <Caption words={caption} live={live} play={on} className="st-dial-cap readout v6-on-photo" />
      </motion.div>
    </li>
  );
}

/** The one gauge of the pinned stage: its arc sweeps from each figure's place to the next as the drum turns. */
function SharedGauge({ fills, turn, scene }: { fills: number[]; turn: MotionValue<number>; scene: SceneProgress }) {
  const { enter } = scene;
  const sweep = useTransform(() => {
    const t = turn.get();
    const i = Math.max(0, Math.min(fills.length - 1, Math.floor(t)));
    const between = lerp(fills[i] ?? 0, fills[Math.min(fills.length - 1, i + 1)] ?? 0, t - i);
    // The arc draws itself as the stage arrives.
    return between * Math.max(0, Math.min(1, (enter.get() - 0.45) / 0.55));
  });
  return (
    <motion.div aria-hidden className="st-gauge st-gauge-shared" style={{ "--st-fill": sweep } as never}>
      <GaugeRing />
      <GaugeArc />
    </motion.div>
  );
}

/* ---- what to show for a reading ---- */

const UNIT = (id: DialId, c: StoryCopy, v: V6Text, zone: string | null): string | null => (id === "temp" ? "°C" : id === "wind" ? c.city.kmh : id === "cloud" ? "%" : id === "air" ? v.usAqi : zone);
const NAME = (id: DialId, c: StoryCopy, v: V6Text): string => (id === "air" ? v.air : c.city.dials[id]);

/**
 * Every dial with its words. `minute` is the device's clock (null: not known here, so no clock
 * dial). `named`: the page's bar already shows the place, so the captions do not say it again.
 */
function dialsFor(r: Reading | null, minute: number | null, lang: Lang, named: boolean): Shown[] {
  const c = storyCopy(lang);
  const v = textFor(lang);
  const mark = liveWord(lang);
  const place = r && !named ? placeName(r, c) : null;
  const where = place ? [place] : [];
  const real = !r || r.current;
  // A previewed reading says so, and names no source: part of it was replaced.
  const from = r ? (r.current ? [mark, PROVIDER["open-meteo"], ...where] : [c.city.preview, ...where]) : [];
  const out: Shown[] = readingDials(r).map((dial) => ({ dial, name: NAME(dial.id, c, v), unit: UNIT(dial.id, c, v, null), caption: from, live: real }));
  // The clock is the device's. With a reading it is set to the place's zone; a zone this browser
  // does not know leaves the device's own time, and then the caption does not name the place.
  if (minute !== null && real) {
    const ms = minute * 60_000;
    const there = r?.timeZone ? minutesAt(ms, r.timeZone) : null;
    const minutes = there ?? minutesAt(ms, null);
    if (minutes !== null) {
      const zone = there !== null ? (r?.timeZone ?? null) : null;
      const dial = clockDial(minutes);
      out.push({ dial, name: NAME("time", c, v), unit: UNIT("time", c, v, utcOffsetLabel(ms, zone)), caption: [mark, c.city.device, ...(there !== null ? where : [])], live: true });
    }
  }
  return out;
}

function Scene({ lang, reading }: { lang: Lang; reading: ReadingPromise }) {
  const r = reading ? use(reading) : null;
  const mode = useContext(ModeContext);
  const scene = useSceneProgress();
  const c = storyCopy(lang);
  const minute = useMinute();
  const named = usePlaceInBar();
  const dials = useMemo(() => dialsFor(r, minute, lang, named), [r, minute, lang, named]);
  const n = dials.length;
  const fills = useMemo(() => dials.map((d) => d.dial.fill), [dials]);

  const turn = useTransform(scene.pin, (p) => dialTurn(p, n));
  // The title and its line are read while the first dial is held, then step back: from there on
  // the stage holds the dial's name, the gauge and the index, and nothing else.
  const headAlpha = useTransform(scene.pin, [0.05, 0.16], [1, 0]);
  // Which dial is in the middle: it gets the pulse of its live dot and the decode of its caption.
  // Scrolling keeps it up to date. It is also read when the scene is first drawn and whenever the
  // number of dials changes (the reading arrived, the clock joined): neither is a scroll.
  const [on, setOn] = useState(() => Math.round(turn.get()));
  const [counted, setCounted] = useState(n);
  if (counted !== n) {
    setCounted(n);
    setOn(Math.round(turn.get()));
  }
  useMotionValueEvent(turn, "change", (t) => setOn(Math.round(t)));

  // A still page shows one source under the grid. The clock's differs, so its card says its own.
  const first = dials[0];
  const clock = dials.find((d) => d.dial.id === "time");
  const shared = first ?? null;
  const live = mode.live;

  return (
    <SceneFrame id="city" scene={scene} tall={dialsTall(n)}>
      {/* No giant index behind this stage: the drum's own faint figures play that part. */}
      <SceneBar n={2} label={c.city.label} scene={scene} ghost={false} />
      <motion.div className="st-head" style={{ opacity: live && n > 0 ? headAlpha : 1 }}>
        <SceneTitle id="city" rows={c.city.title} scene={scene} />
        {/* Erdenet's reading, standing in for a place that is not known, is never called the visitor's own. */}
        <SceneLine scene={scene}>{r && !r.local ? c.city.lineHome : c.city.line}</SceneLine>
      </motion.div>
      {n > 0 && (
        <div className="st-dials" data-count={n}>
          {live && <SharedGauge fills={fills} turn={turn} scene={scene} />}
          <ul className="st-dial-list">
            {dials.map((shown, i) =>
              live ? (
                <LiveDial key={shown.dial.id} shown={shown} i={i} turn={turn} on={on === i} />
              ) : (
                <StillDial key={shown.dial.id} shown={shown} i={i} own={clock === shown && shared !== shown ? c.city.device : null} />
              ),
            )}
          </ul>
          {!live && shared && <Caption words={shared.caption} live={shared.live} play={false} className="st-dial-cap readout v6-on-photo" />}
        </div>
      )}
    </SceneFrame>
  );
}

export function SceneCity({ lang, reading }: { lang: Lang; reading: ReadingPromise }) {
  return (
    <Suspense fallback={<Scene lang={lang} reading={undefined} />}>
      <Scene lang={lang} reading={reading} />
    </Suspense>
  );
}
