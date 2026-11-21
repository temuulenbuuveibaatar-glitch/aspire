"use client";
// Display choices that belong to this device only (never synced to the cloud): sky effects,
// text size, Calm mode, units, spoken answers and screen reader mode. Stored in localStorage and mirrored onto <html> so every
// component (and the CSS variants `still:` / `opaque:` / `calm:`) can follow them:
//   data-text-size="lg" | "xl", data-calm="true", data-units="metric" | "imperial".
import { useCallback, useEffect, useSyncExternalStore } from "react";

export type TextSize = "md" | "lg" | "xl";
export type UnitsPref = "auto" | "metric" | "imperial";

export interface DisplayPrefs {
  /** Rain, snow, clouds and stars that follow the live weather. Off = a still gradient. */
  skyEffects: boolean;
  textSize: TextSize;
  /** In-app Calm mode: still sky and orb, no flashes, opaque panels. */
  calm: boolean;
  units: UnitsPref;
  /** Screen reader mode: replies go to the screen reader (one live region), not Aspire's own voice. */
  screenReader: boolean;
  /**
   * Spoken answers. Off = a text chat: no speech is requested (/api/speak is never called), no tones,
   * and the orb gives way to a compact chat header. Absent in older saved prefs, which means on.
   */
  voice: boolean;
}

/** Does Aspire speak? Only with spoken answers on and screen reader mode off (that mode has its own voice). */
export const speaks = (p: Pick<DisplayPrefs, "voice" | "screenReader">): boolean => p.voice && !p.screenReader;

export const DEFAULT_PREFS: DisplayPrefs = { skyEffects: true, textSize: "md", calm: false, units: "auto", screenReader: false, voice: true };

const KEY = "aspire-display-v1";
const EVENT = "aspire:display";

export function parsePrefs(raw: string | null): DisplayPrefs {
  if (!raw) return DEFAULT_PREFS;
  try {
    const v = JSON.parse(raw) as Partial<DisplayPrefs> | null;
    if (!v || typeof v !== "object") return DEFAULT_PREFS;
    return {
      skyEffects: typeof v.skyEffects === "boolean" ? v.skyEffects : DEFAULT_PREFS.skyEffects,
      textSize: v.textSize === "lg" || v.textSize === "xl" ? v.textSize : "md",
      calm: v.calm === true,
      units: v.units === "metric" || v.units === "imperial" ? v.units : "auto",
      screenReader: v.screenReader === true,
      voice: v.voice !== false,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

// When storage is blocked, choices last in memory until the page closes.
let memoryRaw: string | null = null;
let storageBroken = false;

function read(): string | null {
  if (storageBroken) return memoryRaw;
  try {
    return localStorage.getItem(KEY);
  } catch {
    storageBroken = true;
    return memoryRaw;
  }
}

function subscribe(onChange: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) onChange();
  };
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

// Snapshots must be stable between renders: cache the parsed object per raw string.
let cachedRaw: string | null | undefined;
let cachedPrefs: DisplayPrefs = DEFAULT_PREFS;
function snapshot(): DisplayPrefs {
  const raw = read();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedPrefs = parsePrefs(raw);
  }
  return cachedPrefs;
}
const serverSnapshot = () => DEFAULT_PREFS;

/** The device's display choices, a setter, and their effect on <html>. */
export function useDisplayPrefs(): [DisplayPrefs, (patch: Partial<DisplayPrefs>) => void] {
  const prefs = useSyncExternalStore(subscribe, snapshot, serverSnapshot);

  const set = useCallback((patch: Partial<DisplayPrefs>) => {
    const raw = JSON.stringify({ ...snapshot(), ...patch });
    memoryRaw = raw;
    try {
      localStorage.setItem(KEY, raw);
    } catch {
      storageBroken = true;
    }
    window.dispatchEvent(new Event(EVENT));
  }, []);

  useEffect(() => {
    const html = document.documentElement;
    if (prefs.textSize === "md") html.removeAttribute("data-text-size");
    else html.setAttribute("data-text-size", prefs.textSize);
    if (prefs.calm) html.setAttribute("data-calm", "true");
    else html.removeAttribute("data-calm");
    if (prefs.units === "auto") html.removeAttribute("data-units");
    else html.setAttribute("data-units", prefs.units);
  }, [prefs.textSize, prefs.calm, prefs.units]);

  return [prefs, set];
}

/* ---- shared environment hooks (stable during hydration: false on the server) ---- */

const none = () => {};

/** A media query's live value. */
export function useMedia(query: string): boolean {
  const sub = useCallback(
    (cb: () => void) => {
      const m = typeof window.matchMedia === "function" ? window.matchMedia(query) : null;
      m?.addEventListener("change", cb);
      return () => m?.removeEventListener("change", cb);
    },
    [query],
  );
  return useSyncExternalStore(sub, () => typeof window.matchMedia === "function" && window.matchMedia(query).matches, () => false);
}

function subscribeCalm(cb: () => void): () => void {
  if (typeof MutationObserver === "undefined") return none;
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-calm"] });
  return () => mo.disconnect();
}

/** In-app Calm mode (`<html data-calm="true">`). */
export function useCalm(): boolean {
  return useSyncExternalStore(subscribeCalm, () => document.documentElement.dataset.calm === "true", () => false);
}

/** Still: prefers-reduced-motion or Calm mode. */
export function useStill(): boolean {
  const reduced = useMedia("(prefers-reduced-motion: reduce)");
  return useCalm() || reduced;
}

/**
 * °F/mph or °C/km/h. "auto" is imperial only where people actually use it: the device region is the US,
 * Liberia or Myanmar AND the clock is in that region (an en-US browser in Mongolia gets °C).
 */
export function isImperial(units: UnitsPref): boolean {
  if (units !== "auto") return units === "imperial";
  if (typeof navigator === "undefined") return false;
  const region = (navigator.language.split("-")[1] ?? "").toUpperCase();
  let zone = "";
  try { zone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? ""; } catch { /* no Intl */ }
  if (region === "US") return /^(America|Pacific\/Honolulu|US)\//.test(zone) || zone === "Pacific/Honolulu";
  if (region === "LR") return zone === "Africa/Monrovia";
  if (region === "MM") return zone === "Asia/Yangon" || zone === "Asia/Rangoon";
  return false;
}
