"use client";
// The live "world around you" snapshot (POST /api/ambient) for the dashboard. Fetched on open, every
// 3 minutes while visible (the server keeps the costly parts cached, so this mostly refreshes buses),
// and again when the tab comes back into view. usePoll keeps the faster live feeds (city cameras,
// parking and fuel every 60 s; Erdenet's live buses every 30 s) fresh while the page is visible. The device position is sent
// in the request body (never the URL, so it stays out of request logs) only when the person turned
// location sharing on; otherwise the city they set, if any; otherwise the server falls back to its
// approximate network location. The last good photo is kept on this device so the hero shows a
// photo the moment the app opens, before the first snapshot arrives.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Ambient, AmbientPhoto } from "@/lib/ambient-types";
import type { Lang } from "@/lib/lang";

const REFRESH_MS = 3 * 60_000;
/** A tab that comes back sooner than this keeps what it has. */
const STALE_ON_SHOW_MS = 60_000;
/** A fix younger than this is reused: no GPS wake-up per question or refresh. */
const FIX_MAX_AGE_MS = 10 * 60_000;

type Fix = { lat: number; lng: number };
let lastFix: (Fix & { at: number }) | null = null;
const round = (p: Fix, decimals: number): Fix => {
  const k = 10 ** decimals;
  return { lat: Math.round(p.lat * k) / k, lng: Math.round(p.lng * k) / k };
};

/**
 * The device position rounded to `decimals` (4 = about 11 m), or null when unavailable or refused.
 * Asks for GPS-grade accuracy first (a coarse Wi-Fi/IP fix can be kilometres off and gave wrong stops);
 * if that times out, takes whatever fix the device has. A fix from the last 10 minutes is reused.
 */
export function devicePosition(decimals = 4): Promise<Fix | null> {
  if (lastFix && Date.now() - lastFix.at < FIX_MAX_AGE_MS) return Promise.resolve(round(lastFix, decimals));
  if (typeof navigator === "undefined" || !navigator.geolocation) return Promise.resolve(null);
  const ask = (high: boolean) =>
    new Promise<GeolocationPosition | null>((resolve) =>
      navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), {
        enableHighAccuracy: high,
        maximumAge: high ? 60_000 : FIX_MAX_AGE_MS,
        timeout: high ? 10_000 : 15_000,
      }),
    );
  return ask(true)
    .then((p) => p ?? ask(false))
    .then((p) => {
      if (!p) return null;
      lastFix = { lat: p.coords.latitude, lng: p.coords.longitude, at: Date.now() };
      return round(lastFix, decimals);
    });
}

/** The last fix without waiting (null when there is none yet), rounded to `decimals`. */
export function cachedPosition(decimals = 3): Fix | null {
  return lastFix ? round(lastFix, decimals) : null;
}

/** About 1 km: enough for the morning briefing's weather. */
export const roundedPosition = () => devicePosition(2);

/* ---- the last good photo, per device (localStorage) ---- */

export interface CachedPhoto extends AmbientPhoto {
  /** The place the photo is of (Ambient.place), so another city never shows it. */
  place: string | null;
  /** When it was kept (ms): Google Places content is kept a day at most. */
  savedAt?: number;
}

const GOOGLE_HOST = /(^|\.)(googleusercontent|googleapis|google)\.com$/;
const DAY_MS = 24 * 3600_000;

const PHOTO_KEY = "aspire-photo-v1";
const PHOTO_EVENT = "aspire:photo";
const str = (v: unknown, max: number): v is string => typeof v === "string" && v.length > 0 && v.length <= max;

/**
 * Trust boundary: whatever sits in storage (or arrives from the API) is checked before it is kept or shown.
 * A Google photo older than a day (or of unknown age) is dropped: Google limits caching Places content.
 */
export function parseCachedPhoto(raw: string | null, now = Date.now()): CachedPhoto | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<CachedPhoto> | null;
    const a = v?.attribution;
    if (!v || !str(v.url, 2048) || !v.url.startsWith("https://") || !a || typeof a.name !== "string" || typeof a.uri !== "string") return null;
    const savedAt = typeof v.savedAt === "number" && Number.isFinite(v.savedAt) ? v.savedAt : undefined;
    if (GOOGLE_HOST.test(new URL(v.url).hostname) && !(savedAt !== undefined && now - savedAt < DAY_MS)) return null;
    return { url: v.url, attribution: { name: a.name.slice(0, 80), uri: a.uri.slice(0, 512) }, place: str(v.place, 120) ? v.place : null, ...(savedAt !== undefined && { savedAt }) };
  } catch {
    return null;
  }
}

let photoRaw: string | null | undefined;
let photoSnap: CachedPhoto | null = null;
function photoSnapshot(): CachedPhoto | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(PHOTO_KEY);
  } catch {
    // storage blocked: no cache, the hero shows the sky until the photo loads
  }
  if (raw !== photoRaw) {
    photoRaw = raw;
    photoSnap = parseCachedPhoto(raw);
  }
  return photoSnap;
}
function writePhoto(raw: string | null) {
  try {
    if (raw) localStorage.setItem(PHOTO_KEY, raw);
    else localStorage.removeItem(PHOTO_KEY);
  } catch {
    return;
  }
  window.dispatchEvent(new Event(PHOTO_EVENT));
}
function subscribePhoto(cb: () => void): () => void {
  const onStorage = (e: StorageEvent) => e.key === PHOTO_KEY && cb();
  window.addEventListener(PHOTO_EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(PHOTO_EVENT, cb);
    window.removeEventListener("storage", onStorage);
  };
}

/** Keeps a good photo (with its credit and place) for the next open. */
export function rememberPhoto(photo: AmbientPhoto | null | undefined, place: string | null) {
  const p = parseCachedPhoto(JSON.stringify({ ...photo, place, savedAt: Date.now() }));
  const cur = photoSnapshot();
  if (p && (p.url !== cur?.url || p.place !== cur?.place)) writePhoto(JSON.stringify(p));
}

/** The last good photo on this device; null on the server and during hydration. */
export function useCachedPhoto(): CachedPhoto | null {
  return useSyncExternalStore(subscribePhoto, photoSnapshot, () => null);
}

function isAmbient(x: unknown): x is Ambient {
  if (!x || typeof x !== "object") return false;
  const a = x as Partial<Ambient>;
  return !!a.sky && typeof a.sky === "object" && typeof a.sky.kind === "string" && Array.isArray(a.stops);
}

export function useAmbient({
  lang,
  shareLocation,
  city = null,
  enabled = true,
}: {
  lang: Lang;
  shareLocation: boolean;
  /** The city the person set (used when location sharing is off or the fix fails). */
  city?: string | null;
  enabled?: boolean;
}): { data: Ambient | null; at: number | null; reload: () => void } {
  const [snap, setSnap] = useState<{ data: Ambient; at: number } | null>(null);
  const last = useRef(0);
  const inFlight = useRef(false);
  // A load asked for while one is in flight (say, a language switch) runs once it settles,
  // instead of being dropped until the next 10-minute tick.
  const pendingReload = useRef(false);
  // Per-language snapshots: the language is auto-detected on every message, so switching back
  // and forth must not refetch (or ask for a new geolocation fix) each time.
  const byLang = useRef(new Map<string, { at: number; data: Ambient }>());
  const timer = useRef<number | null>(null);
  const place = city?.trim() || "";
  const opts = useRef({ lang, shareLocation, place, enabled });
  useEffect(() => {
    opts.current = { lang, shareLocation, place, enabled };
  });

  // The refresh timer and a queued reload call the latest load through this ref (no self-reference).
  const loadRef = useRef<() => Promise<void>>(async () => {});
  const load = useCallback(async (): Promise<void> => {
    if (inFlight.current) {
      pendingReload.current = true;
      return;
    }
    inFlight.current = true;
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    try {
      const { lang: l, shareLocation: share, place: c } = opts.current;
      const pos = share ? await devicePosition() : null;
      const where = pos ? { lat: pos.lat, lng: pos.lng } : c ? { city: c.slice(0, 80) } : {};
      const res = await fetch("/api/ambient", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lang: l, ...where }),
      }).catch(() => null);
      last.current = Date.now();
      // 401 is handled by the shell's fetch guard (sign in again); 429 and errors keep the last snapshot.
      if (res?.ok) {
        const json: unknown = await res.json().catch(() => null);
        if (isAmbient(json)) {
          if (json.photo) rememberPhoto(json.photo, json.place);
          byLang.current.set(`${l}|${share ? 1 : 0}|${c}`, { at: Date.now(), data: json });
          if (opts.current.lang === l) setSnap({ data: json, at: Date.now() });
        }
      }
    } finally {
      inFlight.current = false;
      // The next refresh always comes REFRESH_MS after the last completed one, whatever triggered it.
      if (opts.current.enabled) {
        timer.current = window.setTimeout(() => {
          if (document.visibilityState === "visible") void loadRef.current();
        }, REFRESH_MS);
      }
      if (pendingReload.current) {
        pendingReload.current = false;
        void loadRef.current();
      }
    }
  }, []);
  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  // On open, and again when the language, the location choice or the city changes; a language that was
  // fetched less than REFRESH_MS ago is shown from memory.
  useEffect(() => {
    if (!enabled) return;
    const hit = byLang.current.get(`${lang}|${shareLocation ? 1 : 0}|${place}`);
    if (hit && Date.now() - hit.at < REFRESH_MS) {
      setSnap(hit);
      return;
    }
    void load();
  }, [enabled, lang, shareLocation, place, load]);

  useEffect(() => {
    if (!enabled) return;
    const onShow = () => {
      if (document.visibilityState === "visible" && Date.now() - last.current > STALE_ON_SHOW_MS) void load();
    };
    document.addEventListener("visibilitychange", onShow);
    return () => {
      document.removeEventListener("visibilitychange", onShow);
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = null;
    };
  }, [enabled, load]);

  const reload = useCallback(() => void loadRef.current(), []);
  return { data: snap?.data ?? null, at: snap?.at ?? null, reload };
}

/**
 * GET `url` now and every `everyMs` while the page is visible (and on coming back into view); null
 * url = off. `parse` is the trust boundary: it returns null for anything malformed. A failure keeps
 * the last good value and sets `failed`, so a card can say the feed is not answering. An answer equal
 * to the last one changes nothing (no re-render), so `at` is when the data last changed.
 */
export function usePoll<T>(url: string | null, everyMs: number, parse: (json: unknown) => T | null): { data: T | null; at: number | null; failed: boolean; reload: () => void } {
  const [state, setState] = useState<{ url: string; data: T | null; at: number | null; failed: boolean } | null>(null);
  const parseRef = useRef(parse);
  useEffect(() => {
    parseRef.current = parse;
  });
  const [tick, setTick] = useState(0);
  const last = useRef("");
  useEffect(() => {
    if (!url) return;
    let live = true;
    let timer = 0;
    const get = async () => {
      window.clearTimeout(timer);
      if (document.visibilityState === "visible") {
        const res = await fetch(url).catch(() => null);
        const value = res?.ok ? parseRef.current(await res.json().catch(() => null)) : null;
        if (!live) return;
        if (value === null) {
          last.current = "";
          setState((s) => ({ url, data: s?.url === url ? s.data : null, at: s?.url === url ? s.at : null, failed: true }));
        } else {
          const key = `${url}
${JSON.stringify(value)}`;
          if (key !== last.current) {
            last.current = key;
            setState({ url, data: value, at: Date.now(), failed: false });
          }
        }
      }
      if (live) timer = window.setTimeout(get, everyMs);
    };
    const onShow = () => document.visibilityState === "visible" && void get();
    void get();
    document.addEventListener("visibilitychange", onShow);
    return () => {
      live = false;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, [url, everyMs, tick]);
  const reload = useCallback(() => setTick((n) => n + 1), []);
  const mine = state && state.url === url ? state : null;
  return { data: mine?.data ?? null, at: mine?.at ?? null, failed: mine?.failed ?? false, reload };
}
