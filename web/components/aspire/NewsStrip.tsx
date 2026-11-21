"use client";

// The HUD news card: 3-5 headlines from /api/news (newsdata.io), each with its source and how long
// ago it was published; a tap opens the article in a new tab. It is a .hud panel itself, so never
// place it inside another .hud. Headlines are shown as published, in the publisher's own language.

import { Newspaper, RotateCw } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { HTML_LANG, type Lang } from "@/lib/lang";
import type { Headline } from "@/lib/news";

const TEXT: Record<Lang, { title: string; loading: string; empty: string; unavailable: string; notConfigured: string; retry: string; newTab: string }> = {
  mn: {
    title: "Мэдээ",
    loading: "Мэдээ ачаалж байна",
    empty: "Одоогоор мэдээ алга.",
    unavailable: "Мэдээний үйлчилгээ одоо ажиллахгүй байна.",
    notConfigured: "Мэдээний үйлчилгээ тохируулагдаагүй байна.",
    retry: "Дахин оролдох",
    newTab: "шинэ цонхонд нээгдэнэ",
  },
  zh: {
    title: "新闻",
    loading: "正在加载新闻",
    empty: "暂时没有新闻。",
    unavailable: "新闻服务暂时不可用。",
    notConfigured: "新闻服务尚未设置。",
    retry: "重试",
    newTab: "在新标签页中打开",
  },
  en: {
    title: "News",
    loading: "Loading headlines",
    empty: "No headlines right now.",
    unavailable: "The news service is unavailable right now.",
    notConfigured: "News is not set up yet.",
    retry: "Try again",
    newTab: "opens in a new tab",
  },
  ru: {
    title: "Новости",
    loading: "Загрузка новостей",
    empty: "Пока нет новостей.",
    unavailable: "Сервис новостей сейчас недоступен.",
    notConfigured: "Новости ещё не настроены.",
    retry: "Повторить",
    newTab: "откроется в новой вкладке",
  },
  de: {
    title: "Nachrichten",
    loading: "Schlagzeilen werden geladen",
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
export function NewsStrip({ lang, country, max = 5 }: { lang: Lang; country: string | null; max?: number }) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const t = TEXT[lang];
  const titleId = useId();

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

  const retry = () => {
    setState({ status: "loading" });
    setAttempt((n) => n + 1);
  };

  return (
    <section className="hud p-3" aria-labelledby={titleId} aria-busy={state.status === "loading"}>
      <h2 id={titleId} className="mb-2 flex items-center gap-2 text-label uppercase tracking-[0.12em] text-ink-muted">
        <Newspaper aria-hidden className="size-5 text-hud" />
        {t.title}
      </h2>

      {state.status === "loading" && (
        <div role="status">
          <span className="sr-only">{t.loading}</span>
          {[0, 1, 2].map((i) => (
            <div key={i} aria-hidden className="my-3 h-4 rounded bg-panel-3 motion-safe:animate-pulse" style={{ width: `${90 - i * 15}%` }} />
          ))}
        </div>
      )}

      {state.status === "error" && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p role="status" className="text-body text-ink-muted">
            {state.notConfigured ? t.notConfigured : t.unavailable}
          </p>
          {!state.notConfigured && (
            <button
              type="button"
              onClick={retry}
              className="press inline-flex min-h-12 items-center gap-2 rounded-md border border-line px-4 text-body text-ink hover:bg-panel-3"
            >
              <RotateCw aria-hidden className="size-5" /> {t.retry}
            </button>
          )}
        </div>
      )}

      {state.status === "ok" &&
        (state.headlines.length === 0 ? (
          <p role="status" className="text-body text-ink-muted">
            {t.empty}
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {state.headlines.slice(0, max).map((h, i) => {
              const when = ago(h.publishedAt, lang);
              return (
                <li key={`${i}-${h.url}`}>
                  <a
                    href={h.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="press block min-h-12 py-2 hover:text-hud focus-visible:text-hud"
                  >
                    <span className="line-clamp-2 text-body text-ink">{h.title}</span>
                    <span className="block font-mono text-label tabular-nums text-ink-faint">
                      {[h.source, when].filter(Boolean).join(" · ")}
                    </span>
                    <span className="sr-only">, {t.newTab}</span>
                  </a>
                </li>
              );
            })}
          </ul>
        ))}
      <p className="mt-2 text-right text-label text-ink-faint">newsdata.io</p>
    </section>
  );
}
