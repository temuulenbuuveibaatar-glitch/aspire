// Nearby transit (spec improvement 4), built around the decision: "Leave in N min" (next usable
// departure minus the walk). Each departure says how it is known: Live (pulsing dot), Estimated
// (dashed, e.g. Erdenet minutes worked out from live bus positions) or Scheduled (grey, no dot).
// Stops with no timetable (OpenStreetMap) are listed as "No timetable data", never with minutes; a city
// with nothing gets a named empty state.

import { ArrowRight, Bus } from "lucide-react";
import type { Ambient } from "@/lib/ambient-types";
import { ERDENET_CREDIT } from "@/lib/geo";
import type { Lang } from "@/lib/lang";
import { cn } from "@/lib/utils";
import { ageS, Card, LiveDot, type CardState, type Provenance } from "@/components/v6/Card";
import { distanceText } from "@/components/v6/CitySheet";
import { fill, named, textFor } from "@/components/v6/text";

export type Coverage = "live" | "scheduled" | "static" | "none";

export interface Departure {
  route: string;
  color?: string | null;
  headsign?: string | null;
  /** Minutes from `at`. */
  minutes: number;
  kind: "live" | "scheduled" | "estimated";
  /** ISO time the minutes were computed; the row counts down from it. */
  at: string;
  source: string;
}

/** Transitous asks every app to link its list of data sources. */
export const TRANSITOUS_SOURCES = "https://transitous.org/sources/";

/** OpenStreetMap stops (lib/osm-stops.ts): names only, no times. ODbL asks for this credit and link. */
export const OSM_STOPS_PROV: Provenance = { source: "OpenStreetMap contributors", ageS: null, kind: "static", href: "https://www.openstreetmap.org/copyright" };

/** The stops of a snapshot that came from OpenStreetMap (lib/ambient.ts OsmAmbientStop): no timetable. */
export const osmStops = (a: Pick<Ambient, "stops">) => a.stops.filter((s) => (s as { source?: unknown }).source === "osm");

/** The name to credit for a transit source. */
export const transitCredit = (source: string | null | undefined): string =>
  source === "erdenet-live" ? ERDENET_CREDIT : source === "transitous" ? "Transitous" : "Google";

/**
 * Departures from an /api/ambient snapshot received at `at` (ISO). Erdenet minutes are estimates from
 * live positions; Transitous says per departure whether it is real-time (live) or from the timetable.
 */
export function departuresFromAmbient(a: Pick<Ambient, "stops" | "nextBus" | "stopsSource">, at: string): Departure[] {
  const lines = a.stops?.[0]?.lines ?? [];
  // Stop lines with no named source (an older snapshot) are not credited to anyone: the next bus instead.
  const from = a.stopsSource;
  if (lines.length && from) {
    // Only Erdenet's minutes are worked out from vehicle positions; any other source's lines are its timetable.
    const kind = (l: { live?: boolean }): Departure["kind"] => (from === "transitous" ? (l.live ? "live" : "scheduled") : from === "erdenet-live" ? "estimated" : "scheduled");
    return lines.map((l) => ({ route: l.route, minutes: l.minutes, kind: kind(l), at, source: transitCredit(from) }));
  }
  const b = a.nextBus;
  if (!b) return [];
  const kind = b.kind === "live" ? "live" : b.kind === "estimate" || (!b.kind && b.source === "erdenet-live") ? "estimated" : "scheduled";
  return [{ route: b.line, minutes: b.departsInMin, kind, at: b.at, source: transitCredit(b.source) }];
}

/** Minutes left now; null when the departure has gone or its numbers are not usable. */
export function minutesLeft(d: Departure, now: number | null): number | null {
  if (!Number.isFinite(d.minutes)) return null;
  const at = Date.parse(d.at);
  const left = now == null || !Number.isFinite(at) ? d.minutes : d.minutes - (now - at) / 60_000;
  return left >= 0 ? left : null;
}

/** A live-vehicle count older than this is not called live. */
const LIVE_MAX_S = 120;

const hex = (c: string | null | undefined) => (c && /^#[0-9a-f]{3,8}$/i.test(c) ? c : null);

interface TransitCardProps {
  lang: Lang;
  now: number | null;
  coverage: Coverage;
  departures: Departure[];
  /** The nearest stop and the walk to it. */
  stopName?: string | null;
  walkMin?: number | null;
  /** Stops with no timetable, nearest first: shown with "No timetable data" when coverage is static. A non-finite distance (a typed city's centre) is not shown. */
  stops?: { name: string; distanceM: number }[];
  /** Live vehicles on the map right now (Erdenet feed, Transitous trips). */
  liveBuses?: { count: number; at: string } | null;
  city?: string | null;
  prov?: Provenance | null;
  state?: CardState;
  index?: number;
  onRetry?: () => void;
  onViewRoutes: () => void;
  className?: string;
}

export function TransitCard({ lang, now, coverage, departures, stopName, walkMin, stops, liveBuses, city, prov, state = "ready", index, onRetry, onViewRoutes, className }: TransitCardProps) {
  const t = textFor(lang);
  // Static or no coverage never shows minutes.
  const rows =
    coverage === "static" || coverage === "none"
      ? []
      : departures
          .map((d) => ({ d, left: minutesLeft(d, now) }))
          .filter((r): r is { d: Departure; left: number } => r.left != null)
          .sort((a, b) => a.left - b.left)
          .slice(0, 3);
  const walk = walkMin != null && Number.isFinite(walkMin) && walkMin >= 0 ? Math.round(walkMin) : null;
  const catchable = walk == null ? null : rows.find((r) => r.left >= walk);
  const leave = catchable && walk != null ? Math.floor(catchable.left - walk) : null;
  // Coverage with nothing due is not "no data": the feed answered, nothing is leaving soon.
  const emptyText =
    coverage === "live" || coverage === "scheduled" ? t.noDepartures : named(coverage === "static" ? t.stopsOnly : t.noTransit, city || stopName, t.empty);
  const live = liveBuses && liveBuses.count > 0 && (ageS(liveBuses.at, now) ?? 0) <= LIVE_MAX_S ? liveBuses.count : 0;
  const bare = coverage === "static" ? (stops ?? []).slice(0, 3) : [];
  const shownState: CardState = state === "ready" && !rows.length && !live && !bare.length ? "empty" : state;

  return (
    <Card title={t.transit} icon={<Bus />} lang={lang} state={shownState} emptyText={emptyText} prov={prov} onRetry={onRetry}
      index={index}
      className={className}
      footer={
        <button type="button" onClick={onViewRoutes} className="press flex min-h-11 w-full items-center justify-between text-copy text-ink">
          {t.viewRoutes}
          <ArrowRight aria-hidden className="size-4" />
        </button>
      }
    >
      {!bare.length && (stopName || walk != null) && (
        <p className="text-meta text-ink-muted [overflow-wrap:anywhere]">
          {stopName}
          {stopName && walk != null && " · "}
          {walk != null && fill(t.walk, { n: walk })}
        </p>
      )}
      {bare.length > 0 && (
        <ul className="divide-y divide-line">
          {bare.map((s) => (
            <li key={`${s.name}-${s.distanceM}`} className="flex min-h-11 items-center gap-3 py-1.5" data-kind="static">
              <span className="min-w-0 flex-1 text-copy text-ink [overflow-wrap:anywhere]">
                {s.name}
              </span>
              {distanceText(s.distanceM, lang) && <span className="num shrink-0 text-meta text-ink-faint">{distanceText(s.distanceM, lang)}</span>}
              <span className="shrink-0 text-meta text-ink-muted">{t.noTimetable}</span>
            </li>
          ))}
        </ul>
      )}
      {leave != null && (
        <p className="num mt-1 text-[1.25rem] font-medium text-ink">{leave <= 0 ? t.leaveNow : fill(t.leaveIn, { n: leave })}</p>
      )}
      {rows.length > 0 && (
        <ul className="mt-2 divide-y divide-line">
          {rows.map(({ d, left }) => {
            const m = Math.floor(left);
            return (
              <li key={`${d.route}-${d.at}-${d.minutes}`} className="flex min-h-11 items-center gap-3 py-1.5" data-kind={d.kind}>
                <span
                  className="num min-w-9 shrink-0 rounded-md bg-surface-3 px-1.5 py-0.5 text-center text-meta text-ink"
                  style={hex(d.color) ? { boxShadow: `inset 3px 0 0 ${hex(d.color)}` } : undefined}
                >
                  {d.route}
                </span>
                <span className="min-w-0 flex-1 text-copy text-ink [overflow-wrap:anywhere]">
                  {d.headsign ?? ""}
                </span>
                <span className="flex shrink-0 items-center gap-1.5 text-right">
                  {d.kind === "live" && <LiveDot />}
                  <span className={cn("num text-copy font-medium", d.kind === "live" ? "text-live" : d.kind === "scheduled" ? "text-sched" : "text-ink underline decoration-dashed")}>
                    {m < 1 ? t.due : `${m} ${t.min}`}
                  </span>
                  <span className="text-meta text-ink-faint">{t[d.kind]}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {live > 0 && (
        <p className="mt-2 flex items-center gap-2 text-meta text-ink-muted">
          <LiveDot />
          {fill(t.liveBuses, { n: live }, lang)}
        </p>
      )}
    </Card>
  );
}
