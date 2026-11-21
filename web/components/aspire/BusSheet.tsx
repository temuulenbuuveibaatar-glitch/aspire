"use client";

// What the Erdenet feed says about one bus, and nothing more: plate (the feed's vehicle name), the route
// matched from its position, speed, heading (only while it moves) and how old the position is, first.
// Stale (> 60 s) is said out loud; a value the feed did not send is "unknown", never a made-up 0.

import { useEffect, useState } from "react";
import type { Lang } from "@/lib/lang";
import type { Route, Vehicle } from "@/lib/erdenet-transit";
import { ERDENET_CREDIT } from "@/lib/geo";

/** A position older than this is shown dimmed and with a warning. */
export const STALE_MS = 60_000;
export const isStale = (v: Pick<Vehicle, "updatedAt">, now: number) => !(now - Date.parse(v.updatedAt) < STALE_MS);

type Key = "plate" | "route" | "noRoute" | "unknown" | "matched" | "speed" | "kmh" | "heading" | "updated" | "s" | "min" | "h" | "stale" | "down" | "source";
const T: Record<Lang, Record<Key, string> & { dirs: string[] }> = {
  en: { unknown: "unknown", plate: "Plate", route: "Route", noRoute: "Not identified", matched: "Matched from the bus position on the route map.", speed: "Speed", kmh: "km/h", heading: "Heading", updated: "Updated", s: "s ago", min: "min ago", h: "h ago", stale: "This position is over a minute old. The bus may have moved.", down: "The live feed is not answering. This is the last position it gave.", source: "Source",
    dirs: ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"] },
  mn: { unknown: "тодорхойгүй", plate: "Улсын дугаар", route: "Чиглэл", noRoute: "Тодорхойгүй", matched: "Автобусны байршлыг чиглэлийн зурагтай тулгаж тодорхойлсон.", speed: "Хурд", kmh: "км/ц", heading: "Явж буй зүг", updated: "Шинэчилсэн", s: "сек өмнө", min: "мин өмнө", h: "цагийн өмнө", stale: "Энэ байршил нэг минутаас хуучин. Автобус хөдөлсөн байж магадгүй.", down: "Шууд мэдээлэл ирэхгүй байна. Энэ нь хамгийн сүүлд ирсэн байршил.", source: "Эх сурвалж",
    dirs: ["хойш", "зүүн хойш", "зүүн тийш", "зүүн урагш", "урагш", "баруун урагш", "баруун тийш", "баруун хойш"] },
  zh: { unknown: "未知", plate: "车牌", route: "线路", noRoute: "未识别", matched: "根据车辆位置与线路图匹配得出。", speed: "速度", kmh: "公里/小时", heading: "行驶方向", updated: "更新于", s: "秒前", min: "分钟前", h: "小时前", stale: "此位置已超过一分钟，车辆可能已经移动。", down: "实时数据暂时没有响应，这是最后收到的位置。", source: "来源",
    dirs: ["向北", "向东北", "向东", "向东南", "向南", "向西南", "向西", "向西北"] },
  ru: { unknown: "неизвестно", plate: "Госномер", route: "Маршрут", noRoute: "Не определён", matched: "Определён по положению автобуса на схеме маршрутов.", speed: "Скорость", kmh: "км/ч", heading: "Направление", updated: "Обновлено", s: "с назад", min: "мин назад", h: "ч назад", stale: "Этой позиции больше минуты. Автобус мог уехать.", down: "Онлайн-данные не отвечают. Это последняя полученная позиция.", source: "Источник",
    dirs: ["на север", "на северо-восток", "на восток", "на юго-восток", "на юг", "на юго-запад", "на запад", "на северо-запад"] },
  de: { unknown: "unbekannt", plate: "Kennzeichen", route: "Linie", noRoute: "Nicht erkannt", matched: "Aus der Busposition auf dem Linienplan abgeleitet.", speed: "Tempo", kmh: "km/h", heading: "Fahrtrichtung", updated: "Aktualisiert", s: "s her", min: "Min. her", h: "Std. her", stale: "Diese Position ist älter als eine Minute. Der Bus kann weitergefahren sein.", down: "Die Live-Daten antworten nicht. Das ist die letzte gemeldete Position.", source: "Quelle",
    dirs: ["nach Norden", "nach Nordosten", "nach Osten", "nach Südosten", "nach Süden", "nach Südwesten", "nach Westen", "nach Nordwesten"] },
};

/** 0..360 degrees to one of eight compass words in `lang`. */
export const compass = (deg: number, lang: Lang) => (T[lang] ?? T.en).dirs[Math.round((((deg % 360) + 360) % 360) / 45) % 8];

/** "12 s ago" under a minute, "3 min ago" under an hour, else "5 h ago". */
export function age(updatedAt: string, now: number, lang: Lang): string {
  const t = T[lang] ?? T.en;
  const s = Math.max(0, Math.round((now - Date.parse(updatedAt)) / 1000));
  if (!Number.isFinite(s)) return t.unknown;
  return s < 60 ? `${s} ${t.s}` : s < 3600 ? `${Math.floor(s / 60)} ${t.min}` : `${Math.floor(s / 3600)} ${t.h}`;
}

interface BusSheetProps {
  bus: Vehicle;
  route: Route | null;
  lang: Lang;
  /** The last poll failed: the position shown is the last one the feed gave. */
  feedDown?: boolean;
  /** false when the sheet's own heading already shows the plate. */
  showPlate?: boolean;
}

const hex = (c: string) => (/^#[0-9a-f]{3,8}$/i.test(c) ? c : "#7fe3ff");

export function BusSheet({ bus, route, lang, feedDown = false, showPlate = true }: BusSheetProps) {
  const t = T[lang] ?? T.en;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const stale = isStale(bus, now);
  const row = "flex items-baseline justify-between gap-3 border-t border-[rgb(127_227_255/0.15)] py-2";
  const go = bus.speedKph != null && bus.speedKph >= 3; // moving; an unknown speed counts as standing

  return (
    <div className="mt-2">
      <dl>
        {showPlate && (
          <div className={row}>
            <dt className="text-ink-muted">{t.plate}</dt>
            <dd lang="mn" className="font-mono text-ink">{bus.name || bus.id}</dd>
          </div>
        )}
        {/* How fresh the position is comes first, so it is never scrolled out of view. */}
        <div className={row}>
          <dt className="text-ink-muted">{t.updated}</dt>
          <dd className={stale ? "font-mono tabular-nums text-signal" : "font-mono tabular-nums"}>{age(bus.updatedAt, now, lang)}</dd>
        </div>
      </dl>
      {(stale || feedDown) && (
        <p role="status" className="mb-2 rounded border border-signal/50 px-3 py-2 text-signal">{feedDown ? t.down : t.stale}</p>
      )}
      <dl>
        <div className={row}>
          <dt className="text-ink-muted">{t.route}</dt>
          <dd className="text-right">
            {route ? (
              <span lang="mn" className="inline-flex items-center gap-2">
                <span aria-hidden className="size-3 rounded-full" style={{ background: hex(route.color) }} />
                <span className="font-mono text-accent">{route.short}</span>
                {route.name !== route.short && <span>{route.name.startsWith(`${route.short} `) ? route.name.slice(route.short.length + 1) : route.name}</span>}
              </span>
            ) : (
              t.noRoute
            )}
          </dd>
        </div>
        <div className={row}>
          <dt className="text-ink-muted">{t.speed}</dt>
          <dd className="font-mono tabular-nums">{bus.speedKph == null ? t.unknown : `${Math.round(bus.speedKph)} ${t.kmh}`}</dd>
        </div>
        {/* A standing bus has no direction of travel: the heading shows only while it moves. */}
        {go && (
          <div className={row}>
            <dt className="text-ink-muted">{t.heading}</dt>
            <dd>{bus.heading == null ? t.unknown : <>{compass(bus.heading, lang)} <span className="font-mono tabular-nums text-ink-muted">{Math.round(bus.heading)}°</span></>}</dd>
          </div>
        )}
      </dl>
      {route && <p className="mt-2 text-ink-muted">{t.matched}</p>}
      <p className="mt-1 text-ink-muted">{t.source}: <span lang="mn">{ERDENET_CREDIT}</span></p>
    </div>
  );
}
