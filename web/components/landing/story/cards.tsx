"use client";

// The six product cards of scene 02, built from the app's own card material and labels
// (.v6-card, components/v6/text.tsx, the source line, the load meter, the AQI bands).
//
// What is real: the weather card, when the visitor's reading has arrived and was not overridden:
// place, temperature and sky, with the app's own source line. Everything else that shows a figure
// is example data and carries the Example label. The camera and news cards show no figures at all:
// a road drawn in lines and headline bars, never a made-up picture or headline.
//
// A card fills its cell. When the cell is short (a pinned stage on a phone) the secondary rows step
// aside by container query (.st-more, then .st-less, story.css), so the main figure always fits.

import { Bus, CarFront, CloudSun, Newspaper, Video, Wind } from "lucide-react";
import { createElement, use, type ReactNode } from "react";
import { aqiPosition } from "@/components/v6/AirCard";
import { PROVIDER } from "@/components/v6/Card";
import { skyIcon } from "@/components/v6/HourlyStrip";
import { fill, textFor, type V6Text } from "@/components/v6/text";
import type { SkyKind } from "@/lib/ambient-types";
import type { Lang } from "@/lib/lang";
import { cn, temp } from "@/lib/utils";
import { storyCopy, type CardId, type StoryCopy } from "./copy";
import type { Reading } from "./math";
import { Tag } from "./Tag";

/** The visitor's reading, already checked (math.ts usableReading); undefined when the page was given none. */
export type ReadingPromise = Promise<Reading | null> | undefined;

/** The name to show for a reading's place: the visitor's city as given, or Erdenet in the page language. */
export const placeName = (r: Reading, c: StoryCopy): string => (r.local && r.place ? r.place : c.erdenet);

// Sizes are written as lengths on purpose: cn() (tailwind-merge) takes the app's own size utilities
// (text-meta, text-copy ...) for colours and drops them when a text colour follows in the same call.
const FIGURE = "num block text-[2.125rem] leading-none font-light tracking-[-0.03em] text-ink sm:text-[2.75rem]";
const LEAD = "text-[1.0625rem] leading-tight font-medium text-ink sm:text-[1.25rem]";
const META = "text-[length:var(--text-meta)] leading-[1.35] font-medium";
const NOTE = `${META} text-ink-muted [overflow-wrap:anywhere]`;

function Shell({ id, name, icon, foot, children }: { id: CardId; name: string; icon: ReactNode; foot?: ReactNode; children: ReactNode }) {
  return (
    <article data-card={id} className="st-card v6-card">
      <h3 className="flex min-w-0 items-center gap-2 text-card leading-tight text-ink">
        <span aria-hidden className="shrink-0 text-ink-muted [&>svg]:size-[18px]">
          {icon}
        </span>
        <span className="min-w-0 [overflow-wrap:anywhere]">{name}</span>
      </h3>
      <div className="min-h-0 flex-1">{children}</div>
      {foot}
    </article>
  );
}

interface CardProps {
  lang: Lang;
  c: StoryCopy;
  v: V6Text;
}

/**
 * "Forecast · Open-Meteo": the words and order of the app's own source line (v6 Card
 * ProvenanceLine). Written out here because it has to wrap: the app's line keeps to one row and
 * cuts the source short in a narrow card, and a source must never be cut.
 */
export function SourceLine({ v, className }: { v: V6Text; className: string }) {
  return (
    <p data-prov="forecast" className={`flex flex-wrap items-center gap-x-1.5 ${className}`}>
      <span>{v.forecast}</span> <span aria-hidden>·</span> <span>{PROVIDER["open-meteo"]}</span>
    </p>
  );
}

/* ---- weather: the one card that can be real ---- */

function WeatherBody({ place, tempC, kind, isDay, v }: { place: string; tempC: number; kind: SkyKind; isDay: boolean; v: V6Text }) {
  return (
    <>
      <p className="truncate text-meta text-ink-muted">{place}</p>
      <data value={tempC} className={cn(FIGURE, "mt-0.5")}>
        {temp(tempC, false, false)}
      </data>
      <p className="st-less mt-1.5 flex items-center gap-1.5 text-copy text-ink">
        {createElement(skyIcon(kind, isDay), { "aria-hidden": true, className: "size-4 shrink-0" })}
        <span className="min-w-0 truncate">{v.kinds[kind]}</span>
      </p>
    </>
  );
}

/**
 * The weather card for the reading: real figures with their source, or example figures with the
 * label. With no `reading` it is the example card, which is also what stands in while a reading is
 * on its way: the scene is far below the fold, so by the time it is seen the reading has arrived,
 * and a browser without JavaScript (where a late reading can never be swapped in) still gets a
 * finished, honestly labelled card instead of a skeleton.
 */
export function WeatherCard({ c, v, reading }: Omit<CardProps, "lang"> & { reading: ReadingPromise }) {
  const r = reading ? use(reading) : null;
  const real = !!r && r.current;
  return (
    <Shell
      id="weather"
      name={c.city.cards.weather}
      icon={<CloudSun />}
      foot={real ? <SourceLine v={v} className={`${META} text-ink-faint`} /> : <Tag className="self-start">{c.example}</Tag>}
    >
      {r ? <WeatherBody place={placeName(r, c)} tempC={r.tempC} kind={r.kind} isDay={r.isDay} v={v} /> : <WeatherBody place={c.erdenet} tempC={-12} kind="snow" isDay={false} v={v} />}
    </Shell>
  );
}

/* ---- the five example cards ---- */

/** Nearby transit the way TransitCard leads with it: when to leave, then the next departures. */
function BusCard({ c, v }: CardProps) {
  const rows = [
    { route: "3", to: c.city.to[0], minutes: 4 },
    { route: "5", to: c.city.to[1], minutes: 11 },
  ];
  return (
    <Shell
      id="bus"
      name={c.city.cards.bus}
      icon={<Bus />}
      foot={
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <Tag>{c.example}</Tag>
          {/* The app says how each departure is known beside its minutes. The card is too narrow
              for that in every language, so the word is said once, with the same dashed line. */}
          <span className={`st-more ${META} text-ink-faint underline decoration-dashed`}>{v.estimated}</span>
        </div>
      }
    >
      <p className={cn("num", LEAD)}>{fill(v.leaveIn, { n: 2 })}</p>
      <p className={cn("st-less mt-1", NOTE)}>
        {c.city.stop} · {fill(v.walk, { n: 2 })}
      </p>
      <ul className="st-more mt-2 divide-y divide-line">
        {rows.map((r) => (
          <li key={r.route} className="flex min-h-9 items-center gap-2 py-1">
            {/* The spaces keep the row readable as plain text ("3 Market 4 min"). */}
            <span className="num min-w-7 shrink-0 rounded-md bg-surface-3 px-1.5 py-0.5 text-center text-meta text-ink">{r.route}</span>{" "}
            {/* Whole words only: a stop name broken mid-word reads badly ("Их сургууль"). */}
            <span className="min-w-0 flex-1 text-copy leading-tight text-ink break-words">{r.to}</span>{" "}
            <span className="num shrink-0 text-copy font-medium text-ink underline decoration-dashed">
              {r.minutes} {v.min}
            </span>
          </li>
        ))}
      </ul>
    </Shell>
  );
}

/** TrafficCard's load meter at "moderate", with the delay line under it. */
function TrafficCard({ c, v }: CardProps) {
  return (
    <Shell id="traffic" name={c.city.cards.traffic} icon={<CarFront />} foot={<Tag className="self-start">{c.example}</Tag>}>
      <span aria-hidden className="flex gap-1 pt-1">
        {[1, 2, 3].map((i) => (
          <span key={i} className={cn("h-2 w-6 rounded-full", i <= 2 ? "bg-warn" : "bg-surface-3")} />
        ))}
      </span>
      <p className={cn("mt-2.5", LEAD)}>{v.load.medium}</p>
      <p className={cn("st-less num mt-1", NOTE)}>{fill(v.delay, { n: 3 })}</p>
    </Shell>
  );
}

/** AirCard's figure, category word and six-band scale with its marker. */
function AirCard({ c, v }: CardProps) {
  const aqi = 42;
  return (
    <Shell id="air" name={c.city.cards.air} icon={<Wind />} foot={<Tag className="self-start">{c.example}</Tag>}>
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <data value={aqi} className={FIGURE}>
          {aqi}
        </data>
        <span className="rounded-md px-2 py-0.5 text-meta text-ink" style={{ background: "color-mix(in srgb, var(--color-aqi-1) 22%, transparent)" }}>
          {v.aqi.good}
        </span>
      </div>
      <p className={cn("st-less mt-1", NOTE)}>{v.usAqi}</p>
      <div aria-hidden className="st-more relative mt-3">
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5, 6].map((band) => (
            <span key={band} className="h-1.5 flex-1 rounded-full" style={{ background: `var(--color-aqi-${band})`, opacity: band === 1 ? 1 : 0.55 }} />
          ))}
        </div>
        <span className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-bg bg-ink" style={{ left: `${(aqiPosition(aqi) * 100).toFixed(1)}%` }} />
      </div>
    </Shell>
  );
}

/** One camera frame: a road drawn in lines inside the HUD's corner brackets. Never a photograph. */
export function CameraFrame({ flip = false, className }: { flip?: boolean; className?: string }) {
  return (
    <div className={cn("st-cam relative min-h-12 overflow-hidden rounded-[var(--radius-sm)] border border-line bg-surface-2", className)}>
      <svg viewBox="0 0 80 60" className="absolute inset-0 size-full" fill="none" preserveAspectRatio="xMidYMid slice">
        <path d="M0 34 H80" stroke="var(--color-line-strong)" />
        <path d={flip ? "M10 60 L36 34 H48 L80 52 V60 Z" : "M0 60 V52 L34 34 H44 L70 60 Z"} fill="var(--color-surface-3)" />
        <path d={flip ? "M40 60 L42 36" : "M38 60 L39 36"} stroke="var(--color-ink-faint)" strokeDasharray="4 4" />
        <path d={flip ? "M4 34 V22 H14 V34 M18 34 V16 H30 V34" : "M50 34 V18 H62 V34 M66 34 V24 H76 V34"} stroke="var(--color-line-strong)" />
      </svg>
      <Video className="absolute top-2.5 left-2.5 size-4 text-accent" />
    </div>
  );
}

function CamerasCard({ c }: CardProps) {
  return (
    <Shell id="cameras" name={c.city.cards.cameras} icon={<Video />} foot={<p className={cn("st-less", NOTE)}>{c.city.feeds}</p>}>
      <div aria-hidden className="grid h-full max-h-24 grid-cols-2 gap-2">
        <CameraFrame />
        <CameraFrame flip />
      </div>
    </Shell>
  );
}

/** Headlines as lines: the news card's rows without any made-up news. */
export function HeadlineBars({ rows = [88, 72, 80], className }: { rows?: number[]; className?: string }) {
  return (
    <ul aria-hidden className={cn("flex flex-col gap-2.5", className)}>
      {rows.map((width, i) => (
        <li key={width} className={cn("flex items-start gap-2.5", i > 0 && "st-less", i > 1 && "st-more")}>
          <span className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-surface-3 text-ink-muted">
            <Newspaper className="size-4" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-1.5 pt-1.5">
            <span className="h-2 rounded-full bg-surface-3" style={{ width: `${width}%` }} />
            <span className="h-1.5 w-1/3 rounded-full bg-surface-2" />
          </span>
        </li>
      ))}
    </ul>
  );
}

function NewsCard({ c }: CardProps) {
  return (
    <Shell id="news" name={c.city.cards.news} icon={<Newspaper />} foot={<p className={cn("st-less", NOTE)}>{c.city.headlines}</p>}>
      <HeadlineBars />
    </Shell>
  );
}

/** One of the five cards that never wait for anything. */
export function ExampleCard({ id, lang }: { id: Exclude<CardId, "weather">; lang: Lang }) {
  const props: CardProps = { lang, c: storyCopy(lang), v: textFor(lang) };
  switch (id) {
    case "bus":
      return <BusCard {...props} />;
    case "traffic":
      return <TrafficCard {...props} />;
    case "air":
      return <AirCard {...props} />;
    case "cameras":
      return <CamerasCard {...props} />;
    case "news":
      return <NewsCard {...props} />;
  }
}
