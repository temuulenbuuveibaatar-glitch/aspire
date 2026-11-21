"use client";

// The hero (spec: Hero): the city photo with its credit, the live weather drawn over it (Sky overlay,
// only when real weather backs the sky), place picker, city name, big temperature, condition,
// feels-like, high and low, the clock and date in the place's time zone, the forecast strip and
// "Open city map". Text sits on a scrim plus a soft text shadow (globals.css .v6-scrim, .v6-on-photo).

import { useState } from "react";
import { ArrowRight, Camera, ChevronDown, Map as MapIcon, MapPin } from "lucide-react";
import type { AmbientPhoto, AmbientSky, AmbientWeather } from "@/lib/ambient-types";
import { HTML_LANG, type Lang } from "@/lib/lang";
import { Sky, safeKind } from "@/components/aspire/Sky";
import { dateFormat, PROVIDER, ProvenanceLine, Skeleton, type CardState, type Provenance } from "@/components/v6/Card";
import { HourlyStrip } from "@/components/v6/HourlyStrip";
import { textFor } from "@/components/v6/text";
import { httpsUrl, temp } from "@/lib/utils";

const GOOGLE_HOST = /(^|\.)(googleusercontent|googleapis|google)\.com$/;

interface HeroCardProps {
  lang: Lang;
  place: string | null;
  sky: AmbientSky;
  weather: AmbientWeather | null;
  photo: AmbientPhoto | null | undefined;
  /** Shown when `photo` fails to load (the photo kept on this device). */
  fallback?: AmbientPhoto | null;
  /** A photo URL that failed to load (so a broken kept photo is dropped, not shown again next open). */
  onPhotoError?: (url: string) => void;
  timeZone: string | null;
  /** Epoch ms from the parent's clock; null before the client has read it (no clock is drawn then). */
  now: number | null;
  /** The place: the forecast strip then knows day from night. */
  coords?: { lat: number; lng: number } | null;
  imperial?: boolean;
  /** Weather source and age. */
  prov?: Provenance | null;
  state?: CardState;
  /** Draw rain, snow and fog over the photo (off under Calm mode or on low-end devices). */
  effects?: boolean;
  onOpenMap: () => void;
  onPlace?: () => void;
}

/** Clock, date and zone label for `now` in `timeZone` (falls back to the device zone on a bad name). */
export function placeClock(now: number, timeZone: string | null, lang: Lang): { time: string; date: string; zone: string } {
  const locale = HTML_LANG[lang] ?? "en";
  const make = (opts: Intl.DateTimeFormatOptions) => dateFormat(locale, timeZone, opts);
  const d = new Date(now);
  const zone = make({ timeZoneName: "short" }).formatToParts(d).find((p) => p.type === "timeZoneName")?.value ?? "";
  return { time: make({ hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d), date: make({ weekday: "short", day: "numeric", month: "short" }).format(d), zone };
}

export function HeroCard({ lang, place, sky, weather, photo, fallback, onPhotoError, timeZone, now, coords, imperial = false, prov, state = "ready", effects = true, onOpenMap, onPlace }: HeroCardProps) {
  const t = textFor(lang);
  // URLs that failed to load: the next candidate shows instead, never a blank hero while one is left.
  const [failed, setFailed] = useState<string[]>([]);
  const pick = [photo, fallback].find((p) => {
    const u = httpsUrl(p?.url);
    return !!u && !failed.includes(u);
  });
  const shown = httpsUrl(pick?.url);
  const creditName = String(pick?.attribution?.name ?? "").trim().slice(0, 80);
  const creditUri = httpsUrl(pick?.attribution?.uri);
  const google = !!shown && GOOGLE_HOST.test(new URL(shown).hostname);
  const [city, ...rest] = (place ?? "").split(",").map((s) => s.trim());
  const today = weather?.days?.[0];
  const clock = now != null ? placeClock(now, timeZone, lang) : null;
  // The scene is "weather-synced" only when real weather backs the sky and it is actually drawn.
  const synced = effects && sky.known !== false;
  const hourlyFrom = weather?.hourly?.length && weather.hourlySource && weather.hourlySource !== weather.source ? weather.hourlySource : null;

  return (
    <section
      aria-label={city || t.overview}
      data-state={state}
      className="v6-enter relative isolate flex min-h-[320px] flex-col overflow-hidden rounded-[var(--radius-xl)] border border-line bg-surface shadow-panel md:min-h-[440px]"
    >
      {/* Photo, weather and scrim: decoration, behind the text. */}
      <div aria-hidden className="absolute inset-0 -z-10">
        {shown && (
          // eslint-disable-next-line @next/next/no-img-element -- remote per-place photo
          <img
            key={shown}
            src={shown}
            alt=""
            decoding="async"
            fetchPriority="high"
            referrerPolicy="no-referrer"
            onError={() => {
              setFailed((f) => [...f, shown]);
              onPhotoError?.(shown);
            }}
            className="v6-photo absolute inset-0 h-full w-full object-cover"
          />
        )}
        {/* No photo: the sky itself fills the card (a still clear sky when no weather backs it). */}
        {(synced || !shown) && (
          <Sky overlay={!!shown} className={shown ? undefined : "absolute"} kind={synced ? safeKind(sky.kind) : "clear"} intensity={synced ? sky.intensity : 0} isDay={sky.isDay} windKph={synced ? sky.windKph : 0} cloudCover={synced ? sky.cloudCover : null} />
        )}
        <div className="v6-scrim absolute inset-0" />
      </div>

      <div className="v6-on-photo flex flex-1 flex-col gap-4 p-5 md:p-7">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            {place && (
              <button type="button" onClick={onPlace} disabled={!onPlace} className="press -ml-2 flex min-h-11 max-w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 text-copy text-ink">
                <MapPin aria-hidden className="size-4 shrink-0" />
                <span className="truncate" title={place}>
                  {place}
                </span>
                {onPlace && <ChevronDown aria-hidden className="size-4 shrink-0" />}
              </button>
            )}
            {synced && (
              <p className="mt-1 flex items-center gap-2 text-meta tracking-wide text-ink-muted uppercase">
                <span aria-hidden className="size-1.5 rounded-full bg-accent" />
                {t.scene}
              </p>
            )}
          </div>
          {clock && (
            <p className="min-w-0 max-w-[45%] text-right">
              <time className="num block text-clock text-ink">{clock.time}</time>
              <span className="num block text-meta tracking-wide text-ink-muted uppercase">
                {clock.date}
                {/* Phones: the zone is in the footer, so the place picker keeps its width. */}
                {clock.zone && <span className="hidden sm:inline"> · {clock.zone}</span>}
              </span>
            </p>
          )}
        </div>

        {city && (
          <div>
            <h1 className="text-city text-ink [overflow-wrap:anywhere]" title={rest.length ? place ?? undefined : undefined}>
              {city}
            </h1>
            <p className="text-copy text-ink-muted">{t.tagline}</p>
          </div>
        )}

        <div className="mt-auto flex flex-wrap items-end justify-between gap-4">
          {state === "loading" ? (
            <Skeleton rows={1} />
          ) : weather ? (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <data value={weather.tempC} className="text-temp text-ink">
                {temp(weather.tempC, imperial, false)}
              </data>
              <div className="min-w-0">
                <p className="text-[1.25rem] font-medium text-ink">{weather.text || t.kinds[safeKind(sky.kind)]}</p>
                <p className="num text-copy text-ink-muted">
                  {t.feels} {temp(weather.feelsC, imperial, false)}
                  {today && (
                    <>
                      <span aria-hidden> · </span>
                      {t.high} {temp(today.maxC, imperial, false)} {t.low} {temp(today.minC, imperial, false)}
                    </>
                  )}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-copy text-ink-muted">{t.noWeather}</p>
          )}
          <button type="button" onClick={onOpenMap} data-on-accent className="press flex min-h-11 items-center gap-2 rounded-[var(--radius-sm)] bg-accent px-4 text-copy font-medium text-on-accent">
            <MapIcon aria-hidden className="size-4" />
            {t.openMap}
            <ArrowRight aria-hidden className="size-4" />
          </button>
        </div>

        <HourlyStrip lang={lang} hours={weather?.hourly} days={weather?.days} timeZone={timeZone} imperial={imperial} coords={coords} now={now} />

        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          {prov && <ProvenanceLine prov={prov} lang={lang} className="text-ink-muted" />}
          {/* The hourly strip from another provider (Google without hours: Open-Meteo) says so. */}
          {prov && hourlyFrom && <ProvenanceLine prov={{ source: `${t.hourly}: ${PROVIDER[hourlyFrom]}`, ageS: prov.ageS, kind: "estimated" }} lang={lang} className="text-ink-muted" />}
          {shown && (creditName || google) && (
            <p className="flex min-w-0 items-center gap-1.5 text-meta text-ink-muted">
              <Camera aria-hidden className="size-3.5 shrink-0" />
              <span className="sr-only">{t.photo}:</span>
              {creditName &&
                (creditUri ? (
                  <a href={creditUri} target="_blank" rel="noopener noreferrer" className="truncate underline">
                    {creditName}
                  </a>
                ) : (
                  <span className="truncate">{creditName}</span>
                ))}
              {google && creditName !== "Google Maps" && <span className="shrink-0">{creditName ? "· " : ""}Google Maps</span>}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
