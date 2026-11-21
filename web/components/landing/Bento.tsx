"use client";

// What Aspire does: eight hairline tiles lettered A to H on a 12 column grid. Each has a title, one
// line and a small moving picture of the feature, drawn in CSS and SVG (no image, no canvas).
//
// What is real: tile B, once the visitor's reading has arrived. It shows their temperature and air
// quality with the source and is marked live. A reading changed by ?sky= or ?hour= is shown as not
// live, and with no reading the gauge stays empty beside one plain line. Every other word or
// figure inside a picture is made up: the key above the grid says so once, by letter, and stays on
// screen while the grid is scrolled, so no screen needs the word twice. The map and the news tiles
// show no word and no figure at all: a route and headlines drawn in lines.
//
// The server's HTML is the finished grid: every title, every line and every picture in its final
// state. A hydrated page that may move (no reduced motion, no Calm mode) marks the tiles that are
// on screen (one IntersectionObserver for the grid) and only those run their loops, two at a time
// on a phone. The loops live in bento.css: transform, opacity, stroke-dashoffset and clip-path only.
//
// The key has to clear the page's bar. The stylesheet takes the bar's height from the page; this
// file also measures what is really pinned to the top of the screen (when the section comes on
// screen, and on resize), and the larger of the two counts.

import "./bento.css";
import { Bell } from "lucide-react";
import { Component, Suspense, use, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { aqiPosition } from "@/components/v6/AirCard";
import { PROVIDER } from "@/components/v6/Card";
import { textFor, type V6Text } from "@/components/v6/text";
import { AQI_ORDER, aqiCategory } from "@/lib/ambient-types";
import { useMedia, useStill } from "@/lib/display-prefs";
import type { LandingWeather } from "@/lib/landing-weather";
import { HTML_LANG, type Lang } from "@/lib/lang";
import { temp } from "@/lib/utils";
import { bentoCopy, type BentoCopy } from "./bento-copy";
import { CameraFrame } from "./story/cards";
import { FEATURE_IDS, storyCopy, type FeatureId, type StoryCopy } from "./story/copy";

/* ---- what the grid shows ---- */

const LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H"] as const;
/** The letter a tile carries: A for the first feature, H for the eighth. */
export const letterOf = (id: FeatureId): string => LETTERS[FEATURE_IDS.indexOf(id)] ?? "";

/** The tiles whose picture holds a made-up word or figure. The key names them once, by letter. */
export const STAGED: readonly FeatureId[] = ["bus", "traffic", "reminders", "photo", "chat"];

/** The example departures: the first leaves in four minutes, the second seven minutes after it. */
export const BUS_FIRST = 4 * 60;
export const BUS_GAP = 7 * 60;
/** When the example reminder is due. */
const REMINDER_AT = "08:00";
/**
 * How a chat is linked to an account: the bots' own command (lib/bots/links.ts) with a made-up
 * code in the real format (ten characters of the pairing alphabet, lib/desktop.ts).
 */
export const COMMAND = "/link K7M2Q9XP4D";

/** Seconds as the four digits of a mm:ss clock. */
export function clock(seconds: number): [number, number, number, number] {
  const s = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const m = Math.floor(s / 60) % 100;
  const r = s % 60;
  return [Math.floor(m / 10), m % 10, Math.floor(r / 10), r % 10];
}
const two = (n: number) => String(n).padStart(2, "0");
/** The same clock as text: "11:00". */
export const clockText = (seconds: number): string => {
  const [a, b, c, d] = clock(seconds);
  return `${a}${b}:${c}${d}`;
};

/** Where a temperature sits on the gauge: 0 at 40 below, 1 at 40 above, never outside. */
export const gaugeFraction = (tempC: number): number => Math.min(1, Math.max(0, (tempC + 40) / 80));

/** How many frames a line passes through while it decodes, and how long each one is shown. */
export const DECODE_FRAMES = 8;
export const DECODE_STEP_MS = 70;
/** When in the photo tile's loop the decoding starts: once the scan line has crossed the sign. */
export const DECODE_AT_MS = 2000;

/**
 * The frames a line passes through while it decodes: as long as the text, spaces kept, and settled
 * from the left a little further in each one. The stand-ins are the line's own characters, so
 * every frame sets as wide as the text in any script. Nothing here is random: the same text always
 * gives the same frames.
 */
export function decodeFrames(text: string, count = DECODE_FRAMES): string[] {
  const chars = [...text];
  const pool = chars.filter((ch) => ch.trim() !== "");
  if (pool.length === 0 || count < 1) return [];
  let seed = (chars.length * 40503 + 12345) >>> 0;
  return Array.from({ length: count }, (_, frame) => {
    const settled = Math.floor((frame / count) * chars.length);
    return chars
      .map((ch, i) => {
        if (i < settled || ch.trim() === "") return ch;
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return pool[seed % pool.length];
      })
      .join("");
  });
}

/* ---- the visitor's reading ---- */

/** The part of the visitor's weather tile B shows, already checked. */
export interface LiveReading {
  /** The place as the network names it, trimmed and capped; "" when it is not known. */
  place: string;
  /** false: Aspire's home city stands in for a place that is not known. */
  local: boolean;
  /** false when ?sky= or ?hour= replaced part of the reading: it must not be called live. */
  live: boolean;
  tempC: number;
  /** The US air quality index as a whole number, or null when the reading has none. */
  aqi: number | null;
}

/**
 * Trust boundary: the reading comes from another module and may be half filled or overridden.
 * Anything without a place, a sky and a temperature Earth could have is no reading at all, and an
 * index that is not a plausible number is left out (never "NaN" on the page).
 */
export function liveReading(w: LandingWeather | null | undefined): LiveReading | null {
  if (!w || typeof w !== "object" || typeof w.place !== "string" || typeof w.tempC !== "number" || !Number.isFinite(w.tempC) || w.tempC < -95 || w.tempC > 65 || !w.sky || typeof w.sky !== "object") return null;
  // The index is a newer field of the reading: older readings do not carry it.
  const aqi: unknown = (w as { aqi?: unknown }).aqi;
  return {
    place: w.place.trim().slice(0, 80),
    local: w.local === true,
    live: w.preview !== true,
    tempC: w.tempC,
    aqi: typeof aqi === "number" && Number.isFinite(aqi) && aqi >= 0 && aqi <= 1000 ? Math.round(aqi) : null,
  };
}

/** The visitor's reading as the page hands it over: on its way, and null when there is none. */
type Weather = Promise<LandingWeather | null> | undefined;

/** Custom properties for bento.css. */
const vars = (v: Record<`--${string}`, string | number>) => v as CSSProperties;

interface PicProps {
  c: StoryCopy;
  b: BentoCopy;
  v: V6Text;
  /** This tile is on screen and the page may move: its loop runs. */
  play: boolean;
  /** The page may move at all (JavaScript runs, no reduced motion, no Calm mode). */
  moving: boolean;
}

/* ---- A: buses and stops ---- */

/**
 * One digit of the countdown. On a page that may move it is a small drum: the figure with its
 * neighbours faint above and below, and a new figure rolls in from above when the value changes
 * (the keyed element is replaced, so the roll plays once per change).
 */
function Digit({ value, base, drum, rolled }: { value: number; base: number; drum: boolean; rolled: boolean }) {
  return (
    <span className="bn-digit">
      <span key={value} className="bn-drum" data-roll={rolled ? "" : undefined}>
        {drum && <span aria-hidden>{(value + base - 1) % base}</span>}
        <span>{value}</span>
        {drum && <span aria-hidden>{(value + 1) % base}</span>}
      </span>
    </span>
  );
}

/** Two example departures counting down by the second: the first as a large clock, the second as a row. */
function BusPic({ c, play, moving }: PicProps) {
  const [bus, setBus] = useState({ left: BUS_FIRST, ticked: false });
  useEffect(() => {
    if (!play) return;
    const id = window.setInterval(() => setBus(({ left }) => ({ left: left > 0 ? left - 1 : BUS_FIRST, ticked: true })), 1000);
    return () => window.clearInterval(id);
  }, [play]);
  // A page that may not move shows the departures as the example states them.
  const left = moving ? bus.left : BUS_FIRST;
  const now = clock(left);
  const before = clock(left === BUS_FIRST ? 0 : left + 1);
  const digit = (i: number, base: number) => <Digit value={now[i]} base={base} drum={moving} rolled={moving && bus.ticked && now[i] !== before[i]} />;
  return (
    <div className="bn-bus">
      <div className="bn-first">
        <p className="bn-dep">
          <span className="bn-route numeral">3</span> <span className="bn-to readout">{c.city.to[0]}</span>
        </p>
        {/* Plain digits in the HTML ("04:00"). The faint neighbours a moving page adds are for the eye only. */}
        <p className="bn-clock numeral">
          {digit(0, 10)}
          {digit(1, 10)}
          <span className="bn-colon">:</span>
          {digit(2, 6)}
          {digit(3, 10)}
        </p>
        {/* The strip empties as the departure comes closer. */}
        <span aria-hidden className="bn-bars bn-strip" style={vars({ "--p": (left / BUS_FIRST).toFixed(4) })} />
      </div>
      <p className="bn-dep bn-second">
        <span className="bn-route numeral">5</span> <span className="bn-to readout">{c.city.to[1]}</span> <span className="bn-eta num">{clockText(left + BUS_GAP)}</span>
      </p>
    </div>
  );
}

/* ---- B: weather and air ---- */

/**
 * The gauge of tile B. With a reading: the temperature as an arc and a figure, the air quality
 * index on a scale of bars, and a line saying where it comes from. Without one: the empty dial and
 * one plain line, never a made-up figure. The sky is left to the page behind: in some languages
 * the tile's own line already names rain and snow, and no word may show twice.
 */
function Gauge({ r, c, v }: { r: LiveReading | null; c: StoryCopy; v: V6Text }) {
  const f = r ? gaugeFraction(r.tempC) : 0;
  const cat = r && r.aqi !== null ? aqiCategory(r.aqi) : null;
  const place = r && r.local && r.place ? r.place : c.erdenet;
  return (
    <div className="bn-wx" data-live={r?.live ? "" : undefined}>
      <div className="bn-gauge">
        {/* The ring of ticks is a drawing of its own: turning it moves one layer and repaints nothing. */}
        <svg className="bn-g-spin" viewBox="0 0 200 200" aria-hidden="true" focusable="false">
          <circle className="bn-g-ticks" cx="100" cy="100" r="93" pathLength="120" />
        </svg>
        <svg viewBox="0 0 200 200" aria-hidden="true" focusable="false">
          <circle className="bn-g-track" cx="100" cy="100" r="80" />
          <path className="bn-g-cross" d="M100 0V16M100 184V200M0 100H16M184 100H200" />
          {r ? (
            <circle className="bn-g-arc" cx="100" cy="100" r="80" pathLength="1" transform="rotate(-90 100 100)" style={{ strokeDashoffset: Number((1 - f).toFixed(4)) }} />
          ) : (
            <path className="bn-g-cross" d="M92 100H108M100 92V108" />
          )}
        </svg>
        {r && <span aria-hidden className="bn-needle" style={vars({ "--a": `${(f * 360).toFixed(1)}deg` })} />}
        {r && (
          <p className="bn-g-read">
            <data value={r.tempC} className="bn-g-temp numeral">
              {temp(r.tempC, false)}
            </data>
          </p>
        )}
      </div>
      <div className="bn-air">
        {r && (
          <p className="bn-air-row">
            <span className="readout">{v.usAqi}</span>{" "}
            {r.aqi !== null && cat ? (
              <>
                <data value={r.aqi} className="bn-air-n numeral">
                  {r.aqi}
                </data>{" "}
                <span className="bn-air-cat readout">
                  {/* The band's own colour, small: the word beside it carries the meaning. */}
                  <span aria-hidden className="bn-swatch" style={{ backgroundColor: `var(--color-aqi-${AQI_ORDER.indexOf(cat) + 1})` }} />
                  {v.aqi[cat]}
                </span>
              </>
            ) : (
              <span className="bn-air-none readout">{v.none}</span>
            )}
          </p>
        )}
        <span aria-hidden className="bn-bars" style={vars({ "--p": r && r.aqi !== null ? aqiPosition(r.aqi).toFixed(4) : 0 })} />
      </div>
      {r ? (
        <p className="bn-cap readout">
          {r.live ? (
            <>
              <span aria-hidden className="bn-dot" />
              <span>{v.live}</span> <span aria-hidden>·</span> <span>{PROVIDER["open-meteo"]}</span>
            </>
          ) : (
            <span>{v.static}</span>
          )}{" "}
          <span aria-hidden>·</span> <span className="bn-place">{place}</span>
        </p>
      ) : (
        <p className="bn-cap readout">{v.none}</p>
      )}
    </div>
  );
}

/**
 * The gauge once the reading is known. It suspends until then: the empty gauge stands in. The
 * promise is read as it is given (a server component hands over React's own thenable, whose then()
 * returns nothing to chain on) and what arrives is checked here.
 */
function LiveGauge({ weather, c, v }: { weather: Weather; c: StoryCopy; v: V6Text }) {
  return <Gauge r={liveReading(weather ? use(weather) : null)} c={c} v={v} />;
}

/** A reading that failed instead of arriving is no reading: the empty gauge, never a broken page. */
class Quiet extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/* ---- C to H ---- */

/** A drawn camera frame under a scan line, and a load meter at "light". */
function TrafficPic({ v }: PicProps) {
  return (
    <div className="bn-road">
      <div aria-hidden className="bn-cam">
        <CameraFrame className="absolute inset-0" />
        <span className="bn-sweep" />
      </div>
      <p className="bn-load">
        <span className="readout">{v.load.low}</span> <span aria-hidden className="bn-bars" style={vars({ "--p": 0.3 })} />
      </p>
    </div>
  );
}

/** The route every stop of the map lies on, as one path: it is drawn twice, once as the line and once as the dot on it. */
const ROUTE = "M18 118H86V46H208V100H302";

/** A map in lines over a faint grid: streets, a route that draws itself, its stops, a dot travelling it and the person. */
function MapPic() {
  return (
    <div aria-hidden className="bn-map">
      <svg viewBox="0 0 320 150" preserveAspectRatio="xMidYMid slice" focusable="false">
        <path className="bn-m-grid" d="M0 30H320M0 60H320M0 90H320M0 120H320M40 0V150M80 0V150M120 0V150M160 0V150M200 0V150M240 0V150M280 0V150" />
        <path className="bn-m-street" d="M0 46H320M0 118H320M86 0V150M208 0V150M-10 150L150 -10" />
        <path className="bn-m-route" d={ROUTE} pathLength="1" />
        <path className="bn-m-stop" d="M15 115h6v6h-6zM83 43h6v6h-6zM205 97h6v6h-6zM299 97h6v6h-6z" />
        <path className="bn-m-you" d="M142 86a8 8 0 1 0 0.01 0M142 74v7M142 107v7M122 94h7M155 94h7" />
        <path className="bn-m-dot" d={ROUTE} pathLength="1" />
      </svg>
    </div>
  );
}

/** Three headlines typing in as bars, each with a shorter bar for its source. No words: no invented news. */
function NewsPic() {
  return (
    <ul aria-hidden className="bn-news">
      {[86, 68, 78].map((width, i) => (
        <li key={width} style={vars({ "--i": i, "--w": `${width}%` })}>
          <span className="bn-src" />
          <span className="bn-bar" />
          <span className="bn-bar bn-bar-sub" />
        </li>
      ))}
    </ul>
  );
}

/** A ring that fills until the reminder is due, then the bell rings. */
function ReminderPic() {
  return (
    <div className="bn-rem">
      <span aria-hidden className="bn-ring">
        <svg viewBox="0 0 100 100" focusable="false">
          <circle className="bn-r-ticks" cx="50" cy="50" r="46" pathLength="24" />
          <circle className="bn-r-track" cx="50" cy="50" r="38" />
          <circle className="bn-r-arc" cx="50" cy="50" r="38" pathLength="1" transform="rotate(-90 50 50)" />
        </svg>
        <Bell className="bn-bell" />
      </span>
      <p className="bn-when numeral">{REMINDER_AT}</p>
    </div>
  );
}

/**
 * A line that decodes: while its tile plays, a few scrambled versions flash by before the text
 * settles from the left. The text itself is always in the DOM and is the only part read aloud; the
 * scrambled versions exist in the browser only, and only while the tile plays.
 */
function Decode({ text, play }: { text: string; play: boolean }) {
  const frames = useMemo(() => decodeFrames(text), [text]);
  return (
    <span className="bn-decode">
      <span className="bn-decode-final">{text}</span>
      {play &&
        frames.map((frame, i) => (
          <span key={i} aria-hidden className="bn-decode-frame" style={{ animationDelay: `${DECODE_AT_MS + i * DECODE_STEP_MS}ms` }}>
            {frame}
          </span>
        ))}
    </span>
  );
}

/** A sign in another language inside a viewfinder, a scan line crossing it, and what it means. */
function PhotoPic({ c, b, play }: PicProps) {
  return (
    <div className="bn-photo">
      <p lang={HTML_LANG[c.index.signLang]} className="bn-sign">
        <span>{c.index.sign}</span>
        <span aria-hidden className="bn-sweep" />
      </p>
      <p className="bn-meaning readout">
        <span aria-hidden className="bn-mark" />
        <Decode text={b.meaning} play={play} />
      </p>
    </div>
  );
}

/** A prompt typing the command that links a chat, and a bar for the answer. */
function ChatPic() {
  return (
    <div className="bn-term">
      <span aria-hidden className="bn-term-bar">
        <span />
        <span />
        <span />
      </span>
      <p className="bn-cmd" style={vars({ "--n": COMMAND.length })}>
        <span aria-hidden className="bn-prompt">
          &gt;
        </span>{" "}
        <span className="bn-type">
          <span className="bn-typed">{COMMAND}</span>
          <span aria-hidden className="bn-caret" />
        </span>
      </p>
      <span aria-hidden className="bn-reply" />
    </div>
  );
}

function Picture({ id, weather, ...p }: PicProps & { id: FeatureId; weather: Weather }): ReactNode {
  switch (id) {
    case "bus":
      return <BusPic {...p} />;
    case "weather": {
      // The reading is on its way, failed or there is none: the empty gauge, which is also what a
      // browser without JavaScript keeps when the reading comes late (it can never be swapped in there).
      const empty = <Gauge r={null} c={p.c} v={p.v} />;
      return (
        <Quiet fallback={empty}>
          <Suspense fallback={empty}>
            <LiveGauge weather={weather} c={p.c} v={p.v} />
          </Suspense>
        </Quiet>
      );
    }
    case "traffic":
      return <TrafficPic {...p} />;
    case "map":
      return <MapPic />;
    case "news":
      return <NewsPic />;
    case "reminders":
      return <ReminderPic />;
    case "photo":
      return <PhotoPic {...p} />;
    case "chat":
      return <ChatPic />;
  }
}

/* ---- the grid ---- */

const never = () => () => {};
const yes = () => true;
const no = () => false;
const NONE: readonly FeatureId[] = [];
/** How much of a tile has to be on screen before its picture moves. */
const MIN_SEEN = 0.15;

/**
 * The bottom edge of whatever is pinned to the top of the screen (the page's bar), in px, or 0 when
 * nothing is. The key sticks just under it. Three points across the top are tried, so a bar that
 * only takes clicks at its ends is still found; anything taller than a bar (an overlay) is ignored.
 */
function pinnedTop(): number {
  if (typeof document.elementsFromPoint !== "function") return 0;
  let bottom = 0;
  for (const x of [0.08, 0.5, 0.92]) {
    for (const hit of document.elementsFromPoint(window.innerWidth * x, 2)) {
      for (let node: Element | null = hit; node && node !== document.body; node = node.parentElement) {
        if (node.closest(".bn")) break;
        const position = getComputedStyle(node).position;
        if (position !== "fixed" && position !== "sticky") continue;
        const box = node.getBoundingClientRect();
        if (box.top <= 1 && box.height > 0 && box.height < window.innerHeight * 0.4) bottom = Math.max(bottom, box.bottom);
      }
    }
  }
  return Math.round(bottom);
}

/**
 * The bento grid. `weather` is the visitor's reading, not awaited: tile B reads it inside its own
 * Suspense boundary and shows the empty gauge until it arrives and when there is none.
 */
export function Bento({ lang, weather }: { lang: Lang; weather?: Promise<LandingWeather | null> }) {
  const c = storyCopy(lang);
  const b = bentoCopy(lang);
  const v = textFor(lang);
  // false on the server and during hydration, so the first client render matches the HTML.
  const hydrated = useSyncExternalStore(never, yes, no);
  const still = useStill();
  const wide = useMedia("(min-width: 48rem)");
  const moving = hydrated && !still;
  const section = useRef<HTMLElement>(null);
  const grid = useRef<HTMLUListElement>(null);
  const [seen, setSeen] = useState<readonly FeatureId[]>(NONE);

  // Where the key sticks: under whatever is pinned to the top of the screen at this width.
  useEffect(() => {
    const el = section.current;
    if (!el) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      el.style.setProperty("--bn-top", `${pinnedTop()}px`);
    };
    const queue = () => {
      if (!frame) frame = window.requestAnimationFrame(measure);
    };
    queue();
    // Again whenever the section comes on screen or leaves it: by then an intro that covered the
    // page is gone, and a bar that changes height as the page scrolls has settled.
    const io = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(queue);
    io?.observe(el);
    window.addEventListener("resize", queue);
    return () => {
      window.removeEventListener("resize", queue);
      io?.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
      el.style.removeProperty("--bn-top");
    };
  }, []);

  // Which tiles are on screen. A page that may not move never asks.
  useEffect(() => {
    const root = grid.current;
    if (!moving || !root || typeof IntersectionObserver === "undefined") return;
    const ratio = new Map<FeatureId, number>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const id = (e.target as HTMLElement).dataset.tile as FeatureId | undefined;
          if (id) ratio.set(id, e.isIntersecting ? e.intersectionRatio : 0);
        }
        const inView = FEATURE_IDS.filter((id) => (ratio.get(id) ?? 0) >= MIN_SEEN);
        // A phone moves two pictures at most: the two that are most on screen.
        const next = wide ? inView : [...inView].sort((x, y) => (ratio.get(y) ?? 0) - (ratio.get(x) ?? 0)).slice(0, 2);
        setSeen((prev) => (prev.length === next.length && next.every((id) => prev.includes(id)) ? prev : next));
      },
      { threshold: [0, MIN_SEEN, 0.35, 0.55, 0.75, 0.95] },
    );
    for (const el of root.querySelectorAll<HTMLElement>("[data-tile]")) io.observe(el);
    return () => io.disconnect();
  }, [moving, wide]);

  const playing = moving ? seen : NONE;
  return (
    <section ref={section} id="features" aria-labelledby="features-title" className="bn">
      <div className="bn-wrap">
        <div className="bn-head">
          <p aria-hidden className="bn-eyebrow readout">
            <span>{`${LETTERS[0]} : ${LETTERS[LETTERS.length - 1]}`}</span>
          </p>
          <h2 id="features-title" className="bn-title v6-on-photo">
            {c.index.label}
          </h2>
          <span aria-hidden className="bn-giant numeral">
            {two(FEATURE_IDS.length)}
          </span>
        </div>
        {/* The one example mark of the grid. It names the tiles it covers, and it sticks under the
            page's bar while the grid is scrolled, so whichever tiles are on screen it is beside them. */}
        <p className="bn-key readout">
          <span className="bn-tag">{c.example}</span>{" "}
          <span className="bn-key-letters">
            {STAGED.map((id, i) => (
              <span key={id}>
                {i > 0 && <span aria-hidden> · </span>}
                {letterOf(id)}
              </span>
            ))}
          </span>
        </p>
        {/* role: Safari drops the list from the accessibility tree once the markers are gone. */}
        <ul ref={grid} role="list" className="bn-grid">
          {FEATURE_IDS.map((id) => {
            const row = c.index.rows[id];
            const play = playing.includes(id);
            return (
              <li key={id} data-tile={id} data-play={play ? "" : undefined} className="bn-tile">
                <h3 className="bn-name">
                  <span className="bn-letter">{`${letterOf(id)}.`}</span> <span>{row.title}</span>
                </h3>
                {/* The space keeps title and line apart when the page is read as plain text. */}
                <span aria-hidden className="bn-rule" /> <p className="bn-line readout">{row.line}</p>
                <div className="bn-pic">
                  <Picture id={id} weather={weather} c={c} b={b} v={v} play={play} moving={moving} />
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
