"use client";

// The city's live feeds in one sheet (/api/city, lib/erdenet-city.ts): Parking / Fuel. Erdenet: parking
// free spaces (approx., camera vision) and fuel per type (status unknown when the station says nothing).
// A feed that did not answer says so. Cameras have their own sheet (components/aspire/CameraSheet).

import { useId, useState, type KeyboardEvent } from "react";
import { Fuel as FuelIcon, SquareParking } from "lucide-react";
import type { CityData, Feed, Fuel, Station } from "@/lib/erdenet-city";
import { HTML_LANG, type Lang } from "@/lib/lang";
import { cn } from "@/lib/utils";
import { Sheet } from "@/components/aspire/Sheet";
import { UI } from "@/lib/ui-text";
import { ageS, ageText, ProvenanceLine } from "@/components/v6/Card";
import { fill, named, textFor, type V6Text } from "@/components/v6/text";

export type CityTab = "parking" | "fuel";

/** The tabs that have something to show (a feed that is down still gets its tab, to say so). */
export function cityTabs(city: CityData | null): CityTab[] {
  if (!city) return [];
  const down = new Set<Feed>(city.down ?? []);
  return [
    city.parking || down.has("parking") ? "parking" : null,
    city.fuel || down.has("fuel") ? "fuel" : null,
  ].filter((x): x is CityTab => !!x);
}

/** "350 m", "1.2 km" in the UI language; null when unknown. */
export function distanceText(m: number | undefined, lang: Lang): string | null {
  if (m == null || !Number.isFinite(m)) return null;
  const km = m >= 1000;
  return new Intl.NumberFormat(HTML_LANG[lang] ?? "en", { style: "unit", unit: km ? "kilometer" : "meter", unitDisplay: "short", maximumFractionDigits: km ? 1 : 0 }).format(km ? m / 1000 : Math.round(m / 10) * 10);
}

/** The newest status report time among the stations (ISO), or null when no report has a time. */
export function newestReport(stations: Station[]): string | null {
  let best: string | null = null;
  for (const s of stations) for (const x of s.fuels) if (x.status !== "unknown" && x.updatedAt && (!best || Date.parse(x.updatedAt) > Date.parse(best))) best = x.updatedAt;
  return best;
}

/** Stations where at least one fuel is reported on sale. */
export const stationsSelling = (stations: Station[]): number => stations.filter((s) => s.fuels.some((x) => x.status === "selling")).length;

function fuelName(type: string, t: V6Text): string {
  const m = /^(AI|EURO)(\d{2})$/.exec(type);
  if (m) return `${m[1] === "AI" ? "AI" : "Euro"}-${m[2]}`;
  return type === "DIESEL" ? t.diesel : type === "GAS" ? t.gas : type;
}

function FuelChip({ f, t, lang, now }: { f: Fuel; t: V6Text; lang: Lang; now: number | null }) {
  const a = ageS(f.updatedAt, now);
  const word = f.status === "unknown" ? t.fuelUnknown : t.fuelStatus[f.status];
  const tone = f.status === "selling" ? "text-live" : f.status === "sold_out" ? "text-danger" : "text-ink-faint";
  return (
    <li className="v6-chip max-w-full gap-1.5 px-2.5 py-1 text-meta" title={[fuelName(f.type, t), word, f.source === "community" ? t.community : "", a != null ? ageText(a, lang) : ""].filter(Boolean).join(" · ")}>
      <span className="font-medium text-ink">{fuelName(f.type, t)}</span>
      <span className={tone}>{word}</span>
      {f.source === "community" && <span className="truncate text-ink-faint">({t.community})</span>}
      {f.status !== "unknown" && <span className="num shrink-0 text-ink-faint">{a != null ? ageText(a, lang) : t.timeUnknown}</span>}
    </li>
  );
}

interface CityPanelProps {
  lang: Lang;
  city: CityData | null;
  cityName?: string | null;
  now: number | null;
  tab?: CityTab;
}

/** The sheet's body (exported for tests and for a wide layout that shows it inline). */
export function CityPanel({ lang, city, cityName, now, tab: initial }: CityPanelProps) {
  const t = textFor(lang);
  const id = useId();
  const tabs = cityTabs(city);
  const [picked, setPicked] = useState<CityTab | undefined>(initial);
  const tab = picked && tabs.includes(picked) ? picked : tabs[0];
  if (!city || !tab) return <p className="text-copy text-ink-muted">{named(t.noCity, cityName, t.empty)}</p>;
  const down = new Set<Feed>(city.down ?? []);
  const credit = city.credit ?? "";
  const LABEL: Record<CityTab, [string, typeof FuelIcon]> = { parking: [t.parking, SquareParking], fuel: [t.fuel, FuelIcon] };
  const onKey = (e: KeyboardEvent) => {
    const i = tabs.indexOf(tab);
    const to = ({ ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 } as Record<string, number>)[e.key];
    if (to == null) return;
    e.preventDefault();
    const next = tabs[(to + tabs.length) % tabs.length];
    setPicked(next);
    document.getElementById(`${id}-${next}-tab`)?.focus();
  };
  const notAnswering = <p role="status" className="text-copy text-ink-muted">{t.notAnswering}</p>;

  let panel;
  if (tab === "parking") {
    const p = city.parking;
    if (!p) panel = notAnswering;
    else {
      const known = p.lots.filter((l) => l.free != null);
      const free = known.reduce((n, l) => n + (l.free ?? 0), 0);
      const total = known.reduce((n, l) => n + l.total, 0);
      panel = (
        <div className="flex flex-col gap-2">
          {known.length > 0 && (
            <p className="num text-[1.5rem] font-light text-ink">
              {fill(t.free, { n: free })} <span className="text-copy text-ink-muted">{fill(t.of, { n: total })} · {t.approx}</span>
            </p>
          )}
          <ul className="divide-y divide-line">
            {p.lots.map((l) => (
              <li key={l.id} className="flex min-h-11 items-center gap-3 py-1.5">
                <span lang="mn" className="min-w-0 flex-1 truncate text-copy text-ink" title={l.name}>
                  {l.name}
                </span>
                {distanceText(l.distanceM, lang) && <span className="num shrink-0 text-meta text-ink-faint">{distanceText(l.distanceM, lang)}</span>}
                <span className="num shrink-0 text-copy text-ink">{l.free != null ? `${l.free} / ${l.total}` : t.none}</span>
              </li>
            ))}
          </ul>
          {/* Counts come from camera vision: approximate. */}
          <ProvenanceLine prov={{ source: credit, ageS: ageS(p.updatedAt, now), kind: "estimated" }} lang={lang} />
        </div>
      );
    }
  } else if (tab === "fuel") {
    const f = city.fuel;
    // Station and driver reports, each with its own time: the line carries the newest, never "Live".
    const newest = f ? newestReport(f.stations) : null;
    panel = !f ? (
      notAnswering
    ) : (
      <div className="flex flex-col gap-2">
        <ul className="divide-y divide-line">
          {f.stations.map((s) => (
            <li key={s.id} className="flex flex-col gap-1.5 py-2.5">
              <p className="flex items-baseline gap-2">
                <span lang="mn" className="min-w-0 flex-1 truncate text-copy font-medium text-ink" title={s.name}>
                  {s.name}
                </span>
                {distanceText(s.distanceM, lang) && <span className="num shrink-0 text-meta text-ink-faint">{distanceText(s.distanceM, lang)}</span>}
              </p>
              {s.org && (
                <p lang="mn" className="truncate text-meta text-ink-muted">
                  {s.org}
                </p>
              )}
              {s.fuels.length ? (
                <ul className="flex flex-wrap gap-1.5">
                  {s.fuels.map((x) => (
                    <FuelChip key={x.type} f={x} t={t} lang={lang} now={now} />
                  ))}
                </ul>
              ) : (
                <p className="text-meta text-ink-faint">{t.fuelUnknown}</p>
              )}
            </li>
          ))}
        </ul>
        <ProvenanceLine prov={{ source: credit, ageS: ageS(newest, now), kind: newest ? "estimated" : "none" }} lang={lang} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {tabs.length > 1 && (
        <div role="tablist" aria-label={t.city} className="grid gap-1" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }} onKeyDown={onKey}>
          {tabs.map((k) => {
            const [label, Icon] = LABEL[k];
            return (
              <button
                key={k}
                id={`${id}-${k}-tab`}
                type="button"
                role="tab"
                aria-selected={k === tab}
                aria-controls={`${id}-panel`}
                tabIndex={k === tab ? 0 : -1}
                onClick={() => setPicked(k)}
                title={label}
                className={cn("press flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-copy", k === tab ? "bg-surface-3 text-ink shadow-[inset_0_-2px_0_var(--color-accent)]" : "text-ink-muted hover:text-ink")}
              >
                <Icon aria-hidden className="size-4 shrink-0" />
                <span className="min-w-0 text-center leading-tight [overflow-wrap:anywhere]">{label}</span>
                {down.has(k as Feed) && <span className="sr-only">({t.notAnswering})</span>}
              </button>
            );
          })}
        </div>
      )}
      <div id={`${id}-panel`} role={tabs.length > 1 ? "tabpanel" : undefined} aria-labelledby={tabs.length > 1 ? `${id}-${tab}-tab` : undefined} data-tab={tab}>
        {panel}
      </div>
    </div>
  );
}

interface CitySheetProps extends CityPanelProps {
  open: boolean;
  onClose: () => void;
}

export function CitySheet({ open, onClose, ...panel }: CitySheetProps) {
  const t = textFor(panel.lang);
  return (
    <Sheet open={open} title={panel.cityName ? `${t.city} · ${panel.cityName}` : t.city} closeLabel={UI[panel.lang].close} onClose={onClose}>
      <CityPanel key={panel.tab} {...panel} />
    </Sheet>
  );
}
