// The forecast strip under the hero (spec: HourlyStrip { hours, locale }). Hours scroll sideways (the
// only sideways scroller on the page); the chance of rain sets the icon's opacity and is also said in
// words. With no hourly data it shows the 3-day forecast instead, never invented hours.

import { Cloud, CloudDrizzle, CloudFog, CloudHail, CloudLightning, CloudMoon, CloudRain, CloudSnow, CloudSun, Moon, Sun, type LucideIcon } from "lucide-react";
import type { AmbientDay, AmbientHour, SkyKind } from "@/lib/ambient-types";
import { HTML_LANG, type Lang } from "@/lib/lang";
import { sunPosition } from "@/lib/sun";
import { dateFormat } from "@/components/v6/Card";
import { fill, textFor } from "@/components/v6/text";
import { temp } from "@/lib/utils";

const ICON: Record<SkyKind, LucideIcon> = {
  clear: Sun, partly: CloudSun, cloudy: Cloud, fog: CloudFog, drizzle: CloudDrizzle, rain: CloudRain,
  storm: CloudLightning, snow: CloudSnow, sleet: CloudSnow, hail: CloudHail,
};

export function skyIcon(kind: SkyKind, isDay = true): LucideIcon {
  if (!isDay && kind === "clear") return Moon;
  if (!isDay && kind === "partly") return CloudMoon;
  return ICON[kind] ?? Cloud;
}

interface HourlyStripProps {
  lang: Lang;
  hours?: AmbientHour[] | null;
  /** Used when `hours` is empty: the first 3 days. */
  days?: AmbientDay[] | null;
  timeZone?: string | null;
  imperial?: boolean;
  /** The place: night hours then get a moon instead of a sun. */
  coords?: { lat: number; lng: number } | null;
  /** Epoch ms: hours that have ended are dropped and the current one reads "Now". Null before hydration. */
  now?: number | null;
}

const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
const pct = (n: unknown) => (finite(n) ? Math.round(Math.min(100, Math.max(0, n))) : null);

export function HourlyStrip({ lang, hours, days, timeZone, imperial = false, coords, now = null }: HourlyStripProps) {
  const t = textFor(lang);
  const locale = HTML_LANG[lang] ?? "en";
  const tz = timeZone || undefined;
  const fmt = (opts: Intl.DateTimeFormatOptions, d: Date) => dateFormat(locale, tz, opts).format(d);
  // A cached snapshot can start hours ago: drop the hours that have ended.
  const hourly = (hours ?? []).filter((h) => finite(h.tempC) && Date.parse(h.time) + 3_600_000 > (now ?? -Infinity)).slice(0, 24);
  // Mid-hour sun above the horizon (refraction included); unknown place: day icons.
  const isDay = (iso: string) => !coords || sunPosition(new Date(Date.parse(iso) + 1_800_000), coords.lat, coords.lng).altDeg > -0.833;
  const cells = hourly.length
    ? hourly.map((h, i) => ({
        key: h.time,
        label: i === 0 && now != null && Date.parse(h.time) <= now ? t.now : fmt({ hour: "2-digit", minute: "2-digit", hourCycle: "h23" }, new Date(h.time)),
        kind: h.kind,
        isDay: isDay(h.time),
        value: temp(h.tempC, imperial, false),
        precip: pct(h.precipChance),
      }))
    : (days ?? []).slice(0, 3).map((d) => ({
        key: d.date,
        // Noon UTC keeps the calendar date in every zone.
        label: fmt({ weekday: "short" }, new Date(`${d.date}T12:00:00Z`)),
        kind: d.kind,
        isDay: true,
        value: `${temp(d.maxC, imperial, false)} / ${temp(d.minC, imperial, false)}`,
        precip: pct(d.precipChance),
      }));
  if (!cells.length) return null;
  return (
    <div className="min-w-0">
      {!hourly.length && <p className="mb-1 text-meta text-ink-muted">{t.nextDays}</p>}
      {/* The scroller is focusable and named so keyboard users can scroll it (Safari, WCAG 2.1.1). */}
      <div role="region" aria-label={hourly.length ? t.hourly : t.nextDays} tabIndex={0} className="v6-scroll-x -mx-1 snap-x overflow-x-auto px-1 pb-1">
      <ol className="flex gap-1" data-mode={hourly.length ? "hourly" : "days"}>
        {cells.map((c) => {
          const Icon = skyIcon(c.kind, c.isDay);
          return (
            <li key={c.key} className="flex min-w-[76px] flex-1 snap-start flex-col items-center gap-1 py-1 text-center">
              <span className="num text-meta text-ink-muted">{c.label}</span>
              <span className="flex items-center gap-1.5">
                <Icon aria-hidden className="size-5" style={{ opacity: c.precip == null ? 1 : 0.55 + (0.45 * c.precip) / 100 }} />
                <span className="num text-[1.0625rem] font-medium text-ink">{c.value}</span>
                <span className="sr-only">{t.kinds[c.kind]}</span>
              </span>
              {c.precip != null && <span className="num text-meta text-ink-muted">{fill(t.rainPct, { n: c.precip })}</span>}
            </li>
          );
        })}
      </ol>
      </div>
    </div>
  );
}
