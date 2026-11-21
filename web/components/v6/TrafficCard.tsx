// Live traffic (replaces the old "nearest taxi" readout). Erdenet: the city's traffic cameras (vehicle
// counts and load, Орхон ТКХДТ), with the busiest roads and their own ages. Elsewhere: Google's traffic
// level on a probe route, labelled Estimated. No data: said by name. "Live cameras" opens the one camera
// sheet (components/aspire/CameraSheet: Erdenet, Ulaanbaatar, government cameras, YouTube live, OSM).

import type { ReactNode } from "react";
import { CarFront, Video } from "lucide-react";
import type { AmbientTraffic, TrafficLevel } from "@/lib/ambient-types";
import type { Load, Traffic } from "@/lib/erdenet-city";
import type { Lang } from "@/lib/lang";
import { cn } from "@/lib/utils";
import { Card, ageS, ageText, type CardState, type Provenance } from "@/components/v6/Card";
import { fill, named, textFor } from "@/components/v6/text";

/** Counts older than this are left out of the totals (matches the server's summary). */
export const FRESH_S = 600;
const GOOGLE_LOAD: Record<TrafficLevel, Load> = { light: "low", moderate: "medium", heavy: "high" };
const TONE: Record<Load, string> = { low: "bg-live", medium: "bg-warn", high: "bg-danger" };

function LoadMeter({ load, label }: { load: Load; label: string }) {
  const n = load === "low" ? 1 : load === "medium" ? 2 : 3;
  return (
    <span className="flex items-center gap-2">
      <span aria-hidden className="flex gap-1">
        {[1, 2, 3].map((i) => (
          <span key={i} className={cn("h-2 w-5 rounded-full", i <= n ? TONE[load] : "bg-surface-3")} />
        ))}
      </span>
      <span className="text-[1.25rem] font-medium text-ink">{label}</span>
    </span>
  );
}

const freshCameras = (traffic: Traffic | null | undefined, now: number | null) => (traffic?.cameras ?? []).filter((c) => (ageS(c.detectedAt, now) ?? Infinity) <= FRESH_S);

/**
 * The source line the card shows (also the agent's Traffic chip): the city cameras while any is fresh
 * (Live), else Google's probe route (Estimated), else the quiet cameras ("No data"), else nothing.
 */
export function trafficProvenance(traffic: Traffic | null | undefined, google: AmbientTraffic | null | undefined, googleAt: string | null | undefined, credit: string | null | undefined, now: number | null): Provenance | null {
  const fresh = freshCameras(traffic, now);
  if (traffic && (fresh.length || !google)) return { source: credit ?? "", ageS: ageS(traffic.summary.updatedAt, now), kind: fresh.length ? "live" : "none" };
  return google ? { source: "Google", ageS: ageS(googleAt, now), kind: "estimated" } : null;
}

/** The live-cameras control: opens the camera sheet for the place shown; nothing without a place. */
export function CamerasButton({ lang, onOpen }: { lang: Lang; onOpen?: () => void }) {
  if (!onOpen) return null;
  return (
    <button type="button" onClick={onOpen} className="press v6-chip min-h-11 shrink-0 gap-2 px-3">
      <Video aria-hidden className="size-4" />
      {textFor(lang).cameras}
    </button>
  );
}

interface TrafficCardProps {
  lang: Lang;
  now: number | null;
  city?: string | null;
  /** /api/city traffic (Erdenet cameras). */
  traffic?: Traffic | null;
  credit?: string | null;
  /** The city feed should have answered but did not. */
  down?: boolean;
  /** /api/ambient traffic (Google), and when that snapshot was taken. */
  google?: AmbientTraffic | null;
  googleAt?: string | null;
  /** Opens the camera sheet; omit when the place is not known. */
  onCameras?: () => void;
  /** Under the card (e.g. Erdenet's parking and fuel). */
  footer?: ReactNode;
  state?: CardState;
  index?: number;
  onRetry?: () => void;
  className?: string;
}

export function TrafficCard({ lang, now, city, traffic, credit, down = false, google, googleAt, onCameras, footer, state = "ready", index, onRetry, className }: TrafficCardProps) {
  const t = textFor(lang);
  const action = <CamerasButton lang={lang} onOpen={onCameras} />;
  const none = named(t.noTraffic, city, t.empty);
  const card = (prov: Provenance | null, body: ReactNode, s: CardState = state) => (
    <Card title={t.traffic} icon={<CarFront />} lang={lang} state={s} prov={prov} onRetry={onRetry} index={index} action={action} emptyText={none} footer={footer} className={className}>
      {body}
    </Card>
  );
  const downNote = down && <p role="status" className="text-copy text-ink-muted">{t.notAnswering}</p>;

  const fresh = freshCameras(traffic, now);
  const googleLoad = google ? GOOGLE_LOAD[google.level] : undefined;
  const prov = trafficProvenance(traffic, googleLoad ? google : null, googleAt, credit, now);

  // City cameras first; when every camera has gone quiet, Google's estimate (if any) is more use.
  if (traffic && (fresh.length || !googleLoad)) {
    const { summary } = traffic;
    const counted = fresh.reduce((n, c) => n + (c.vehicles ?? 0), 0);
    // The server's level is only as good as its cameras: if none is still fresh by our clock
    // (a cached or offline snapshot), the level is not claimed.
    const level = fresh.some((c) => c.load) ? summary.level : null;
    const busiest = level ? summary.busiest.map((name) => fresh.find((c) => c.name === name)).filter((c): c is NonNullable<typeof c> => !!c) : [];
    // Wide screens: the load on the left, the busiest roads beside it (one band under the hero).
    return card(
      prov,
      <div className="xl:flex xl:items-start xl:gap-10">
        <div className="shrink-0">
          {level ? <LoadMeter load={level} label={t.load[level]} /> : !fresh.length && <p className="text-copy text-ink-muted">{none}</p>}
          {fresh.length > 0 && <p className="num mt-1 text-meta text-ink-muted">{fill(t.vehicles, { n: counted }, lang)}</p>}
        </div>
        {busiest.length > 0 && (
          <div className="min-w-0 flex-1">
            <h3 className="mt-3 text-meta text-ink-faint xl:mt-0">{t.busiest}</h3>
            <ul className="divide-y divide-line">
              {busiest.map((c) => {
                const a = ageS(c.detectedAt, now);
                return (
                  <li key={c.id} className="flex min-h-10 items-center gap-2 py-1">
                    <span lang="mn" className="min-w-0 flex-1 truncate text-copy text-ink" title={c.name}>
                      {c.name}
                    </span>
                    {c.load && <span className="shrink-0 text-meta text-ink-muted">{t.load[c.load]}</span>}
                    {c.vehicles != null && <data value={c.vehicles} className="num shrink-0 text-copy text-ink">{c.vehicles}</data>}
                    {a != null && <span className="num shrink-0 text-meta text-ink-faint">{ageText(a, lang)}</span>}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>,
    );
  }
  if (google && googleLoad) {
    const load = googleLoad;
    const delay = Math.round(google.delayMin);
    return card(
      prov,
      <>
        {downNote}
        <LoadMeter load={load} label={t.load[load]} />
        {delay >= 1 && <p className="num mt-1 text-copy text-ink-muted">{fill(t.delay, { n: delay })}</p>}
      </>,
    );
  }
  if (down) return card(null, downNote);
  return card(null, null, state === "ready" ? "empty" : state);
}
