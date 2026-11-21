// Tomorrow's sunrise (spec: DaylightCard): sunrise and sunset tomorrow at the place, in its time zone,
// and how much longer or shorter the day is than today, all calculated from the sun's position
// (lib/sun.ts, NOAA). Polar day or night is said, not drawn as a time. Plus the Auto scene switch
// with a line on what it changes.

import { useMemo } from "react";
import { Sunrise } from "lucide-react";
import type { AmbientPhoto } from "@/lib/ambient-types";
import { HTML_LANG, type Lang } from "@/lib/lang";
import { sunPosition } from "@/lib/sun";
import { cn, httpsUrl } from "@/lib/utils";
import { Card, dateFormat, type CardState } from "@/components/v6/Card";
import { fill, textFor } from "@/components/v6/text";

/** Sun's centre at the horizon with standard refraction. */
const H0 = -0.833;
const STEP = 600_000;

type Event = { t: number; rise: boolean };

function crossings(from: number, to: number, lat: number, lng: number): Event[] {
  const above = (t: number) => sunPosition(new Date(t), lat, lng).altDeg >= H0;
  const out: Event[] = [];
  let prev = above(from);
  for (let t = from + STEP; t <= to; t += STEP) {
    const cur = above(t);
    if (cur !== prev) {
      let [lo, hi] = [t - STEP, t];
      while (hi - lo > 15_000) {
        const mid = (lo + hi) / 2;
        if (above(mid) === prev) lo = mid;
        else hi = mid;
      }
      out.push({ t: Math.round((lo + hi) / 2), rise: cur });
    }
    prev = cur;
  }
  return out;
}

/** The calendar day of `t` in the place's zone (cached formatter: sunTimes asks about 30 times). */
const dayKey = (t: number, timeZone: string | null) => dateFormat("en-CA", timeZone, {}).format(t);

/** Tomorrow's sunrise and sunset (epoch ms, null when the sun does not rise or set) and the change in day length versus today, in minutes. */
export function sunTimes(now: number, lat: number, lng: number, timeZone: string | null): { rise: number | null; set: number | null; deltaMin: number | null } {
  const events = crossings(now - 36 * 3600_000, now + 60 * 3600_000, lat, lng);
  const [today, tomorrow] = [dayKey(now, timeZone), dayKey(now + 86_400_000, timeZone)];
  const on = (key: string) => {
    const rise = events.find((e) => e.rise && dayKey(e.t, timeZone) === key)?.t ?? null;
    const set = events.find((e) => !e.rise && dayKey(e.t, timeZone) === key && (rise == null || e.t > rise))?.t ?? null;
    return { rise, set, len: rise != null && set != null ? set - rise : null };
  };
  const [a, b] = [on(today), on(tomorrow)];
  return { rise: b.rise, set: b.set, deltaMin: a.len != null && b.len != null ? Math.round((b.len - a.len) / 60_000) : null };
}

interface SunCardProps {
  lang: Lang;
  now: number | null;
  coords: { lat: number; lng: number } | null;
  timeZone: string | null;
  /** The city photo, shown warm at the top as in the reference. */
  photo?: AmbientPhoto | null;
  autoScene: boolean;
  onAutoScene: (on: boolean) => void;
  state?: CardState;
  index?: number;
  className?: string;
}

export function SunCard({ lang, now, coords, timeZone, photo, autoScene, onAutoScene, state = "ready", index, className }: SunCardProps) {
  const t = textFor(lang);
  const lat = coords?.lat, lng = coords?.lng;
  // Worked out once per 10 minutes and place (about 600 sun positions), not on every render.
  const bucket = now == null ? null : Math.floor(now / STEP);
  const times = useMemo(
    () => (bucket != null && lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng) ? sunTimes(bucket * STEP, lat, lng, timeZone) : null),
    [bucket, lat, lng, timeZone],
  );
  const clock = (ms: number) => dateFormat(HTML_LANG[lang] ?? "en", timeZone, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(ms);
  const img = httpsUrl(photo?.url);
  const d = times?.deltaMin;
  // No clock yet: loading; no place: nothing to calculate.
  const shownState: CardState = state === "ready" && !times ? (now == null ? "loading" : "empty") : state;

  return (
    <Card
      title={t.sunrise}
      icon={<Sunrise />}
      lang={lang}
      state={shownState}
      prov={{ source: t.noaaFormula, ageS: null, kind: "calculated" }}
      index={index}
      className={cn("overflow-hidden", className)}
      footer={
        <div className="mt-2 border-t border-line pt-3">
          <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 text-copy text-ink">
            {t.autoScene}
            <button
              type="button"
              role="switch"
              aria-checked={autoScene}
              onClick={() => onAutoScene(!autoScene)}
              className={cn("press relative h-7 w-12 shrink-0 rounded-full border border-line transition-colors", autoScene ? "bg-accent" : "bg-surface-3")}
            >
              <span aria-hidden className={cn("absolute top-1/2 size-5 -translate-y-1/2 rounded-full transition-[left]", autoScene ? "left-6 bg-on-accent" : "left-1 bg-ink-muted")} />
            </button>
          </label>
          <p className="text-meta text-ink-faint">{t.autoWhy}</p>
        </div>
      }
    >
      {img && (
        // eslint-disable-next-line @next/next/no-img-element -- the same remote city photo as the hero
        <img src={img} alt="" aria-hidden title={photo?.attribution?.name || undefined} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={(e) => (e.currentTarget.hidden = true)} className="v6-sunrise-photo -mx-5 -mt-1 mb-3 h-20 w-[calc(100%+2.5rem)] max-w-none object-cover" />
      )}
      {times?.rise != null ? (
        <>
          <time dateTime={new Date(times.rise).toISOString()} className="num block text-[3rem] leading-none font-light text-ink">
            {clock(times.rise)}
          </time>
          {times.set != null && (
            <p className="num mt-2 text-copy text-ink-muted">
              {t.sunset} {clock(times.set)}
            </p>
          )}
          {d != null && (
            <p className="num text-meta text-ink-muted">
              {t.daylight}: {d > 0 ? fill(t.longer, { n: d }) : d < 0 ? fill(t.shorter, { n: -d }) : t.same}
            </p>
          )}
        </>
      ) : (
        times && <p className="text-copy text-ink-muted">{t.noSunrise}</p>
      )}
    </Card>
  );
}
