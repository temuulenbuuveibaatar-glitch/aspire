"use client";

import { RotateCw, Sunrise, Volume2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { deviceTimeZone, localDate, shouldBrief } from "@/lib/briefing-day";
import type { Lang } from "@/lib/lang";
import type { Reminder, Title } from "@/lib/tools/types";
import type { UI } from "@/lib/ui-text";

type T = (typeof UI)["en"];

export interface Briefing {
  text: string;
  /** null = mail not checked (Gmail not connected). */
  mailCount: number | null;
  /** Gmail is connected but Google refused access: show "Reconnect Gmail". */
  gmailError: boolean;
  lang: Lang;
}

/** The morning briefing, on the same panel material as the other result cards. */
export function BriefingCard({
  text,
  t,
  onReplay,
  gmailError,
  onReconnect,
}: {
  text: string;
  t: T;
  onReplay: () => void;
  /** Optional: show a "Reconnect Gmail" button (e.g. open Settings, then Connections). */
  gmailError?: boolean;
  onReconnect?: () => void;
}) {
  return (
    <div className="panel rounded-lg p-5">
      <div className="mb-3 flex items-center gap-3">
        <span className="grid size-12 shrink-0 place-items-center rounded-md border border-line bg-panel-2 text-signal" aria-hidden>
          <Sunrise className="size-6" />
        </span>
        <h2 className="min-w-0 flex-1 text-label tracking-[0.08em] text-ink-muted uppercase">{t.briefing}</h2>
        <button
          type="button"
          onClick={onReplay}
          aria-label={t.repeat}
          title={t.repeat}
          className="press grid size-12 shrink-0 place-items-center rounded-full border border-line bg-panel-2 text-ink-muted hover:bg-panel-3 hover:text-ink"
        >
          <Volume2 className="size-6" aria-hidden />
        </button>
      </div>
      <p className="max-w-[65ch] text-reply text-ink">{text}</p>
      {gmailError && onReconnect && (
        <button
          type="button"
          onClick={onReconnect}
          className="press mt-4 inline-flex min-h-12 items-center justify-center gap-2 rounded-md border border-line-strong bg-panel-2 px-5 text-body font-medium text-ink hover:bg-panel-3"
        >
          <RotateCw className="size-5" aria-hidden /> {t.reconnectGmail}
        </button>
      )}
    </div>
  );
}

/**
 * Plays the briefing on the first open of each local calendar day (the device's time zone).
 * `lastDate`/`setLastDate` = settings.lastBriefingDate (YYYY-MM-DD). Pass `ready: false` until the
 * device state has loaded from storage, so a stale "never briefed" doesn't trigger a second play.
 * `refresh()` fetches and speaks a new one (for a "Briefing" button).
 */
export function useDailyBriefing({
  lang,
  reminders,
  speak,
  lastDate,
  setLastDate,
  title,
  ready = true,
  city,
  location,
}: {
  lang: Lang;
  reminders: Reminder[];
  speak: (text: string, lang: Lang) => unknown;
  lastDate: string | undefined;
  setLastDate: (date: string) => void;
  title?: Title;
  ready?: boolean;
  /** The place name the live snapshot found (weather and air for the briefing). */
  city?: string | null;
  /** The rounded device position, only when the person shares location. */
  location?: () => Promise<{ lat: number; lng: number } | null | undefined>;
}): { briefing: Briefing | null; refresh: () => Promise<void> } {
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const started = useRef(false);
  // Latest values without re-running the daily effect when they change.
  const latest = useRef({ lang, reminders, speak, title, setLastDate, city, location });
  useEffect(() => {
    latest.current = { lang, reminders, speak, title, setLastDate, city, location };
  });

  const refresh = useCallback(async () => {
    const { lang: l, reminders: r, title: ti, city: c, location: loc } = latest.current;
    const position = loc ? await loc().catch(() => null) : null;
    const res = await fetch("/api/briefing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lang: l,
        reminders: r,
        title: ti,
        tz: deviceTimeZone(),
        ...(c ? { city: c } : {}),
        ...(position ? { location: position } : {}),
      }),
    }).catch(() => null);
    if (res?.status === 401) {
      window.location.replace("/login?next=/&expired=1");
      return;
    }
    if (!res?.ok) return;
    const data = (await res.json().catch(() => null)) as Omit<Briefing, "lang"> | null;
    if (!data || typeof data.text !== "string" || !data.text) return;
    setBriefing({ text: data.text, mailCount: data.mailCount ?? null, gmailError: data.gmailError === true, lang: l });
    latest.current.setLastDate(localDate(new Date()));
    await latest.current.speak(data.text, l);
  }, []);

  useEffect(() => {
    if (!ready || started.current || !shouldBrief(lastDate, new Date())) return;
    started.current = true;
    void refresh();
  }, [ready, lastDate, refresh]);

  return { briefing, refresh };
}
