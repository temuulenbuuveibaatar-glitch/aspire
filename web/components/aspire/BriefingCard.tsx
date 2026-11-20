"use client";

import { RotateCw, Sunrise, Volume2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { mongoliaDate, shouldBrief } from "@/lib/briefing-day";
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

/** The morning briefing, styled like the other glass cards. */
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
  /** Optional: show a "Reconnect Gmail" button (e.g. open Settings → Connections). */
  gmailError?: boolean;
  onReconnect?: () => void;
}) {
  return (
    <div className="glass rounded-2xl p-4">
      <div className="mb-2 flex items-center gap-2">
        <Sunrise className="size-5 text-amber" aria-hidden />
        <h3 className="flex-1 text-sm font-semibold tracking-wide text-amber uppercase">{t.briefing}</h3>
        <button
          onClick={onReplay}
          aria-label={t.repeat}
          title={t.repeat}
          className="press grid size-11 place-items-center rounded-full text-ink-soft hover:bg-white/10 hover:text-ink"
        >
          <Volume2 className="size-5" aria-hidden />
        </button>
      </div>
      <p className="text-[17px] leading-relaxed">{text}</p>
      {gmailError && onReconnect && (
        <button
          onClick={onReconnect}
          className="press mt-3 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-line px-4 font-medium text-ink hover:bg-white/10"
        >
          <RotateCw className="size-4" aria-hidden /> {t.reconnectGmail}
        </button>
      )}
    </div>
  );
}

/**
 * Plays the briefing on the first open of each Mongolia calendar day (Asia/Ulaanbaatar).
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
}: {
  lang: Lang;
  reminders: Reminder[];
  speak: (text: string, lang: Lang) => unknown;
  lastDate: string | undefined;
  setLastDate: (date: string) => void;
  title?: Title;
  ready?: boolean;
}): { briefing: Briefing | null; refresh: () => Promise<void> } {
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const started = useRef(false);
  // Latest values without re-running the daily effect when they change.
  const latest = useRef({ lang, reminders, speak, title, setLastDate });
  useEffect(() => {
    latest.current = { lang, reminders, speak, title, setLastDate };
  });

  const refresh = useCallback(async () => {
    const { lang: l, reminders: r, title: ti } = latest.current;
    const res = await fetch("/api/briefing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lang: l, reminders: r, title: ti }),
    }).catch(() => null);
    if (res?.status === 401) {
      window.location.replace("/login?next=/&expired=1");
      return;
    }
    if (!res?.ok) return;
    const data = (await res.json().catch(() => null)) as Omit<Briefing, "lang"> | null;
    if (!data || typeof data.text !== "string" || !data.text) return;
    setBriefing({ text: data.text, mailCount: data.mailCount ?? null, gmailError: data.gmailError === true, lang: l });
    latest.current.setLastDate(mongoliaDate(new Date()));
    await latest.current.speak(data.text, l);
  }, []);

  useEffect(() => {
    if (!ready || started.current || !shouldBrief(lastDate, new Date())) return;
    started.current = true;
    void refresh();
  }, [ready, lastDate, refresh]);

  return { briefing, refresh };
}
