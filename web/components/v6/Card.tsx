// The v6 card shell (spec 1, improvements 1 and 11): a title, the body for each state (skeleton,
// empty, offline, denied, error with Retry) and the source line every figure carries: kind word,
// age and source. Only real-time data gets the pulsing dot; colour is never the only signal.

import type { ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { HTML_LANG, type Lang } from "@/lib/lang";
import { cn, httpsUrl } from "@/lib/utils";
import { fill, textFor } from "@/components/v6/text";

/** "forecast": a provider's weather (Google, Open-Meteo); "estimated" only for values that truly are (bus ETAs). */
export type ProvKind = "live" | "scheduled" | "estimated" | "forecast" | "static" | "calculated" | "none";

export interface Provenance {
  source: string;
  /** Seconds since the data was measured; null when the source gives no time. */
  ageS: number | null;
  kind: ProvKind;
  href?: string;
}

export type CardState = "loading" | "ready" | "empty" | "offline" | "denied" | "error";

/** The name to credit for a weather or air provider. */
export const PROVIDER = { google: "Google", "open-meteo": "Open-Meteo" } as const;

/** Seconds between an ISO time and now; null when either is unknown or the time is not a date. */
export function ageS(at: string | null | undefined, now: number | null): number | null {
  if (!at || now == null) return null;
  const t = Date.parse(at);
  return Number.isFinite(t) ? Math.max(0, Math.round((now - t) / 1000)) : null;
}

const formats = new Map<string, Intl.DateTimeFormat>();
/** A cached Intl.DateTimeFormat in `timeZone` (the device zone when it is not a valid name): renders reuse them. */
export function dateFormat(locale: string, timeZone: string | null | undefined, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${timeZone ?? ""}|${JSON.stringify(opts)}`;
  let f = formats.get(key);
  if (!f) {
    try {
      f = new Intl.DateTimeFormat(locale, { ...opts, timeZone: timeZone || undefined });
    } catch {
      f = new Intl.DateTimeFormat(locale, opts);
    }
    if (formats.size > 200) formats.clear();
    formats.set(key, f);
  }
  return f;
}

const relative = new Map<string, Intl.RelativeTimeFormat>();
/** "30 sec. ago", "4 min ago", "2 hr. ago" in the UI language. */
export function ageText(s: number, lang: Lang): string {
  const locale = HTML_LANG[lang] ?? "en";
  let f = relative.get(locale);
  if (!f) relative.set(locale, (f = new Intl.RelativeTimeFormat(locale, { style: "short", numeric: "always" })));
  return s < 60 ? f.format(-Math.round(s), "second") : s < 3600 ? f.format(-Math.floor(s / 60), "minute") : s < 172_800 ? f.format(-Math.floor(s / 3600), "hour") : f.format(-Math.floor(s / 86_400), "day");
}

export function LiveDot({ className }: { className?: string }) {
  return <span aria-hidden className={cn("v6-live-dot inline-block size-2 shrink-0 rounded-full bg-live", className)} />;
}

/** "Live · 30 sec. ago · Орхон ТКХДТ". */
export function ProvenanceLine({ prov, lang, className }: { prov: Provenance; lang: Lang; className?: string }) {
  const t = textFor(lang);
  const word = t[prov.kind];
  const href = httpsUrl(prov.href);
  const src = href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className="underline">
      {prov.source}
    </a>
  ) : (
    prov.source
  );
  return (
    <p className={cn("flex min-w-0 items-center gap-1.5 text-meta text-ink-faint", className)} data-prov={prov.kind}>
      {prov.kind === "live" && <LiveDot />}
      <span className={cn("shrink-0", prov.kind === "live" && "text-live", prov.kind === "estimated" && "underline decoration-dashed")}>{word}</span>
      {prov.ageS != null && (
        <>
          <span aria-hidden>·</span>
          <span className="num shrink-0">{ageText(prov.ageS, lang)}</span>
        </>
      )}
      {prov.source && (
        <>
          <span aria-hidden>·</span>
          <span className="truncate" title={prov.source}>
            {src}
          </span>
        </>
      )}
    </p>
  );
}

/** Grey bars in the card's shape while the first data loads. */
export function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div aria-hidden className="flex flex-col gap-3" data-skeleton>
      <div className="v6-skeleton h-10 w-24 rounded-[var(--radius-sm)]" />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="v6-skeleton h-4 rounded-full" style={{ width: `${90 - i * 18}%` }} />
      ))}
    </div>
  );
}

interface CardProps {
  title: string;
  icon: ReactNode;
  lang: Lang;
  state?: CardState;
  /** The named empty state ("Stops only in Tsetserleg"); falls back to "No data yet". */
  emptyText?: string;
  prov?: Provenance | null;
  onRetry?: () => void;
  /** Stagger index for the entrance. */
  index?: number;
  /** Right side of the header (a button, a badge). */
  action?: ReactNode;
  /** Shown under the body in every state but loading and error (e.g. "View all routes"). */
  footer?: ReactNode;
  className?: string;
  children?: ReactNode;
}

export function Card({ title, icon, lang, state = "ready", emptyText, prov, onRetry, index = 0, action, footer, className, children }: CardProps) {
  const t = textFor(lang);
  const note = (text: string, role?: "status" | "alert") => (
    <p role={role} className="text-copy text-ink-muted">
      {text}
    </p>
  );
  let body: ReactNode;
  if (state === "loading") body = <Skeleton />;
  else if (state === "empty") body = note(emptyText ?? t.empty);
  else if (state === "denied") body = note(t.denied);
  else if (state === "error")
    body = (
      <div className="flex flex-col items-start gap-3">
        {note(t.error, "alert")}
        {onRetry && (
          <button
            type="button"
            // The button is replaced by the skeleton: focus moves to the card first so it is not lost.
            onClick={(e) => {
              e.currentTarget.closest("section")?.focus();
              onRetry();
            }}
            className="press v6-chip min-h-11 gap-2 px-4"
          >
            <RefreshCw aria-hidden className="size-4" />
            {t.retry}
          </button>
        )}
      </div>
    );
  else body = children;
  const offline = state === "offline";
  return (
    <section
      aria-busy={state === "loading" || undefined}
      data-state={state}
      tabIndex={-1}
      className={cn("v6-card v6-enter flex min-w-0 flex-col gap-3 p-5", className)}
      style={{ ["--i" as string]: index }}
    >
      <header className="flex min-h-6 items-center justify-between gap-3">
        <h2 className="flex min-w-0 items-center gap-2 text-card text-ink">
          <span aria-hidden className="shrink-0 text-ink-muted [&>svg]:size-[18px]">
            {icon}
          </span>
          <span className="truncate" title={title}>
            {title}
          </span>
        </h2>
        {action}
      </header>
      {offline && note(prov?.ageS != null ? fill(t.offline, { age: ageText(prov.ageS, lang) }) : t.offlineNoAge, "status")}
      <div className="min-h-0 flex-1">{offline ? children : body}</div>
      {state !== "loading" && state !== "error" && footer}
      {prov && (state === "ready" || offline) && <ProvenanceLine prov={prov} lang={lang} />}
    </section>
  );
}
