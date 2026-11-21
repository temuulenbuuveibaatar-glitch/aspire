"use client";

// Layers 0-2 (docs/design/aspire-v4-hud.md section 2), bottom to top: a generated skyline under the
// sky's own gradient (always there, so a missing photo never leaves a plain screen); the city photo,
// shown at once from this device's cache and crossfaded when a new one has loaded; the time-of-day
// grade (CSS filters on the photo plus a light wash, from the real sun at the place, else its local
// hour); a soft sun glow; scrims for text contrast; then the live weather (Sky overlay), only when real
// weather backs it. The photo credit (required by Google and Wikimedia) sits bottom-left above it all.
// Until the time is known (server render, hydration) only the plain base shows, never a guessed "day".
// Reduced motion or Calm mode: no fades, no slow zoom, and Sky draws one still frame.

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { Camera } from "lucide-react";
import type { AmbientSky } from "@/lib/ambient-types";
import { getTier, Sky, safeKind, skyColors, skyFamily, type Family } from "@/components/aspire/Sky";
import { useStill } from "@/lib/display-prefs";
import { DARK, skySun, type SkyPhase } from "@/lib/sun";
import { forgetPhoto, useCachedPhoto } from "@/lib/use-ambient";

interface BackdropPhoto {
  url: string;
  attribution: { name: string; uri: string };
}

interface BackdropProps {
  photo: BackdropPhoto | null;
  sky: AmbientSky;
  localHour: number | null;
  effects: boolean;
  /** Translated "Photo" for the credit (screen readers otherwise hear only the name). */
  label?: string;
  /** The place's position: the grade then follows the real sun there. */
  coords?: { lat: number; lng: number } | null;
  /** The place the photo is of (Ambient.place). A cached photo of another place is not shown. */
  place?: string | null;
  /** Demo override of the time of day (`phaseParam(location.search)`, ?time=sunset). */
  phase?: SkyPhase | null;
  /** The first snapshot has arrived: from then on a cached photo shows only for the same place. */
  loaded?: boolean;
  /** Told whether the photo credit is on screen (the composer keeps clear of it). */
  onCredit?: (shown: boolean) => void;
}

/** Trust boundary: only https URLs reach an img src or a link (protocol-relative ones are upgraded). */
export function httpsUrl(u: unknown): string | null {
  if (typeof u !== "string" || !u) return null;
  try {
    const p = new URL(u.startsWith("//") ? `https:${u}` : u);
    return p.protocol === "https:" ? p.href : null;
  } catch {
    return null;
  }
}

const COARSE: Record<SkyPhase, "night" | "dusk" | "day"> = {
  midnight: "night", night: "night", evening: "night", dawn: "night", dusk: "night",
  sunrise: "dusk", golden: "dusk", sunset: "dusk", day: "day", afternoon: "day",
};

/** Per phase: a CSS filter on the photo and a light wash over it (warm low sun, blue hour, dark night). */
const GRADE: Record<SkyPhase, [filter: string, wash: string]> = {
  midnight: ["brightness(0.5) saturate(0.62) hue-rotate(-12deg)", "linear-gradient(180deg, rgb(4 8 24 / 0.45), rgb(4 10 30 / 0.22) 55%, rgb(2 4 12 / 0.4))"],
  night: ["brightness(0.55) saturate(0.68) hue-rotate(-10deg)", "linear-gradient(180deg, rgb(6 10 30 / 0.42), rgb(8 14 36 / 0.2) 55%, rgb(2 4 12 / 0.36))"],
  evening: ["brightness(0.56) saturate(0.75) hue-rotate(-8deg)", "linear-gradient(180deg, rgb(10 14 40 / 0.5), rgb(30 22 56 / 0.25) 65%, rgb(255 150 90 / 0.1))"],
  dawn: ["brightness(0.68) saturate(0.8) hue-rotate(-6deg)", "linear-gradient(180deg, rgb(30 40 92 / 0.45), rgb(190 120 150 / 0.16) 70%, rgb(255 170 130 / 0.24))"],
  sunrise: ["brightness(0.95) saturate(1.1) sepia(0.12)", "linear-gradient(0deg, rgb(255 170 90 / 0.28), rgb(255 200 150 / 0.08) 50%, rgb(90 100 170 / 0.16))"],
  day: ["brightness(1) saturate(1.05) contrast(1.02)", "linear-gradient(180deg, rgb(120 170 230 / 0.1), rgb(0 0 0 / 0) 45%)"],
  afternoon: ["brightness(1.02) saturate(1.08) sepia(0.06)", "linear-gradient(180deg, rgb(255 225 180 / 0.08), rgb(255 210 150 / 0.06))"],
  golden: ["brightness(0.98) saturate(1.2) sepia(0.22) hue-rotate(-6deg)", "linear-gradient(0deg, rgb(255 150 60 / 0.3), rgb(255 190 120 / 0.12) 55%, rgb(255 210 160 / 0.05))"],
  sunset: ["brightness(0.82) saturate(1.25) sepia(0.25) hue-rotate(-12deg)", "linear-gradient(180deg, rgb(60 40 110 / 0.35), rgb(230 100 90 / 0.22) 55%, rgb(255 130 60 / 0.35))"],
  dusk: ["brightness(0.62) saturate(0.85) hue-rotate(-14deg)", "linear-gradient(180deg, rgb(20 30 90 / 0.5), rgb(60 70 150 / 0.3) 60%, rgb(200 110 130 / 0.18))"],
};
/** Weather on top of the time grade, and how much sun or moon gets through. */
const WEATHER: Record<Family, [filter: string, light: number]> = {
  clear: ["", 1],
  cloud: [" saturate(0.75) contrast(0.92)", 0.5],
  fog: [" saturate(0.6) contrast(0.85) brightness(1.04)", 0.35],
  rain: [" brightness(0.82) saturate(0.8)", 0.2],
  snow: [" brightness(1.04) saturate(0.72) hue-rotate(8deg)", 0.3],
  storm: [" brightness(0.64) saturate(0.75)", 0.12],
};

/** The glow: the sun from the left in the morning to the right in the evening, low and warm near the horizon. No moon: its position and phase are not computed. */
function glow(phase: SkyPhase, altDeg: number, haDeg: number, light: number): string | null {
  if (DARK.has(phase) || altDeg < -8 || light <= 0) return null;
  const x = 50 + Math.max(-1, Math.min(1, haDeg / 110)) * 38;
  const y = Math.max(8, Math.min(78, 66 - altDeg * 1.3));
  const warm = altDeg < 10;
  const c = warm ? "255 165 90" : "255 240 210";
  const k = light * (altDeg < -3 ? 0.5 : 1);
  return `radial-gradient(${warm ? "75vmax 55vmax" : "55vmax 45vmax"} at ${x.toFixed(1)}% ${y.toFixed(1)}%, rgb(${c} / ${(0.55 * k).toFixed(3)}) 0%, rgb(${c} / ${(0.2 * k).toFixed(3)}) 18%, rgb(${c} / 0) 60%)`;
}

/* ---- the default skyline (no photo yet, or none to be had): generated once, deterministic ---- */

function skyline(seed: number, lo: number, hi: number, minW: number, maxW: number, lit: number): [outline: string, windows: string] {
  let s = seed;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  let d = "M0 900";
  let win = "";
  for (let x = 0; x < 1600; ) {
    const w = Math.round(minW + r() * (maxW - minW));
    const top = Math.round(900 - lo - r() * (hi - lo));
    d += `V${top}H${x + w}`;
    for (let y = top + 14; lit && y < 880; y += 22) for (let cx = x + 8; cx < x + w - 10; cx += 16) if (r() < lit) win += `M${cx} ${y}h5v7h-5z`;
    x += w;
  }
  return [`${d}V900Z`, win];
}
const FAR = skyline(7, 150, 380, 40, 110, 0);
const NEAR = skyline(11, 70, 250, 34, 92, 0.14);
/** How lit the windows are, by phase. */
const LIGHTS: Partial<Record<SkyPhase, number>> = { midnight: 0.5, night: 0.4, evening: 0.6, dusk: 0.45, dawn: 0.3, sunset: 0.15 };

/* ---- clock: a new minute moves the real sun (null on the server, so hydration matches) ---- */

const subscribeMinute = (cb: () => void) => {
  const id = window.setInterval(cb, 30_000);
  return () => window.clearInterval(id);
};
const nowMinute = () => Math.floor(Date.now() / 60_000);
const noop = () => () => {};

/** google: the photo comes from Google (its credit line must say so); a Wikimedia one carries its own credit. */
type Shown = { url: string; name: string; uri: string | null; google: boolean };
const GOOGLE_HOST = /(^|\.)(googleusercontent|googleapis|google)\.com$/;

export function Backdrop({ photo, sky, localHour, effects, label, coords, place, phase: override, loaded = false, onCredit }: BackdropProps) {
  // A sky no weather backs (known === false) is not a claim: neutral, with no stars, sun glow or particles.
  const known = sky.known !== false;
  const kind = known ? safeKind(sky.kind) : "clear";
  const family = skyFamily(kind);
  const still = useStill();
  const lowTier = useSyncExternalStore(noop, getTier, () => 1) < 1;
  const minute = useSyncExternalStore(subscribeMinute, nowMinute, () => null);
  // Nothing about the time yet (server render, hydration): draw no grade rather than a guessed "day".
  const timed = minute != null || localHour != null || override != null;
  const sun = skySun({ at: minute == null ? null : new Date(minute * 60_000), coords, hour: localHour, isDay: sky.isDay !== false, override });
  const [filter, wash] = GRADE[sun.phase];
  // The first grade once the clock is known lands at once; later phase changes fade.
  const [washes, setWashes] = useState({ prev: wash, cur: wash, clock: minute != null });
  if (washes.cur !== wash || (!washes.clock && minute != null)) setWashes({ prev: washes.clock ? washes.cur : wash, cur: wash, clock: minute != null });
  const [weatherFilter, weatherLight] = WEATHER[family];
  const light = known ? weatherLight : 0;
  const [top, horizon] = skyColors(kind, sun.phase);
  const ms = still ? 0 : 1400;

  // The photo: the given one, else this device's last good one: before the first snapshot, then only for the same place.
  const cached = useCachedPhoto();
  const usable = (p: { url: string; attribution?: { name?: string; uri?: string } } | null | undefined): Shown | null => {
    const url = httpsUrl(p?.url);
    return url ? { url, name: String(p?.attribution?.name ?? "").trim().slice(0, 80), uri: httpsUrl(p?.attribution?.uri), google: GOOGLE_HOST.test(new URL(url).hostname) } : null;
  };
  const [failed, setFailed] = useState<readonly string[]>([]);
  const sameCache = !loaded || (place != null && cached?.place === place);
  const pick = [usable(photo), sameCache ? usable(cached) : null].find((p) => p && !failed.includes(p.url)) ?? null;

  // Crossfade: `cur` sits over `prev`. The first photo shows straight away with no fade (it may already be
  // in the browser cache); a later one is preloaded and swapped in only once it has loaded.
  const [layers, setLayers] = useState<{ prev: Shown | null; cur: Shown | null }>({ prev: null, cur: pick });
  if (!pick && layers.cur) setLayers({ prev: layers.cur, cur: null });
  if (pick && !layers.cur && !layers.prev) setLayers({ prev: null, cur: pick });
  const fail = useCallback((url: string) => {
    forgetPhoto(url);
    setFailed((f) => (f.includes(url) ? f : [...f, url]));
  }, []);
  const want = pick?.url ?? null;
  const [wantName, wantUri, wantGoogle] = [pick?.name ?? "", pick?.uri ?? null, !!pick?.google];
  useEffect(() => {
    if (!want || want === layers.cur?.url) return;
    let live = true;
    const img = new Image();
    img.referrerPolicy = "no-referrer";
    img.onload = () => live && setLayers((l) => ({ prev: l.cur, cur: { url: want, name: wantName, uri: wantUri, google: wantGoogle } }));
    img.onerror = () => live && fail(want);
    img.src = want;
    return () => {
      live = false;
    };
  }, [want, wantName, wantUri, wantGoogle, layers.cur?.url, fail]);

  // A very slow drift on the photo so the scene breathes (transform only). None when still, when effects
  // are off (e.g. under the full-screen map) or on a low-end device.
  const drift = useCallback(
    (el: HTMLImageElement | null) => {
      if (!el || still || !effects || lowTier || typeof el.animate !== "function") return;
      const a = el.animate([{ transform: "scale(1.02)" }, { transform: "scale(1.08) translate(-1%, -0.6%)" }], { duration: 90_000, direction: "alternate", iterations: Infinity, easing: "ease-in-out" });
      return () => a.cancel();
    },
    [still, effects, lowTier],
  );

  const shown = timed && layers.cur && !failed.includes(layers.cur.url) ? layers.cur : null;
  const creditShown = !!shown;
  useEffect(() => onCredit?.(creditShown), [creditShown, onCredit]);
  const sunGlow = glow(sun.phase, sun.altDeg, sun.haDeg, light);
  const lights = LIGHTS[sun.phase] ?? 0;
  const scrimBottom = family === "snow" || (family === "fog" && !DARK.has(sun.phase)) ? 0.85 : 0.75;

  if (!timed) return <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 z-0 h-lvh bg-bg" />;

  return (
    <>
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 top-0 z-0 h-lvh overflow-hidden bg-bg"
        data-time={COARSE[sun.phase]}
        data-phase={sun.phase}
        data-sky={family}
      >
        <div className="absolute inset-0" style={{ background: `linear-gradient(180deg, ${top} 0%, ${horizon} 100%)` }} />
        <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMax slice" className="absolute inset-0 h-full w-full">
          <path d={FAR[0]} style={{ fill: `color-mix(in srgb, ${horizon} 45%, #050a14)` }} opacity={0.85} />
          <path d={NEAR[0]} style={{ fill: `color-mix(in srgb, ${horizon} 16%, #03060d)` }} />
          {lights > 0 && <path d={NEAR[1]} fill="#FFD9A0" opacity={lights} />}
        </svg>
        {[layers.prev, layers.cur].map(
          (p, i) =>
            p &&
            !failed.includes(p.url) && (
              // eslint-disable-next-line @next/next/no-img-element -- a remote, per-person photo; next/image adds nothing here
              <img
                key={p.url}
                ref={drift}
                src={p.url}
                alt=""
                decoding="async"
                referrerPolicy="no-referrer"
                onError={() => fail(p.url)}
                onAnimationEnd={i ? () => setLayers((l) => (l.prev ? { ...l, prev: null } : l)) : undefined}
                className="absolute inset-0 h-full w-full object-cover"
                style={{
                  filter: filter + weatherFilter,
                  opacity: i || layers.cur ? 1 : 0,
                  transition: `opacity ${ms}ms ease-out, filter ${ms * 2}ms ease-out`,
                  animation: i && layers.prev ? `aspire-fade-in ${ms}ms ease-out both` : undefined,
                }}
              />
            ),
        )}
        {/* A new phase's wash fades in over the last one (phases change a few times a day; the photo filter eases alongside). */}
        {washes.prev !== washes.cur && <div className="absolute inset-0" style={{ background: washes.prev }} />}
        <div
          key={washes.cur}
          className="absolute inset-0"
          style={{ background: washes.cur, animation: washes.prev !== washes.cur ? `aspire-fade-in ${ms * 2}ms ease-out both` : undefined }}
          onAnimationEnd={() => setWashes((w) => (w.prev === w.cur ? w : { ...w, prev: w.cur }))}
        />
        {/* Plain compositing (the gradient carries its own alpha): no blend pass over the moving photo. */}
        {sunGlow && <div className="absolute inset-0" style={{ background: sunGlow }} />}
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(to bottom, rgb(0 0 0 / 0.6), transparent 28vh), linear-gradient(to top, rgb(0 0 0 / ${scrimBottom}), transparent 40vh), radial-gradient(transparent 45%, rgb(0 0 0 / 0.5))`,
          }}
        />
        {effects && known && (
          <Sky overlay kind={kind} intensity={sky.intensity} isDay={!DARK.has(sun.phase)} windKph={sky.windKph} phase={sun.phase} cloudCover={sky.cloudCover} />
        )}
      </div>
      {shown && (
        <p className="fixed bottom-[max(4px,env(safe-area-inset-bottom))] left-[max(16px,env(safe-area-inset-left))] z-20 flex max-w-[calc(100vw-32px)] items-center gap-2 rounded-sm bg-hud-glass px-2 text-small text-ink-muted">
          <Camera aria-hidden className="size-4 shrink-0" />
          {label && <span className="sr-only">{label}:</span>}
          {shown.name &&
            (shown.uri ? (
              <a href={shown.uri} target="_blank" rel="noopener noreferrer" className="inline-block truncate py-3 leading-6 underline">
                {shown.name}
              </a>
            ) : (
              <span className="truncate">{shown.name}</span>
            ))}
          {shown.google && shown.name !== "Google Maps" && (
            <>
              {shown.name && <span aria-hidden>·</span>}
              <span className="shrink-0">Google Maps</span>
            </>
          )}
        </p>
      )}
    </>
  );
}
