"use client";

// The small pictures that follow the pointer over the feature index: one per row, drawn with the
// app's own parts and labels (departure rows, the load meter, the AQI bands, chips, the reply
// panel). They are decoration for people with a mouse (aria-hidden, never in the server's HTML):
// the row's title and line already say everything.
//
// A picture with made-up content (a departure, a reminder, a sign) carries the Example label. The
// others show no figures at all: a legend of skies, a map and headlines drawn in lines.

import { Bell, Bus, MessageCircle, ScanText } from "lucide-react";
import { createElement, type ReactNode } from "react";
import { skyIcon } from "@/components/v6/HourlyStrip";
import { fill, textFor, type V6Text } from "@/components/v6/text";
import type { SkyKind } from "@/lib/ambient-types";
import { HTML_LANG, type Lang } from "@/lib/lang";
import { cn } from "@/lib/utils";
import { CameraFrame, HeadlineBars } from "./cards";
import { storyCopy, type FeatureId, type StoryCopy } from "./copy";
import { Tag } from "./Tag";

interface PicProps {
  c: StoryCopy;
  v: V6Text;
}

const CHIP = "v6-chip min-h-8 gap-1.5 px-2.5 text-meta";

/** A route with three stops and one bus on the way, and the decision the transit card leads with. */
function BusPic({ c, v }: PicProps) {
  return (
    <div className="flex h-full flex-col justify-between gap-3">
      <div className="flex items-start justify-between gap-2">
        <p className="num text-[1.125rem] leading-tight font-medium text-ink">{fill(v.leaveIn, { n: 2 })}</p>
        <Tag>{c.example}</Tag>
      </div>
      <div>
        <div className="relative mx-2 h-8">
          <span className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-line-strong" />
          {[0, 50, 100].map((at) => (
            <span key={at} className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-ink bg-surface" style={{ left: `${at}%` }} />
          ))}
          <span className="num absolute top-1/2 left-[28%] flex h-6 -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-md bg-accent px-1.5 text-meta font-semibold text-on-accent">
            <Bus className="size-3.5" />3
          </span>
        </div>
        <ul className="mt-1 grid grid-cols-3 gap-2 text-meta text-ink-muted">
          {[c.city.stop, c.city.to[0], c.city.to[1]].map((name, i) => (
            <li key={name} className={cn("min-w-0 [overflow-wrap:anywhere]", i === 1 && "text-center", i === 2 && "text-right")}>
              {name}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** The skies the app draws and the air scale beside them. A legend, not a reading. */
function WeatherPic({ v }: PicProps) {
  const kinds: SkyKind[] = ["clear", "rain", "snow", "fog"];
  return (
    <div className="flex h-full flex-col justify-between gap-3">
      <ul className="grid grid-cols-4 gap-1">
        {kinds.map((kind) => (
          <li key={kind} className="flex min-w-0 flex-col items-center gap-1.5 rounded-[var(--radius-sm)] bg-surface-2 px-1 py-2.5 text-center">
            {createElement(skyIcon(kind), { className: "size-5 text-accent" })}
            <span className="max-w-full text-meta text-ink-muted [overflow-wrap:anywhere]">{v.kinds[kind]}</span>
          </li>
        ))}
      </ul>
      <div>
        <p className="text-meta text-ink-muted">{v.usAqi}</p>
        <div className="mt-1.5 flex gap-1">
          {[1, 2, 3, 4, 5, 6].map((band) => (
            <span key={band} className="h-1.5 flex-1 rounded-full" style={{ background: `var(--color-aqi-${band})` }} />
          ))}
        </div>
      </div>
    </div>
  );
}

/** The traffic card's three levels, and a camera frame to check them against. */
function TrafficPic({ v }: PicProps) {
  const levels = [
    { n: 1, tone: "bg-live", label: v.load.low },
    { n: 2, tone: "bg-warn", label: v.load.medium },
    { n: 3, tone: "bg-danger", label: v.load.high },
  ];
  return (
    <div className="grid h-full grid-cols-[minmax(0,1fr)_42%] items-center gap-3">
      <ul className="flex flex-col gap-2.5">
        {levels.map(({ n, tone, label }) => (
          <li key={n} className="flex items-center gap-2">
            <span className="flex shrink-0 gap-0.5">
              {[1, 2, 3].map((i) => (
                <span key={i} className={cn("h-1.5 w-3.5 rounded-full", i <= n ? tone : "bg-surface-3")} />
              ))}
            </span>
            <span className="min-w-0 text-meta text-ink [overflow-wrap:anywhere]">{label}</span>
          </li>
        ))}
      </ul>
      <CameraFrame className="aspect-[4/3]" />
    </div>
  );
}

/** A map in lines: streets, a route with its stops, a bus on it and the person. */
function MapPic() {
  return (
    <div className="relative h-full min-h-28 overflow-hidden rounded-[var(--radius-sm)] border border-line bg-surface-2">
      <svg viewBox="0 0 320 160" className="absolute inset-0 size-full" fill="none" preserveAspectRatio="xMidYMid slice">
        <g stroke="var(--color-line-strong)" strokeWidth="6" strokeLinecap="round">
          <path d="M-10 46 H330" />
          <path d="M-10 118 H330" />
          <path d="M70 -10 V170" />
          <path d="M214 -10 V170" />
          <path d="M-10 150 L150 -10" strokeWidth="4" />
        </g>
        <path d="M24 118 H70 V46 H214 V118 H300" stroke="var(--color-accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {[
          [24, 118],
          [70, 46],
          [214, 46],
          [300, 118],
        ].map(([x, y]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r="5" fill="var(--color-surface)" stroke="var(--color-ink)" strokeWidth="2" />
        ))}
        <rect x="128" y="33" width="26" height="26" rx="8" fill="var(--color-accent)" />
        <path d="M137 41 L146 46 L137 51 Z" fill="var(--color-on-accent)" />
        <circle cx="112" cy="118" r="10" fill="var(--color-bg)" stroke="var(--color-line-strong)" strokeWidth="2" />
        <circle cx="112" cy="118" r="4" fill="var(--color-accent)" />
      </svg>
    </div>
  );
}

/** A reminder as the app rings it: the bell, the words, the time. */
function ReminderPic({ c }: PicProps) {
  return (
    <div className="flex h-full flex-col justify-center gap-2.5">
      <Tag className="self-start">{c.example}</Tag>
      <p className="panel flex items-center gap-2.5 px-3 py-2.5">
        <Bell className="size-5 shrink-0 text-warn" />
        <span className="min-w-0 flex-1 text-copy text-ink [overflow-wrap:anywhere]">{c.index.reminder}</span>
        <span className="num shrink-0 text-copy text-ink-muted">08:00</span>
      </p>
    </div>
  );
}

/** A sign in another language, and the app saying what it says. */
function PhotoPic({ c }: PicProps) {
  return (
    <div className="flex h-full flex-col justify-center gap-2.5">
      <Tag className="self-start">{c.example}</Tag>
      <p lang={HTML_LANG[c.index.signLang]} className="flex items-center gap-2.5 rounded-[var(--radius-sm)] border border-line-strong bg-surface-3 px-3 py-2.5">
        <ScanText className="size-5 shrink-0 text-accent" />
        <span className="min-w-0 text-copy font-semibold tracking-[0.08em] text-ink [overflow-wrap:anywhere]">{c.index.sign}</span>
      </p>
      <p className="panel w-fit max-w-full px-3 py-2 text-copy text-ink [overflow-wrap:anywhere]">{c.index.reads}</p>
    </div>
  );
}

/** The three chat apps Aspire answers in, and the two systems Aspire Desktop runs on. */
function ChatPic() {
  return (
    <div className="flex h-full flex-col justify-center gap-3">
      <ul className="flex flex-wrap gap-1.5">
        {["Telegram", "Discord", "Slack"].map((app) => (
          <li key={app} className={CHIP}>
            <MessageCircle className="size-3.5 shrink-0 text-accent" />
            {app}
          </li>
        ))}
      </ul>
      <ul className="flex flex-wrap gap-1.5">
        {["Windows", "macOS"].map((os) => (
          <li key={os} className={CHIP}>
            {os}
          </li>
        ))}
      </ul>
    </div>
  );
}

function pic(id: FeatureId, p: PicProps): ReactNode {
  switch (id) {
    case "bus":
      return <BusPic {...p} />;
    case "weather":
      return <WeatherPic {...p} />;
    case "traffic":
      return <TrafficPic {...p} />;
    case "map":
      return <MapPic />;
    case "news":
      return <HeadlineBars className="h-full justify-center" />;
    case "reminders":
      return <ReminderPic {...p} />;
    case "photo":
      return <PhotoPic {...p} />;
    case "chat":
      return <ChatPic />;
  }
}

/** The picture for one row of the feature index. */
export function FeaturePreview({ id, lang }: { id: FeatureId; lang: Lang }) {
  return <>{pic(id, { c: storyCopy(lang), v: textFor(lang) })}</>;
}
