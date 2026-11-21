"use client";
// The live "world around you" snapshot (POST /api/ambient) for the HUD. Fetched on open, every
// 10 minutes while open, and again when the tab comes back into view. The device position is sent
// in the request body (never the URL, so it stays out of request logs) only when the person turned
// location sharing on; otherwise the city they set, if any; otherwise the server falls back to its
// approximate network location.
import { useCallback, useEffect, useRef, useState } from "react";
import type { Ambient } from "@/lib/ambient-types";
import type { Lang } from "@/lib/lang";

const REFRESH_MS = 10 * 60_000;
/** A tab that comes back sooner than this keeps what it has (the response itself says max-age=300). */
const STALE_ON_SHOW_MS = 5 * 60_000;
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
 * A coarse (network/Wi-Fi) fix is enough here and answers fast indoors; a fix from the last 10 minutes
 * is reused. Only the live map's "my location" button asks for high accuracy.
 */
export function devicePosition(decimals = 4): Promise<Fix | null> {
  if (lastFix && Date.now() - lastFix.at < FIX_MAX_AGE_MS) return Promise.resolve(round(lastFix, decimals));
  if (typeof navigator === "undefined" || !navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) =>
    navigator.geolocation.getCurrentPosition(
      (p) => {
        lastFix = { lat: p.coords.latitude, lng: p.coords.longitude, at: Date.now() };
        resolve(round(lastFix, decimals));
      },
      () => resolve(null),
      { enableHighAccuracy: false, maximumAge: FIX_MAX_AGE_MS, timeout: 15_000 },
    ),
  );
}

/** The last fix without waiting (null when there is none yet), rounded to `decimals`. */
export function cachedPosition(decimals = 3): Fix | null {
  return lastFix ? round(lastFix, decimals) : null;
}

/** About 1 km: enough for the morning briefing's weather. */
export const roundedPosition = () => devicePosition(2);

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
}): Ambient | null {
  const [data, setData] = useState<Ambient | null>(null);
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
          byLang.current.set(`${l}|${share ? 1 : 0}|${c}`, { at: Date.now(), data: json });
          if (opts.current.lang === l) setData(json);
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
      setData(hit.data);
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

  return data;
}
