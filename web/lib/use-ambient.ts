"use client";
// The live "world around you" snapshot (GET /api/ambient) for the main screen: the sky, the
// ambient bar and the live panel. Fetched on open, every 10 minutes while open, and again when
// the tab comes back into view. The device position is sent only when the person turned
// location sharing on, and then only rounded to 2 decimals (about 1 km); otherwise the server
// falls back to its city-level network location.
import { useCallback, useEffect, useRef, useState } from "react";
import type { Ambient } from "@/lib/ambient-types";
import type { Lang } from "@/lib/lang";

const REFRESH_MS = 10 * 60_000;
/** A tab that comes back sooner than this keeps what it has (the response itself says max-age=300). */
const STALE_ON_SHOW_MS = 5 * 60_000;

/** The device position rounded to 2 decimals, or null when unavailable or refused. */
export function roundedPosition(): Promise<{ lat: number; lng: number } | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return Promise.resolve(null);
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return new Promise((resolve) =>
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: r2(p.coords.latitude), lng: r2(p.coords.longitude) }),
      () => resolve(null),
      { enableHighAccuracy: false, maximumAge: 600_000, timeout: 8000 },
    ),
  );
}

function isAmbient(x: unknown): x is Ambient {
  if (!x || typeof x !== "object") return false;
  const a = x as Partial<Ambient>;
  return !!a.sky && typeof a.sky === "object" && typeof a.sky.kind === "string" && Array.isArray(a.stops);
}

export interface UseAmbient {
  data: Ambient | null;
  /** True until the first answer (or failure) arrives. */
  loading: boolean;
  refresh: () => void;
}

export function useAmbient({ lang, shareLocation, enabled = true }: { lang: Lang; shareLocation: boolean; enabled?: boolean }): UseAmbient {
  const [data, setData] = useState<Ambient | null>(null);
  const [settled, setSettled] = useState(false);
  const last = useRef(0);
  const inFlight = useRef(false);
  // A load asked for while one is in flight (say, a language switch) runs once it settles,
  // instead of being dropped until the next 10-minute tick.
  const pendingReload = useRef(false);
  // Per-language snapshots: the language is auto-detected on every message, so switching back
  // and forth must not refetch (or ask for a new geolocation fix) each time.
  const byLang = useRef(new Map<string, { at: number; data: Ambient }>());
  const timer = useRef<number | null>(null);
  const opts = useRef({ lang, shareLocation, enabled });
  useEffect(() => {
    opts.current = { lang, shareLocation, enabled };
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
      const { lang: l, shareLocation: share } = opts.current;
      const q = new URLSearchParams({ lang: l });
      if (share) {
        const pos = await roundedPosition();
        if (pos) {
          q.set("lat", pos.lat.toFixed(2));
          q.set("lng", pos.lng.toFixed(2));
        }
      }
      const res = await fetch(`/api/ambient?${q.toString()}`).catch(() => null);
      last.current = Date.now();
      // 401 is handled by the shell's fetch guard (sign in again); 429 and errors keep the last snapshot.
      if (res?.ok) {
        const json: unknown = await res.json().catch(() => null);
        if (isAmbient(json)) {
          byLang.current.set(`${l}|${share ? 1 : 0}`, { at: Date.now(), data: json });
          if (opts.current.lang === l) setData(json);
        }
      }
    } finally {
      inFlight.current = false;
      setSettled(true);
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

  // On open, and again when the language or the location choice changes; a language that was
  // fetched less than REFRESH_MS ago is shown from memory.
  useEffect(() => {
    if (!enabled) return;
    const hit = byLang.current.get(`${lang}|${shareLocation ? 1 : 0}`);
    if (hit && Date.now() - hit.at < REFRESH_MS) {
      setData(hit.data);
      return;
    }
    void load();
  }, [enabled, lang, shareLocation, load]);

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

  return { data, loading: !settled && !data, refresh: () => void load() };
}
