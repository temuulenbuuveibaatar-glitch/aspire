"use client";

// The news card: 3-5 headlines from /api/news (newsdata.io), each with its source and how long ago it
// was published; a tap opens the article in a new tab. It uses the v6 card shell (components/v6/Card),
// so surface, spacing, title and states match the other cards. Headlines are shown as published, in
// the publisher's own language (marked with lang, so screen readers switch voice).

import { Newspaper, RefreshCw } from "lucide-react";
import { useEffect, useState, type MouseEvent } from "react";
import { detectTextLanguage, HTML_LANG, type Lang } from "@/lib/lang";
import type { Headline } from "@/lib/news";
import { Card } from "@/components/v6/Card";

const TEXT: Record<Lang, { title: string; empty: string; unavailable: string; notConfigured: string; retry: string; newTab: string }> = {
  mn: {
    title: "Мэдээ",
    empty: "Одоогоор мэдээ алга.",
    unavailable: "Мэдээний үйлчилгээ одоо ажиллахгүй байна.",
    notConfigured: "Мэдээний үйлчилгээ тохируулагдаагүй байна.",
    retry: "Дахин оролдох",
    newTab: "шинэ цонхонд нээгдэнэ",
  },
  zh: {
    title: "新闻",
    empty: "暂时没有新闻。",
    unavailable: "新闻服务暂时不可用。",
    notConfigured: "新闻服务尚未设置。",
    retry: "重试",
    newTab: "在新标签页中打开",
  },
  en: {
    title: "News",
    empty: "No headlines right now.",
    unavailable: "The news service is unavailable right now.",
    notConfigured: "News is not set up yet.",
    retry: "Try again",
    newTab: "opens in a new tab",
  },
  ru: {
    title: "Новости",
    empty: "Пока нет новостей.",
    unavailable: "Сервис новостей сейчас недоступен.",
    notConfigured: "Новости ещё не настроены.",
    retry: "Повторить",
    newTab: "откроется в новой вкладке",
  },
  de: {
    title: "Nachrichten",
    empty: "Gerade keine Schlagzeilen.",
    unavailable: "Der Nachrichtendienst ist gerade nicht erreichbar.",
    notConfigured: "Nachrichten sind noch nicht eingerichtet.",
    retry: "Erneut versuchen",
    newTab: "öffnet in neuem Tab",
  },
};

type State = { status: "loading" } | { status: "ok"; headlines: Headline[] } | { status: "error"; notConfigured: boolean };

const REFRESH_MS = 30 * 60_000; // the server caches newsdata.io for an hour (free plan: 200 credits a day)

/** "5 min ago", "3 hr ago", "yesterday" in the person's language; "" without a date. */
export function ago(iso: string | null, lang: Lang, now = Date.now()): string {
  const t = iso ? Date.parse(iso) : NaN;
  if (Number.isNaN(t)) return "";
  const min = Math.max(0, Math.round((now - t) / 60_000));
  const rtf = new Intl.RelativeTimeFormat(HTML_LANG[lang], { numeric: "auto", style: "short" });
  if (min < 60) return rtf.format(-min, "minute");
  if (min < 24 * 60) return rtf.format(-Math.round(min / 60), "hour");
  return rtf.format(-Math.round(min / (24 * 60)), "day");
}

/** `max`: how many headlines to list (3 keeps a phone screen for the photo). */
export function NewsStrip({ lang, country, max = 5, index, className }: { lang: Lang; country: string | null; max?: number; index?: number; className?: string }) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const t = TEXT[lang];

  useEffect(() => {
    const ctrl = new AbortController();
    // A failed background refresh keeps the headlines already shown (each still shows its own age).
    const fail = (notConfigured: boolean) =>
      setState((s) => (s.status === "ok" && s.headlines.length && !notConfigured ? s : { status: "error", notConfigured }));
    const load = async () => {
      const qs = new URLSearchParams({ lang, ...(country ? { country } : {}) });
      try {
        const res = await fetch(`/api/news?${qs}`, { signal: ctrl.signal });
        const body = (await res.json().catch(() => null)) as { headlines?: Headline[]; error?: string } | null;
        if (res.ok && Array.isArray(body?.headlines)) setState({ status: "ok", headlines: body.headlines.slice(0, 5) });
        else fail(body?.error === "not_configured");
      } catch {
        if (!ctrl.signal.aborted) fail(false);
      }
    };
    void load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      ctrl.abort();
      clearInterval(timer);
    };
  }, [lang, country, attempt]);

  const retry = (e: MouseEvent<HTMLButtonElement>) => {
    // The button goes away while loading: focus moves to the card first so it is not lost.
    e.currentTarget.closest("section")?.focus();
    setState({ status: "loading" });
    setAttempt((n) => n + 1);
  };

  const headlines = state.status === "ok" ? state.headlines.slice(0, max) : [];
  const credit = <p className="text-meta text-ink-faint">newsdata.io</p>;
  return (
    <Card
      title={t.title}
      icon={<Newspaper />}
      lang={lang}
      state={state.status === "loading" ? "loading" : state.status === "ok" && !headlines.length ? "empty" : "ready"}
      emptyText={t.empty}
      index={index}
      footer={credit}
      className={className}
    >
      {state.status === "error" ? (
        <div className="flex flex-col items-start gap-3">
          <p role="status" className="text-copy text-ink-muted">
            {state.notConfigured ? t.notConfigured : t.unavailable}
          </p>
          {!state.notConfigured && (
            <button type="button" onClick={retry} className="press v6-chip min-h-11 gap-2 px-4">
              <RefreshCw aria-hidden className="size-4" />
              {t.retry}
            </button>
          )}
        </div>
      ) : (
        <ul className="-my-1 divide-y divide-line">
          {headlines.map((h, i) => {
            const when = ago(h.publishedAt, lang);
            return (
              <li key={`${i}-${h.url}`}>
                <a href={h.url} target="_blank" rel="noopener noreferrer" className="press group flex min-h-11 flex-col justify-center gap-0.5 py-2.5">
                  <span lang={HTML_LANG[detectTextLanguage(h.title, lang)]} className="line-clamp-2 text-copy text-ink group-hover:underline">
                    {h.title}
                  </span>
                  <span className="num truncate text-meta text-ink-faint">{[h.source, when].filter(Boolean).join(" · ")}</span>
                  <span className="sr-only">, {t.newTab}</span>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
