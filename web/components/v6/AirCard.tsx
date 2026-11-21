// Air quality (spec improvement 8): the US AQI number with its category word (colour is never the
// only signal), a marker on the six-band scale, advice, PM2.5 when known, and the source line.

import { Wind } from "lucide-react";
import { AQI_ORDER, aqiCategory, type AmbientAir } from "@/lib/ambient-types";
import type { Lang } from "@/lib/lang";
import { Card, type CardState, type Provenance } from "@/components/v6/Card";
import { textFor } from "@/components/v6/text";

/** Upper bound of each band, good to hazardous. */
const BANDS = [50, 100, 150, 200, 300, 500];

/** 0..1 along a scale of six equal bands (AQI above 500 pins to the end). */
export function aqiPosition(aqi: number): number {
  const v = Math.max(0, Math.min(500, aqi));
  const i = BANDS.findIndex((b) => v <= b);
  const lo = i ? BANDS[i - 1] : 0;
  return (i + (v - lo) / (BANDS[i] - lo)) / BANDS.length;
}

interface AirCardProps {
  lang: Lang;
  air: AmbientAir | null;
  /** micrograms per cubic metre, when the provider gives it. */
  pm25?: number | null;
  prov?: Provenance | null;
  state?: CardState;
  index?: number;
  onRetry?: () => void;
  className?: string;
}

export function AirCard({ lang, air, pm25, prov, state = "ready", index, onRetry, className }: AirCardProps) {
  const t = textFor(lang);
  const ok = air && Number.isFinite(air.aqi);
  if (!ok) return <Card title={t.air} icon={<Wind />} lang={lang} state={state === "ready" ? "empty" : state} emptyText={t.noAir} index={index} onRetry={onRetry} className={className} />;
  const aqi = Math.round(air.aqi);
  // Trust the number over a category that disagrees with it.
  const cat = aqiCategory(aqi);
  const sev = AQI_ORDER.indexOf(cat);
  const advice = t.advice[sev === 0 ? 0 : sev <= 2 ? 1 : 2];
  return (
    <Card title={t.air} icon={<Wind />} lang={lang} state={state} prov={prov} index={index} onRetry={onRetry} className={className}>
      <div className="flex items-center gap-3">
        <data value={aqi} className="num text-[3rem] leading-none font-light text-ink">
          {aqi}
        </data>
        <span className="rounded-md px-2 py-0.5 text-meta" style={{ background: `color-mix(in srgb, var(--color-aqi-${sev + 1}) 22%, transparent)`, color: "var(--color-ink)" }}>
          {t.aqi[cat]}
        </span>
      </div>
      <p className="mt-1 text-meta text-ink-muted">{t.usAqi}</p>
      <div className="relative mt-3" role="img" aria-label={`${t.usAqi} ${aqi}, ${t.aqi[cat]}`}>
        <div className="flex gap-1">
          {BANDS.map((_, i) => (
            <span key={i} className="h-1.5 flex-1 rounded-full" style={{ background: `var(--color-aqi-${i + 1})`, opacity: i === sev ? 1 : 0.55 }} />
          ))}
        </div>
        <span aria-hidden className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-bg bg-ink" style={{ left: `${(aqiPosition(aqi) * 100).toFixed(1)}%` }} />
      </div>
      <p className="mt-3 text-copy text-ink-muted">{advice}</p>
      {pm25 != null && Number.isFinite(pm25) && (
        <p className="num mt-2 flex justify-between text-meta text-ink-muted">
          <span>PM2.5</span>
          <span className="text-ink">{Math.round(pm25)} µg/m³</span>
        </p>
      )}
    </Card>
  );
}
