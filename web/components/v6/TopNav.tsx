// Top bar (spec: TopNav { view, onView, onSearch }): wordmark, the three views, "Search cities" with
// its keyboard shortcut, "Back to my location" while a searched city is shown, and settings. On a phone
// the view tabs hide (the page shows a bottom tab bar).

import { LocateFixed, Search, SlidersHorizontal } from "lucide-react";
import type { Lang } from "@/lib/lang";
import { cn } from "@/lib/utils";
import { textFor } from "@/components/v6/text";

export type V6View = "overview" | "map" | "saved";

interface TopNavProps {
  lang: Lang;
  view: V6View;
  onView: (v: V6View) => void;
  onSearch: () => void;
  onSettings: () => void;
  /** Shown while a searched city replaces the person's own position: goes back to it. */
  onMyLocation?: () => void;
  /** Apple keyboard: "Cmd K"; else "Ctrl K". */
  mac?: boolean;
}

export function TopNav({ lang, view, onView, onSearch, onSettings, onMyLocation, mac = false }: TopNavProps) {
  const t = textFor(lang);
  const views: [V6View, string][] = [
    ["overview", t.overview],
    ["map", t.cityMap],
    ["saved", t.saved],
  ];
  return (
    <nav aria-label={t.mainNav} className="flex items-center gap-3 border-b border-line pb-4">
      {/* Same wordmark as the homepage: one "Aspire", never a stray "a" mark beside it. */}
      <button type="button" onClick={() => onView("overview")} className="press flex min-h-11 shrink-0 items-center font-display text-wordmark text-ink uppercase">
        Aspire
      </button>
      <ul className="mx-auto hidden items-center gap-1 lg:flex">
        {views.map(([v, label]) => (
          <li key={v}>
            <button
              type="button"
              aria-current={view === v ? "page" : undefined}
              onClick={() => onView(v)}
              className={cn("press min-h-11 rounded-[var(--radius-sm)] px-4 text-copy", view === v ? "bg-surface-3 text-ink shadow-[inset_0_-2px_0_var(--color-accent)]" : "text-ink-muted hover:text-ink")}
            >
              {label}
            </button>
          </li>
        ))}
      </ul>
      <button id="aspire-search" type="button" onClick={onSearch} aria-keyshortcuts={mac ? "Meta+K" : "Control+K"} className="press v6-chip ml-auto min-h-11 min-w-11 justify-center gap-2 px-3 lg:ml-0">
        <Search aria-hidden className="size-4" />
        <span className="hidden sm:inline">{t.search}</span>
        <span className="sr-only sm:hidden">{t.search}</span>
        <kbd className="hidden rounded border border-line px-1.5 font-sans text-meta text-ink-faint sm:inline">{mac ? "Cmd K" : "Ctrl K"}</kbd>
      </button>
      {onMyLocation && (
        <button type="button" onClick={onMyLocation} title={t.myLocation} className="press v6-chip min-h-11 min-w-11 justify-center gap-2 px-3">
          <LocateFixed aria-hidden className="size-4" />
          <span className="hidden sm:inline">{t.myLocation}</span>
          <span className="sr-only sm:hidden">{t.myLocation}</span>
        </button>
      )}
      <button type="button" onClick={onSettings} aria-label={t.settings} className="press v6-chip size-11 justify-center p-0">
        <SlidersHorizontal aria-hidden className="size-5" />
      </button>
    </nav>
  );
}
