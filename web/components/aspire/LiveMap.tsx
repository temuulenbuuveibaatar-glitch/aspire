"use client";

// The live map: MapLibre GL with OpenFreeMap vector tiles (OpenStreetMap data, no key, full map in every
// country), the person, stops and taxis; in Erdenet also the city's live buses and route paths from
// /api/transit (proxy of Орхон ТКХДТ's public feed). maplibre-gl itself is fetched only when the map mounts.
// Without WebGL or tiles: a list of the nearest stops plus an OpenStreetMap link.

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState, type DependencyList } from "react";
import type { GeoJSONSource, Map as MlMap, Marker } from "maplibre-gl";
import { LocateFixed, Minus, Phone, Plus, X } from "lucide-react";
import type { Lang } from "@/lib/lang";
import type { Arrival, Path, Route, Station, Vehicle } from "@/lib/erdenet-transit";
import { useStill } from "@/lib/display-prefs";
import { ERDENET_CENTER, ERDENET_CREDIT, haversineKm, type LatLng } from "@/lib/geo";
import { cn } from "@/lib/utils";
import { age, BusSheet, isStale } from "./BusSheet";

type Key = "title" | "zoomIn" | "zoomOut" | "locate" | "close" | "closeSheet" | "unavailable" | "open" | "you" | "stop" | "taxi" | "bus" | "stale" | "call" | "approx" | "min" | "noBus" | "live" | "down" | "nearest" | "wheel" | "touch" | "loading";
const T: Record<Lang, Record<Key, string>> = {
  en: { title: "Live map", zoomIn: "Zoom in", zoomOut: "Zoom out", locate: "My location", close: "Close map", closeSheet: "Close", unavailable: "The live map is not available on this device right now.", open: "Open in OpenStreetMap", you: "You are here", stop: "Stop", taxi: "Taxi", bus: "Bus", stale: "position over a minute old", call: "Call", approx: "approx.", min: "min", noBus: "No bus is heading here right now.", live: "buses live", down: "live bus feed not answering", nearest: "Nearest stops", wheel: "Use {k} + scroll to zoom the map", touch: "Use two fingers to move the map", loading: "Loading map" },
  mn: { title: "Шууд газрын зураг", zoomIn: "Томруулах", zoomOut: "Жижигрүүлэх", locate: "Миний байршил", close: "Газрын зургийг хаах", closeSheet: "Хаах", unavailable: "Энэ төхөөрөмж дээр шууд газрын зураг одоогоор ажиллахгүй байна.", open: "OpenStreetMap-д нээх", you: "Та энд байна", stop: "Буудал", taxi: "Такси", bus: "Автобус", stale: "байршил нэг минутаас хуучин", call: "Залгах", approx: "ойролцоогоор", min: "мин", noBus: "Одоогоор энэ буудал руу явж буй автобус алга.", live: "автобус шууд", down: "автобусны шууд мэдээлэл ирэхгүй байна", nearest: "Ойрын буудлууд", wheel: "Газрын зургийг томруулахдаа {k} + гүйлгэлт ашиглана уу", touch: "Газрын зургийг хоёр хуруугаар хөдөлгөнө үү", loading: "Газрын зураг ачаалж байна" },
  zh: { title: "实时地图", zoomIn: "放大", zoomOut: "缩小", locate: "我的位置", close: "关闭地图", closeSheet: "关闭", unavailable: "此设备暂时无法显示实时地图。", open: "在 OpenStreetMap 中打开", you: "您在这里", stop: "车站", taxi: "出租车", bus: "公交车", stale: "位置已超过一分钟", call: "拨打", approx: "约", min: "分钟", noBus: "目前没有公交车开往此站。", live: "辆公交车实时", down: "公交实时数据没有响应", nearest: "附近车站", wheel: "按住 {k} 并滚动以缩放地图", touch: "请用两根手指移动地图", loading: "正在加载地图" },
  ru: { title: "Живая карта", zoomIn: "Приблизить", zoomOut: "Отдалить", locate: "Моё местоположение", close: "Закрыть карту", closeSheet: "Закрыть", unavailable: "Живая карта сейчас недоступна на этом устройстве.", open: "Открыть в OpenStreetMap", you: "Вы здесь", stop: "Остановка", taxi: "Такси", bus: "Автобус", stale: "позиции больше минуты", call: "Позвонить", approx: "примерно", min: "мин", noBus: "Сейчас к этой остановке не едет ни один автобус.", live: "автобусов онлайн", down: "онлайн-данные автобусов не отвечают", nearest: "Ближайшие остановки", wheel: "Чтобы изменить масштаб, используйте {k} + прокрутку", touch: "Перемещайте карту двумя пальцами", loading: "Загрузка карты" },
  de: { title: "Live-Karte", zoomIn: "Vergrößern", zoomOut: "Verkleinern", locate: "Mein Standort", close: "Karte schließen", closeSheet: "Schließen", unavailable: "Die Live-Karte ist auf diesem Gerät gerade nicht verfügbar.", open: "In OpenStreetMap öffnen", you: "Sie sind hier", stop: "Haltestelle", taxi: "Taxi", bus: "Bus", stale: "Position älter als eine Minute", call: "Anrufen", approx: "ca.", min: "Min.", noBus: "Gerade fährt kein Bus zu dieser Haltestelle.", live: "Busse live", down: "Live-Busdaten antworten nicht", nearest: "Nächste Haltestellen", wheel: "Zum Zoomen {k} + Scrollen verwenden", touch: "Die Karte mit zwei Fingern bewegen", loading: "Karte wird geladen" },
};

const HUD = "#7fe3ff";
const STALE = "#93a3bc";
const OUTLINE = "#04121c";
// "fiord": dark blue with legible streets ("dark" was near-black and read as a broken map).
const DEFAULT_STYLE = "https://tiles.openfreemap.org/styles/fiord";
const STYLE_URL = /^https:\/\/[^\s]+$/.test(process.env.NEXT_PUBLIC_MAP_STYLE_URL ?? "") ? process.env.NEXT_PUBLIC_MAP_STYLE_URL! : DEFAULT_STYLE;
// Same string as OpenFreeMap's tiles carry, so MapLibre shows it once; kept for any configured style.
const ATTRIBUTION = '<a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> <a href="https://www.openmaptiles.org/" target="_blank">&copy; OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>';
const LABEL_LANG: Record<Lang, string> = { mn: "mn", zh: "zh", en: "en", ru: "ru", de: "de" };

/* ---------- Erdenet feed: GET /api/transit (already validated server-side by lib/erdenet-transit) ---------- */

interface TransitFeed { stations: Station[]; paths: Path[]; routes: Route[]; vehicles: Vehicle[]; updatedAt: string | null }
const arr = <X,>(x: unknown): X[] => (Array.isArray(x) ? (x as X[]) : []);
/** When the server sends ageS (seconds since the bus's own fix), updatedAt is rebased on this device's clock, so
 *  "updated N s ago" and the stale mark stay true even if the phone's clock is off. */
export function parseTransit(json: unknown, now = Date.now()): TransitFeed {
  const o = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
  const vehicles = arr<Vehicle & { ageS?: unknown }>(o.vehicles).map((v) =>
    typeof v.ageS === "number" && v.ageS >= 0 ? { ...v, updatedAt: new Date(now - v.ageS * 1000).toISOString() } : v);
  return { stations: arr(o.stations), paths: arr(o.paths), routes: arr(o.routes), vehicles, updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : null };
}

/** maplibre-gl, bundled; the UMD build may come through as `default` only. */
const loadMaplibre = (): Promise<Ml> =>
  import("maplibre-gl").then((mod) => ((mod as unknown as { default?: Ml }).default ?? mod) as Ml);

/** Starts fetching maplibre-gl ahead of the first map (idle time, or a finger landing on a Map button). */
export const prefetchMap = () => loadMaplibre().catch(() => null);

export function osmUrl(at: LatLng | null): string {
  return at ? `https://www.openstreetmap.org/?mlat=${at.lat.toFixed(5)}&mlon=${at.lng.toFixed(5)}#map=16/${at.lat.toFixed(5)}/${at.lng.toFixed(5)}` : "https://www.openstreetmap.org/";
}

const webgl = () => {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
};

/* ---------- Component ---------- */

type Sel =
  | { kind: "stop"; id?: string; name: string; routes: string[] }
  | { kind: "taxi"; name: string; phone: string | null }
  | { kind: "bus"; name: string; last: Vehicle }; // last: shown (ageing) if the feed stops reporting this bus

interface LiveMapProps {
  center: LatLng | null;
  lang: Lang;
  stops?: { name: string; lat: number; lng: number }[];
  taxis?: { name: string; lat: number; lng: number; phone: string | null }[];
  erdenet?: boolean;
  className?: string;
  onClose?: () => void;
  fullscreen?: boolean;
}

type Ml = typeof import("maplibre-gl");
type Gm = { ml: Ml; map: MlMap };

const btn = "grid size-12 place-items-center rounded-full border border-[rgb(127_227_255/0.35)] bg-[rgb(4_8_16/0.82)] text-ink transition-colors hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const glass = "border border-[rgb(127_227_255/0.35)] bg-[rgb(4_8_16/0.86)]";
const top = "top-[max(0.75rem,env(safe-area-inset-top))]";
const pinCls = "grid size-12 cursor-pointer place-items-center focus-visible:outline-2 focus-visible:outline-accent";
const tel = (p: string | null) => (p && /^\+?[\d\s()-]{3,20}$/.test(p) ? p.replace(/[^\d+]/g, "") : null);
const hex = (c: string | undefined) => (c && /^#[0-9a-f]{3,8}$/i.test(c) ? c : HUD);

/** A marker element: a 48 px button (when tappable) around a static SVG. Text goes in via attributes only. */
function pin(label: string, svg: string, onTap?: () => void): HTMLElement {
  const el = document.createElement(onTap ? "button" : "div");
  el.className = pinCls;
  el.setAttribute("aria-label", label);
  if (!onTap) el.setAttribute("role", "img");
  else {
    el.setAttribute("type", "button");
    el.addEventListener("click", (e) => { e.stopPropagation(); onTap(); });
  }
  el.innerHTML = svg;
  return el;
}
const ARROW = '<svg width="22" height="22" viewBox="-11 -11 22 22" aria-hidden="true"><path d="M0 -10L7 7L0 3L-7 7Z" fill="currentColor" stroke="#04121c" stroke-width="1.5"/></svg>';
/** A bus standing still, or with no heading in the feed: a dot, so no direction is claimed. */
const STOPPED = '<svg width="16" height="16" viewBox="-8 -8 16 16" aria-hidden="true"><circle r="6" fill="currentColor" stroke="#04121c" stroke-width="1.5"/></svg>';

/** Adds markers while the map exists and removes them when deps change or on unmount. */
function useMarkers(gm: Gm | null, make: (ml: Ml) => Marker[], deps: DependencyList) {
  useEffect(() => {
    if (!gm) return;
    const ms = make(gm.ml);
    ms.forEach((m) => m.addTo(gm.map));
    return () => ms.forEach((m) => m.remove());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gm, ...deps]);
}

/** Street and place labels in the person's language where OpenStreetMap has it, else the local name. */
function localize(map: MlMap, lang: Lang) {
  const field = ["coalesce", ["get", `name:${LABEL_LANG[lang]}`], ["get", "name"]];
  for (const l of map.getStyle()?.layers ?? []) {
    if (l.type === "symbol" && /name/.test(JSON.stringify(map.getLayoutProperty(l.id, "text-field") ?? ""))) map.setLayoutProperty(l.id, "text-field", field);
  }
}

export function LiveMap({ center, lang, stops = [], taxis = [], erdenet = false, className, onClose, fullscreen = false }: LiveMapProps) {
  const t = T[lang] ?? T.en;
  const box = useRef<HTMLDivElement>(null);
  const mapEl = useRef<HTMLDivElement>(null);
  const sheetClose = useRef<HTMLButtonElement>(null);
  const [gm, setGm] = useState<Gm | null>(null);
  const [failed, setFailed] = useState(false);
  const [feed, setFeed] = useState<TransitFeed | null>(null);
  const [feedDown, setFeedDown] = useState(false);
  // Time of the last poll, ok or not: re-judges staleness even when the feed sends nothing new.
  const [polled, setPolled] = useState(0);
  const [sel, setSel] = useState<Sel | null>(null);
  const [eta, setEta] = useState<Arrival[] | "down" | null>(null);
  // Announced once per opened stop (later polls would re-read the whole list every 10 s).
  const [etaNote, setEtaNote] = useState("");
  const announced = useRef<string | undefined>(undefined);
  const [gps, setGps] = useState<LatLng | null>(null); // fresh fix from the "my location" button
  const here = gps ?? center;
  const still = useStill();
  const open = (s: Sel) => {
    setEta(null); setEtaNote(""); announced.current = undefined; setSel(s);
    // Keep the tapped bus in view above the sheet (which covers up to 60% of the map).
    if (s.kind === "bus" && gm) gm.map.easeTo({ center: [s.last.lng, s.last.lat], padding: { top: 0, left: 0, right: 0, bottom: (box.current?.clientHeight ?? 0) * 0.6 }, duration: still ? 0 : 500 });
  };
  // Map event handlers are bound once; they read the latest feed and opener through these.
  const feedRef = useRef(feed);
  const openRef = useRef(open);
  useEffect(() => { feedRef.current = feed; openRef.current = open; });
  const centredAt = useRef<LatLng | null>(null);

  // Load once; the map lives as long as this component. Centring is the effect below.
  useEffect(() => {
    let off = false;
    let map: MlMap | null = null;
    if (!webgl()) { setFailed(true); return; }
    loadMaplibre().then((ml) => {
      if (off || !mapEl.current) return;
      const start = center ?? (erdenet ? ERDENET_CENTER : null);
      const wheel = (k: string) => t.wheel.replace("{k}", k);
      map = new ml.Map({
        container: mapEl.current,
        style: STYLE_URL,
        center: start ? [start.lng, start.lat] : [0, 20],
        zoom: start ? (center ? 15 : 13) : 2,
        // Inline (tablets too): two fingers pan, so a one-finger swipe still scrolls the page.
        cooperativeGestures: !fullscreen,
        attributionControl: { compact: false, customAttribution: ATTRIBUTION },
        locale: { "Map.Title": t.title, "CooperativeGesturesHandler.WindowsHelpText": wheel("Ctrl"), "CooperativeGesturesHandler.MacHelpText": wheel("Cmd"), "CooperativeGesturesHandler.MobileHelpText": t.touch },
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        maxPitch: 0,
        // Vector tiles at 3x cost a lot of fill on phones; 2x looks the same.
        pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
      });
      map.touchZoomRotate.disableRotation();
      if (start && center) centredAt.current = center;
      let loaded = false;
      // The style itself unreachable before first paint (tile errors carry a sourceId and are survivable).
      map.on("error", (e) => { if (!loaded && !off && !(e as { sourceId?: string }).sourceId) setFailed(true); });
      map.on("load", () => {
        loaded = true;
        if (off || !map) return;
        map.addSource("paths", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        map.addSource("stations", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        map.addLayer({ id: "paths", type: "line", source: "paths", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": ["get", "color"], "line-width": 4, "line-opacity": 0.85 } });
        map.addLayer({ id: "stations", type: "circle", source: "stations", paint: { "circle-radius": 5, "circle-color": HUD, "circle-stroke-color": OUTLINE, "circle-stroke-width": 2 } });
        // An invisible 44 px target around each stop: the 10 px dot alone is too small for a finger.
        map.addLayer({ id: "stations-hit", type: "circle", source: "stations", paint: { "circle-radius": 22, "circle-opacity": 0, "circle-stroke-width": 0 } });
        map.on("click", "stations-hit", (e) => {
          const s = feedRef.current?.stations.find((x) => x.id === e.features?.[0]?.properties?.id);
          if (s) openRef.current({ kind: "stop", id: s.id, name: s.name, routes: s.routeIds.flatMap((id) => feedRef.current?.routes.find((r) => r.id === id)?.short ?? []) });
        });
        map.on("mouseenter", "stations-hit", () => { if (map) map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", "stations-hit", () => { if (map) map.getCanvas().style.cursor = ""; });
        setGm({ ml, map });
      });
    }).catch(() => { if (!off) setFailed(true); });
    return () => { off = true; map?.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { if (gm) localize(gm.map, lang); }, [gm, lang]);

  // Centre on the person once the position is known, and again only when it moves more than 1 km
  // (city changed), so periodic position updates do not yank the map while it is being panned.
  useEffect(() => {
    if (!gm || !center || (centredAt.current && haversineKm(centredAt.current, center) < 1)) return;
    centredAt.current = center;
    gm.map.easeTo({ center: [center.lng, center.lat], zoom: 15, duration: still ? 0 : 800 });
  }, [gm, center, still]);

  // Erdenet buses: poll every 10 s, only while the map is on screen and the tab is visible. The network
  // (stations, paths, routes) comes once; later polls ask for vehicles only (?live=1).
  useEffect(() => {
    if (!erdenet) return;
    let off = false, busy = false, inView = true, timer = 0, haveStatic = false;
    let ctl: AbortController | null = null;
    const tick = async () => {
      clearTimeout(timer);
      if (off || busy || !inView || document.visibilityState !== "visible") return;
      busy = true;
      ctl = new AbortController();
      try {
        const r = await fetch(haveStatic ? "/api/transit?live=1" : "/api/transit", { signal: ctl.signal, cache: "no-store" });
        if (r.ok) {
          const f = parseTransit(await r.json());
          if (f.stations.length) haveStatic = true;
          // Static layers are drawn once: keep the first stations/paths.
          setFeed((prev) => (prev?.stations.length ? { ...prev, vehicles: f.vehicles, updatedAt: f.updatedAt } : f));
          setFeedDown(false);
        } else if (r.status >= 500) setFeedDown(true);
        // 429 (our own rate limit) or 401: the city's feed is not down; keep the last picture (each bus still ages).
      } catch {
        if (!ctl.signal.aborted) setFeedDown(true); // keep the last picture, but say the feed is down
      }
      busy = false;
      if (!off) setPolled(Date.now());
      if (!off) timer = window.setTimeout(tick, 10_000);
    };
    const io = new IntersectionObserver(([e]) => { const was = inView; inView = e.isIntersecting; if (inView && !was) tick(); });
    if (box.current) io.observe(box.current);
    document.addEventListener("visibilitychange", tick);
    tick();
    return () => { off = true; clearTimeout(timer); ctl?.abort(); io.disconnect(); document.removeEventListener("visibilitychange", tick); };
  }, [erdenet]);

  // Route paths and stations: GeoJSON layers (paths are [lat, lng] from the feed).
  useEffect(() => {
    if (!gm || !feed) return;
    (gm.map.getSource("paths") as GeoJSONSource | undefined)?.setData({
      type: "FeatureCollection",
      features: feed.paths.map((p) => ({ type: "Feature", properties: { color: hex(p.color) }, geometry: { type: "LineString", coordinates: p.coords.map(([lat, lng]) => [lng, lat]) } })),
    });
    (gm.map.getSource("stations") as GeoJSONSource | undefined)?.setData({
      type: "FeatureCollection",
      features: feed.stations.map((s) => ({ type: "Feature", properties: { id: s.id }, geometry: { type: "Point", coordinates: [s.lng, s.lat] } })),
    });
  }, [gm, feed?.paths, feed?.stations]); // eslint-disable-line react-hooks/exhaustive-deps

  // Next buses at the open stop: the server estimates along the route path; refreshed with each poll.
  const stopId = sel?.kind === "stop" ? sel.id : undefined;
  useEffect(() => {
    if (!stopId) return;
    const ctl = new AbortController();
    fetch(`/api/transit?stop=${encodeURIComponent(stopId)}`, { signal: ctl.signal, cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j) => {
        const list = arr<Arrival>(j?.arrivals);
        setEta(list);
        if (announced.current !== stopId) {
          announced.current = stopId;
          setEtaNote(list.length ? `${list[0].route} ${list[0].minutes} ${t.min} (${t.approx})` : t.noBus);
        }
      })
      .catch(() => { if (!ctl.signal.aborted) setEta("down"); }); // never let silence read as "no bus"
    return () => ctl.abort();
    // Refetched with every poll (not only when a bus reports), so estimates never sit on screen unrefreshed.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- t only words the one-time announcement
  }, [stopId, polled]);
  // A dead feed replaces the estimates with "not answering" at once.
  useEffect(() => { if (feedDown && stopId) setEta("down"); }, [feedDown, stopId]);

  const routeNames = (ids: string[]) => ids.flatMap((id) => feed?.routes.find((r) => r.id === id)?.short ?? []);
  const dot = (color: string, size: number, square = false) =>
    `<svg width="${size}" height="${size}" viewBox="0 0 16 16" aria-hidden="true">${square ? '<rect x="2" y="2" width="12" height="12"' : '<circle cx="8" cy="8" r="6"'} fill="${color}" stroke="${OUTLINE}" stroke-width="2.5"/></svg>`;

  useMarkers(gm, (ml) => [
    ...stops.map((s) => new ml.Marker({ element: pin(`${t.stop}: ${s.name}`, dot("#f2f6fc", 16), () => openRef.current({ kind: "stop", name: s.name, routes: [] })) }).setLngLat([s.lng, s.lat])),
    ...taxis.map((x) => new ml.Marker({ element: pin(`${t.taxi}: ${x.name}`, dot("#f5c26b", 16, true), () => openRef.current({ kind: "taxi", name: x.name, phone: tel(x.phone) })) }).setLngLat([x.lng, x.lat])),
  ], [JSON.stringify(stops), JSON.stringify(taxis), t]); // content, not identity: parents often pass fresh arrays

  useMarkers(gm, (ml) => {
    if (!here) return [];
    // The pulse (radius 8 to 20, fading out) is a CSS animation of transform and opacity on a plain element
    // behind the dot: no layout. As SMIL <animate> tags on the circle's radius it forced a layout on every
    // frame for as long as the map was mounted, and a CSS animation of a circle inside the SVG still cost
    // one on every frame the page drew. At rest the ring is invisible (opacity 0), so nothing shows if the
    // animation is ever switched off under it.
    const ring = still
      ? ""
      : `<style>@keyframes aspire-here{from{transform:scale(.4);opacity:.55}to{transform:scale(1);opacity:0}}</style><span style="position:absolute;z-index:-1;left:50%;top:50%;width:40px;height:40px;margin:-20px 0 0 -20px;border-radius:50%;background:${HUD};opacity:0;animation:aspire-here 2s linear infinite"></span>`;
    const halo = still ? `<circle cx="22" cy="22" r="12" fill="${HUD}" opacity=".3"/>` : "";
    const svg = `${ring}<svg width="44" height="44" aria-hidden="true">${halo}<circle cx="22" cy="22" r="7" fill="${HUD}" stroke="#fff" stroke-width="3"/></svg>`;
    const el = pin(t.you, svg);
    el.style.pointerEvents = "none";
    return [new ml.Marker({ element: el }).setLngLat([here.lng, here.lat])];
  }, [here?.lat, here?.lng, still, t.you]);

  // Buses persist between polls so they can glide (1 s) instead of blinking. Route colour; grey and dim when stale.
  const buses = useRef(new Map<string, { m: Marker; at: LatLng }>());
  useEffect(() => {
    if (!gm || !feed) return;
    const now = Date.now(), seen = new Set<string>(), moves: [Marker, LatLng, LatLng][] = [];
    for (const v of feed.vehicles) {
      seen.add(v.id);
      const to = { lat: v.lat, lng: v.lng };
      const stale = isStale(v, now);
      const route = feed.routes.find((r) => r.id === v.routeId);
      let cur = buses.current.get(v.id);
      if (!cur) {
        const el = pin("", ARROW, () => openRef.current({ kind: "bus", name: v.name || v.id, last: feedRef.current?.vehicles.find((x) => x.id === v.id) ?? v }));
        cur = { m: new gm.ml.Marker({ element: el, rotationAlignment: "map" }).setLngLat([v.lng, v.lat]).addTo(gm.map), at: to };
        buses.current.set(v.id, cur);
      } else moves.push([cur.m, cur.at, to]);
      cur.at = to;
      const el = cur.m.getElement();
      el.setAttribute("aria-label", [t.bus, v.name, route?.short, stale ? t.stale : ""].filter(Boolean).join(", "));
      el.style.color = stale ? STALE : hex(route?.color);
      el.style.opacity = stale ? "0.45" : "1";
      const dir = v.heading != null && v.speedKph != null && v.speedKph >= 3 ? v.heading : null;
      const shape = dir == null ? "dot" : "arrow";
      if (el.dataset.shape !== shape) { el.innerHTML = dir == null ? STOPPED : ARROW; el.dataset.shape = shape; }
      cur.m.setRotation(dir ?? 0);
    }
    for (const [id, b] of buses.current) if (!seen.has(id)) { b.m.remove(); buses.current.delete(id); }
    const set = (m: Marker, p: LatLng) => m.setLngLat([p.lng, p.lat]);
    if (still) { moves.forEach(([m, , to]) => set(m, to)); return; }
    const t0 = performance.now();
    let raf = requestAnimationFrame(function step(now) {
      const k = Math.min(1, (now - t0) / 1000);
      moves.forEach(([m, a, b]) => set(m, { lat: a.lat + (b.lat - a.lat) * k, lng: a.lng + (b.lng - a.lng) * k }));
      if (k < 1) raf = requestAnimationFrame(step);
    });
    return () => { cancelAnimationFrame(raf); moves.forEach(([m, , to]) => set(m, to)); };
  }, [gm, feed, polled, still, t]);
  useEffect(() => {
    const all = buses.current;
    return () => { all.forEach((b) => b.m.remove()); all.clear(); };
  }, []);

  useEffect(() => { if (sel) sheetClose.current?.focus(); }, [sel]);
  useEffect(() => { if (fullscreen) box.current?.focus(); }, [fullscreen]);

  const zoom = (d: number) => gm && (d > 0 ? gm.map.zoomIn() : gm.map.zoomOut());
  const locate = () => {
    const go = (at: LatLng | null) => at && gm?.map.easeTo({ center: [at.lng, at.lat], duration: still ? 0 : 800 });
    if (!navigator.geolocation) return go(here);
    navigator.geolocation.getCurrentPosition(
      (p) => { const at = { lat: p.coords.latitude, lng: p.coords.longitude }; setGps(at); go(at); },
      () => go(here),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 },
    );
  };
  const closeSheet = () => { setSel(null); box.current?.focus(); };
  const live = feed ? feed.vehicles.filter((v) => !isStale(v, Date.now())).length : 0;
  const bus = sel?.kind === "bus" ? (feed?.vehicles.find((v) => v.id === sel.last.id) ?? sel.last) : undefined;
  const nearest = here
    ? [...stops.map((s) => ({ ...s, id: undefined, routeIds: [] as string[] })), ...(feed?.stations ?? [])].sort((a, b) => haversineKm(here, a) - haversineKm(here, b)).slice(0, 5)
    : [];

  return (
    <div
      ref={box}
      tabIndex={-1}
      role={fullscreen ? "dialog" : "region"}
      aria-modal={fullscreen || undefined}
      aria-label={t.title}
      onKeyDown={(e) => { if (e.key === "Escape") { if (sel) closeSheet(); else if (fullscreen) onClose?.(); } }}
      className={cn("relative overflow-hidden bg-bg text-base text-ink outline-none", fullscreen && "fixed inset-0 z-50", className)}
    >
      <div
        ref={mapEl}
        className={cn(
          "absolute inset-0 [&_.maplibregl-ctrl-attrib]:bg-[rgb(4_8_16/0.7)] [&_.maplibregl-ctrl-attrib]:text-ink-muted [&_.maplibregl-ctrl-attrib_a]:text-ink-muted",
          // The required attribution clear of the home indicator and the notch.
          "[&_.maplibregl-ctrl-bottom-right]:mb-[env(safe-area-inset-bottom)] [&_.maplibregl-ctrl-bottom-right]:mr-[env(safe-area-inset-right)] [&_.maplibregl-ctrl-bottom-left]:mb-[env(safe-area-inset-bottom)] [&_.maplibregl-ctrl-bottom-left]:ml-[env(safe-area-inset-left)]",
          failed && "hidden",
        )}
        // Inline: maplibre's own CSS sets .maplibregl-map { position: relative }, which beats the class and
        // left the map 0 px tall (blank map).
        style={{ position: "absolute", inset: 0 }}
      />
      {!gm && !failed && (
        <p role="status" className="pointer-events-none absolute inset-0 grid place-items-center text-ink-muted">{t.loading}</p>
      )}

      {/* The text alternative to the canvas: always there for screen readers, shown when the map failed. */}
      <div className={failed ? "flex h-full flex-col justify-center gap-3 overflow-auto px-4 pb-4 pt-16" : "contents"}>
        {failed && <p className="text-body">{t.unavailable}</p>}
        {nearest.length > 0 && (
          <ul aria-label={t.nearest} className={failed ? undefined : "sr-only focus-within:not-sr-only focus-within:absolute focus-within:inset-x-3 focus-within:bottom-3 focus-within:z-20 focus-within:rounded-md focus-within:bg-bg focus-within:p-3"}>
            {nearest.map((s) => (
              <li key={s.id ?? `${s.name}${s.lat}`}>
                <button type="button" onClick={() => open({ kind: "stop", id: s.id, name: s.name, routes: routeNames(s.routeIds) })} className="flex min-h-12 w-full items-center justify-between gap-3 text-left focus-visible:outline-2 focus-visible:outline-accent">
                  <span lang={erdenet && s.id ? "mn" : undefined}>{s.name}</span>
                  <span className="font-mono tabular-nums text-ink-muted">{Math.round(haversineKm(here!, s) * 1000)} m</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {failed && (
          <a href={osmUrl(here)} target="_blank" rel="noopener noreferrer" className={cn(glass, "inline-flex min-h-12 w-fit items-center rounded-full px-5 text-accent focus-visible:outline-2 focus-visible:outline-accent")}>
            {t.open}
          </a>
        )}
      </div>

      {onClose && (
        <button type="button" onClick={onClose} aria-label={t.close} className={cn(btn, top, "absolute left-[max(0.75rem,env(safe-area-inset-left))] z-10")}>
          <X aria-hidden className="size-5" />
        </button>
      )}

      {!failed && (
        <div className={cn(top, "absolute right-[max(0.75rem,env(safe-area-inset-right))] z-10 flex flex-col gap-2")}>
          <button type="button" className={btn} onClick={() => zoom(1)} aria-label={t.zoomIn} disabled={!gm}><Plus aria-hidden className="size-5" /></button>
          <button type="button" className={btn} onClick={() => zoom(-1)} aria-label={t.zoomOut} disabled={!gm}><Minus aria-hidden className="size-5" /></button>
          <button type="button" className={btn} onClick={locate} aria-label={t.locate} disabled={!gm}><LocateFixed aria-hidden className="size-5" /></button>
        </div>
      )}

      {erdenet && (feed || feedDown) && (
        <p className={cn(glass, onClose ? "top-[calc(max(0.75rem,env(safe-area-inset-top))+3.75rem)]" : top, "pointer-events-none absolute left-[max(0.75rem,env(safe-area-inset-left))] z-10 max-w-[calc(100%-5.5rem)] rounded px-2 py-0.5 text-ink-muted")}>
          <span lang="mn">{ERDENET_CREDIT}</span>{" "}
          {feedDown ? <span className="text-signal">· {t.down}</span> : <span className="font-mono tabular-nums text-ink">· {live} {t.live}</span>}
        </p>
      )}

      {sel && (
        <div role="dialog" aria-label={sel.name} className={cn(glass, "absolute left-[max(0.75rem,env(safe-area-inset-left))] right-[max(0.75rem,env(safe-area-inset-right))] bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-20 max-h-[60%] overflow-auto rounded-md p-4")}>
          <p className="sr-only" aria-live="polite" lang={erdenet ? "mn" : undefined}>{etaNote}</p>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="uppercase tracking-[0.12em] text-ink-muted">{sel.kind === "taxi" ? t.taxi : sel.kind === "bus" ? t.bus : t.stop}</p>
              <h3 lang={sel.kind === "bus" || (sel.kind === "stop" && sel.id) ? "mn" : undefined} className={cn("text-lead", sel.kind === "bus" && "font-mono")}>{sel.name}</h3>
              {sel.kind === "stop" && sel.routes.length > 0 && <p lang={erdenet ? "mn" : undefined} className="font-mono text-accent">{sel.routes.join("  ")}</p>}
            </div>
            <button ref={sheetClose} type="button" onClick={closeSheet} aria-label={t.closeSheet} className={btn}><X aria-hidden className="size-5" /></button>
          </div>
          {bus && <BusSheet bus={bus} route={feed?.routes.find((r) => r.id === bus.routeId) ?? null} lang={lang} feedDown={feedDown} showPlate={false} />}
          {sel.kind === "taxi" && sel.phone && (
            <a href={`tel:${sel.phone}`} className="mt-3 inline-flex min-h-12 items-center gap-2 rounded-full bg-accent px-5 text-on-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
              <Phone aria-hidden className="size-5" /> {t.call} <span className="font-mono tabular-nums">{sel.phone}</span>
            </a>
          )}
          {sel.kind === "stop" && eta && (
            eta === "down" ? <p className="mt-3 text-signal first-letter:uppercase">{t.down}</p> : eta.length ? (
              <ul className="mt-3 space-y-1">
                {eta.map((a) => (
                  <li key={`${a.bus}${a.route}`} className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2 font-mono"><span aria-hidden className="size-3 rounded-full" style={{ background: hex(a.color) }} /><span lang={erdenet ? "mn" : undefined}>{a.route}</span> <span className="text-ink-muted">{a.bus}</span>{a.ageS > 30 && <span className="text-ink-muted">· {age(new Date(polled - a.ageS * 1000).toISOString(), polled, lang)}</span>}</span>
                    <span className="font-mono tabular-nums text-accent">{a.minutes} {t.min} <span className="text-ink-muted">({t.approx})</span></span>
                  </li>
                ))}
              </ul>
            ) : <p className="mt-3 text-ink-muted">{t.noBus}</p>
          )}
        </div>
      )}
    </div>
  );
}
