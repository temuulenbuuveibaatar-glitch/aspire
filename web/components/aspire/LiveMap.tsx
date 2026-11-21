"use client";

// The live map: Google Maps JS (dark HUD styles), traffic and transit layers, the person,
// stops and taxis; in Erdenet also the city's live buses and route paths from /api/transit
// (proxy of Орхон ТКХДТ's public feed). Falls back to a stop list plus a Google Maps link.

import { useEffect, useRef, useState, type DependencyList } from "react";
import { LocateFixed, Minus, Phone, Plus, TrafficCone, TramFront, X } from "lucide-react";
import type { Lang } from "@/lib/lang";
import type { Arrival, Path, Route, Station, Vehicle } from "@/lib/erdenet-transit";
import { useStill } from "@/lib/display-prefs";
import { ERDENET_CENTER, ERDENET_CREDIT, googleLanguage, haversineKm } from "@/lib/geo";
import { cn } from "@/lib/utils";
import { loadGoogleMaps, onMapsAuthFailure, type GMap, type GMarker, type GOverlay, type LatLng, type MapsApi } from "@/lib/google-maps-loader";

const T: Record<Lang, Record<"title" | "zoomIn" | "zoomOut" | "locate" | "traffic" | "transit" | "close" | "closeSheet" | "unavailable" | "open" | "you" | "stop" | "taxi" | "call" | "approx" | "min" | "noBus" | "live" | "nearest", string>> = {
  en: { title: "Live map", zoomIn: "Zoom in", zoomOut: "Zoom out", locate: "My location", traffic: "Traffic", transit: "Public transport", close: "Close map", closeSheet: "Close", unavailable: "The live map is not available right now.", open: "Open in Google Maps", you: "You are here", stop: "Stop", taxi: "Taxi", call: "Call", approx: "approx.", min: "min", noBus: "No bus is heading here right now.", live: "buses live", nearest: "Nearest stops" },
  mn: { title: "Шууд газрын зураг", zoomIn: "Томруулах", zoomOut: "Жижигрүүлэх", locate: "Миний байршил", traffic: "Замын хөдөлгөөн", transit: "Нийтийн тээвэр", close: "Газрын зургийг хаах", closeSheet: "Хаах", unavailable: "Шууд газрын зураг одоогоор ажиллахгүй байна.", open: "Google Maps-д нээх", you: "Та энд байна", stop: "Буудал", taxi: "Такси", call: "Залгах", approx: "ойролцоогоор", min: "мин", noBus: "Одоогоор энэ буудал руу явж буй автобус алга.", live: "автобус шууд", nearest: "Ойрын буудлууд" },
  zh: { title: "实时地图", zoomIn: "放大", zoomOut: "缩小", locate: "我的位置", traffic: "路况", transit: "公共交通", close: "关闭地图", closeSheet: "关闭", unavailable: "实时地图暂时无法使用。", open: "在 Google 地图中打开", you: "您在这里", stop: "车站", taxi: "出租车", call: "拨打", approx: "约", min: "分钟", noBus: "目前没有公交车开往此站。", live: "辆公交车实时", nearest: "附近车站" },
  ru: { title: "Живая карта", zoomIn: "Приблизить", zoomOut: "Отдалить", locate: "Моё местоположение", traffic: "Пробки", transit: "Общественный транспорт", close: "Закрыть карту", closeSheet: "Закрыть", unavailable: "Живая карта сейчас недоступна.", open: "Открыть в Google Картах", you: "Вы здесь", stop: "Остановка", taxi: "Такси", call: "Позвонить", approx: "примерно", min: "мин", noBus: "Сейчас к этой остановке не едет ни один автобус.", live: "автобусов онлайн", nearest: "Ближайшие остановки" },
  de: { title: "Live-Karte", zoomIn: "Vergrößern", zoomOut: "Verkleinern", locate: "Mein Standort", traffic: "Verkehr", transit: "Nahverkehr", close: "Karte schließen", closeSheet: "Schließen", unavailable: "Die Live-Karte ist gerade nicht verfügbar.", open: "In Google Maps öffnen", you: "Sie sind hier", stop: "Haltestelle", taxi: "Taxi", call: "Anrufen", approx: "ca.", min: "Min.", noBus: "Gerade fährt kein Bus zu dieser Haltestelle.", live: "Busse live", nearest: "Nächste Haltestellen" },
};

const HUD = "#7fe3ff";
const SIGNAL = "#f5c26b";
const STALE = "#93a3bc";
const OUTLINE = "#04121c";

// Dark raster style with cyan accents (no mapId, so JSON styles apply).
const STYLES = [
  { elementType: "geometry", stylers: [{ color: "#0b1220" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#b6c2d6" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#060b16" }] },
  { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#2f6f85" }] },
  { featureType: "landscape.man_made", elementType: "geometry", stylers: [{ color: "#0e1829" }] },
  { featureType: "poi", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#0c1f22" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#1a2740" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#0b1220" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#1f4a5e" }] },
  { featureType: "transit.line", elementType: "geometry", stylers: [{ color: "#2f6f85" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#04202c" }] },
];

/* ---------- Erdenet feed: GET /api/transit (already validated server-side by lib/erdenet-transit) ---------- */

interface TransitFeed { stations: Station[]; paths: Path[]; routes: Route[]; vehicles: Vehicle[]; updatedAt: string | null }
const arr = <X,>(x: unknown): X[] => (Array.isArray(x) ? (x as X[]) : []);
export function parseTransit(json: unknown): TransitFeed {
  const o = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
  return { stations: arr(o.stations), paths: arr(o.paths), routes: arr(o.routes), vehicles: arr(o.vehicles), updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : null };
}
const fresh = (v: Vehicle, now: number) => now - Date.parse(v.updatedAt) < 300_000;

/* ---------- Component ---------- */

type Sel =
  | { kind: "stop"; id?: string; name: string; routes: string[] }
  | { kind: "taxi"; name: string; phone: string | null };

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

const btn = "grid size-12 place-items-center rounded-full border border-[rgb(127_227_255/0.35)] bg-[rgb(4_8_16/0.82)] text-ink transition-colors hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent aria-pressed:border-accent aria-pressed:text-accent";
const glass = "border border-[rgb(127_227_255/0.35)] bg-[rgb(4_8_16/0.86)]";
const top = "top-[max(0.75rem,env(safe-area-inset-top))]";
const tel = (p: string | null) => (p && /^\+?[\d\s()-]{3,20}$/.test(p) ? p.replace(/[^\d+]/g, "") : null);

/** Creates overlays while the map exists and removes them when deps change or on unmount. */
function useOverlays(map: { g: MapsApi; map: GMap } | null, make: (g: MapsApi) => GOverlay[], deps: DependencyList) {
  useEffect(() => {
    if (!map) return;
    const items = make(map.g);
    items.forEach((o) => o.setMap(map.map));
    return () => items.forEach((o) => o.setMap(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, ...deps]);
}

export function LiveMap({ center, lang, stops = [], taxis = [], erdenet = false, className, onClose, fullscreen = false }: LiveMapProps) {
  const t = T[lang] ?? T.en;
  const box = useRef<HTMLDivElement>(null);
  const mapEl = useRef<HTMLDivElement>(null);
  const sheetClose = useRef<HTMLButtonElement>(null);
  const [gm, setGm] = useState<{ g: MapsApi; map: GMap } | null>(null);
  const [failed, setFailed] = useState(false);
  const [traffic, setTraffic] = useState(true);
  const [transit, setTransit] = useState(!erdenet);
  const [feed, setFeed] = useState<TransitFeed | null>(null);
  const [sel, setSel] = useState<Sel | null>(null);
  const [eta, setEta] = useState<Arrival[] | null>(null);
  // Announced once per opened stop (later polls would re-read the whole list every 10 s).
  const [etaNote, setEtaNote] = useState("");
  const announced = useRef<string | undefined>(undefined);
  const [gps, setGps] = useState<LatLng | null>(null); // fresh fix from the "my location" button
  const here = gps ?? center;
  const still = useStill();
  const open = (s: Sel) => { setEta(null); setEtaNote(""); announced.current = undefined; setSel(s); };

  // Load once; the map lives as long as this component. Centring is the effect below.
  useEffect(() => {
    let off = false;
    const unsub = onMapsAuthFailure(() => setFailed(true));
    loadGoogleMaps(googleLanguage(lang)).then((g) => {
      if (off) return;
      if (!g || !mapEl.current) return setFailed(true);
      const map = new g.Map(mapEl.current, {
        center: erdenet ? ERDENET_CENTER : { lat: 20, lng: 0 }, zoom: erdenet ? 13 : 2, styles: STYLES, disableDefaultUI: true,
        // Inline (tablets too): two fingers pan, so a one-finger swipe still scrolls the page.
        clickableIcons: false, gestureHandling: fullscreen ? "greedy" : "cooperative", backgroundColor: "#060b16",
      });
      setGm({ g, map });
    });
    return () => { off = true; unsub(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Centre on the person once the position is known, and again only when it moves more than 1 km
  // (city changed), so periodic position updates do not yank the map while it is being panned.
  const centredAt = useRef<LatLng | null>(null);
  useEffect(() => {
    if (!gm || !center || (centredAt.current && haversineKm(centredAt.current, center) < 1)) return;
    centredAt.current = center;
    gm.map.panTo(center);
    gm.map.setZoom(15);
  }, [gm, center]);

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
          // Static layers are drawn once: keep the first stations/paths so their overlays persist.
          setFeed((prev) => (prev?.stations.length ? { ...prev, vehicles: f.vehicles, updatedAt: f.updatedAt } : f));
        }
      } catch { /* offline or aborted: keep the last picture */ }
      busy = false;
      if (!off) timer = window.setTimeout(tick, 10_000);
    };
    const io = new IntersectionObserver(([e]) => { const was = inView; inView = e.isIntersecting; if (inView && !was) tick(); });
    if (box.current) io.observe(box.current);
    document.addEventListener("visibilitychange", tick);
    tick();
    return () => { off = true; clearTimeout(timer); ctl?.abort(); io.disconnect(); document.removeEventListener("visibilitychange", tick); };
  }, [erdenet]);

  // Next buses at the open stop: the server estimates along the route path; refreshed with each poll.
  const stopId = sel?.kind === "stop" ? sel.id : undefined;
  useEffect(() => {
    if (!stopId) return;
    const ctl = new AbortController();
    fetch(`/api/transit?stop=${encodeURIComponent(stopId)}`, { signal: ctl.signal, cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!j) return;
        const list = arr<Arrival>(j.arrivals);
        setEta(list);
        if (announced.current !== stopId) {
          announced.current = stopId;
          setEtaNote(list.length ? `${list[0].route} ${list[0].minutes} ${t.min} (${t.approx})` : t.noBus);
        }
      })
      .catch(() => {});
    return () => ctl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- t only words the one-time announcement
  }, [stopId, feed?.updatedAt]);

  const routeNames = (ids: string[]) => ids.flatMap((id) => feed?.routes.find((r) => r.id === id)?.short ?? []);

  useOverlays(gm, (g) => (traffic ? [new g.TrafficLayer()] : []), [traffic]);
  useOverlays(gm, (g) => (transit && !erdenet ? [new g.TransitLayer()] : []), [transit, erdenet]);
  useOverlays(gm, (g) => (feed?.paths ?? []).map((p) => new g.Polyline({ path: p.coords.map(([lat, lng]) => ({ lat, lng })), strokeColor: p.color, strokeOpacity: 0.85, strokeWeight: 4, clickable: false })), [feed?.paths]);

  const dot = (g: MapsApi, color: string, scale: number) => ({ path: g.SymbolPath.CIRCLE, scale, fillColor: color, fillOpacity: 1, strokeColor: OUTLINE, strokeWeight: 2 });
  const marker = (g: MapsApi, at: LatLng, title: string, icon: object, onTap: () => void, zIndex = 10) => {
    // A legacy marker gets button semantics and keyboard focus only with a click listener AND optimized: false.
    const m = new g.Marker({ position: { lat: at.lat, lng: at.lng }, title, icon, zIndex, optimized: false });
    m.addListener("click", onTap);
    return m;
  };
  useOverlays(gm, (g) => [
    ...(feed?.stations ?? []).map((s) => marker(g, s, s.name, dot(g, HUD, 5), () => open({ kind: "stop", id: s.id, name: s.name, routes: routeNames(s.routeIds) }))),
    ...stops.map((s) => marker(g, s, s.name, dot(g, "#f2f6fc", 6), () => open({ kind: "stop", name: s.name, routes: [] }))),
    ...taxis.map((x) => marker(g, x, x.name, { path: "M-6 -6H6V6H-6Z", fillColor: SIGNAL, fillOpacity: 1, strokeColor: OUTLINE, strokeWeight: 2 }, () => open({ kind: "taxi", name: x.name, phone: tel(x.phone) }), 20)),
  ], [feed?.stations, JSON.stringify(stops), JSON.stringify(taxis)]); // content, not identity: parents often pass fresh arrays

  useOverlays(gm, (g) => {
    if (!here) return [];
    const pulse = still ? "" : '<animate attributeName="r" values="8;20" dur="2s" repeatCount="indefinite"/><animate attributeName="opacity" values=".55;0" dur="2s" repeatCount="indefinite"/>';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44"><circle cx="22" cy="22" r="12" fill="${HUD}" opacity=".3">${pulse}</circle><circle cx="22" cy="22" r="7" fill="${HUD}" stroke="#fff" stroke-width="3"/></svg>`;
    return [new g.Marker({ position: here, title: t.you, clickable: false, optimized: false, zIndex: 999, icon: { url: `data:image/svg+xml,${encodeURIComponent(svg)}`, anchor: new g.Point(22, 22) } })];
  }, [here?.lat, here?.lng, still, t.you]);

  // Buses persist between polls so they can glide (1 s) instead of blinking. Route colour; grey when stale.
  const buses = useRef(new Map<string, { m: GMarker; at: LatLng }>());
  useEffect(() => {
    if (!gm || !feed) return;
    const now = Date.now(), seen = new Set<string>(), moves: [GMarker, LatLng, LatLng][] = [];
    for (const v of feed.vehicles) {
      seen.add(v.id);
      const to = { lat: v.lat, lng: v.lng };
      const color = !fresh(v, now) ? STALE : (feed.routes.find((r) => r.id === v.routeId)?.color ?? HUD);
      const icon = { path: "M0 -9L6 6L0 2L-6 6Z", rotation: v.heading, scale: 1.3, fillColor: color, fillOpacity: 1, strokeColor: OUTLINE, strokeWeight: 1.5 };
      const cur = buses.current.get(v.id);
      if (!cur) buses.current.set(v.id, { m: new gm.g.Marker({ map: gm.map, position: to, icon, title: v.name, clickable: false, zIndex: 50 }), at: to });
      else { cur.m.setIcon(icon); moves.push([cur.m, cur.at, to]); cur.at = to; }
    }
    for (const [id, b] of buses.current) if (!seen.has(id)) { b.m.setMap(null); buses.current.delete(id); }
    if (still) { moves.forEach(([m, , to]) => m.setPosition(to)); return; }
    const t0 = performance.now();
    let raf = requestAnimationFrame(function step(now) {
      const k = Math.min(1, (now - t0) / 1000);
      moves.forEach(([m, a, b]) => m.setPosition({ lat: a.lat + (b.lat - a.lat) * k, lng: a.lng + (b.lng - a.lng) * k }));
      if (k < 1) raf = requestAnimationFrame(step);
    });
    return () => { cancelAnimationFrame(raf); moves.forEach(([m, , to]) => m.setPosition(to)); };
  }, [gm, feed, still]);
  useEffect(() => {
    const all = buses.current;
    return () => { all.forEach((b) => b.m.setMap(null)); all.clear(); };
  }, []);

  useEffect(() => { if (sel) sheetClose.current?.focus(); }, [sel]);
  useEffect(() => { if (fullscreen) box.current?.focus(); }, [fullscreen]);

  const zoom = (d: number) => gm && gm.map.setZoom((gm.map.getZoom() ?? 14) + d);
  const locate = () => {
    const go = (at: LatLng | null) => at && gm?.map.panTo(at);
    if (!navigator.geolocation) return go(here);
    navigator.geolocation.getCurrentPosition(
      (p) => { const at = { lat: p.coords.latitude, lng: p.coords.longitude }; setGps(at); go(at); },
      () => go(here),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 },
    );
  };
  const closeSheet = () => { setSel(null); box.current?.focus(); };
  const live = feed ? feed.vehicles.filter((v) => fresh(v, Date.now())).length : 0;
  const mapsUrl = here ? `https://www.google.com/maps/search/?api=1&query=${here.lat},${here.lng}` : "https://www.google.com/maps";
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
      <div ref={mapEl} className={cn("absolute inset-0", failed && "hidden")} />

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
          <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className={cn(glass, "inline-flex min-h-12 w-fit items-center rounded-full px-5 text-accent focus-visible:outline-2 focus-visible:outline-accent")}>
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
          <button type="button" className={btn} onClick={() => setTraffic((v) => !v)} aria-label={t.traffic} aria-pressed={traffic}><TrafficCone aria-hidden className="size-5" /></button>
          {!erdenet && (
            <button type="button" className={btn} onClick={() => setTransit((v) => !v)} aria-label={t.transit} aria-pressed={transit}><TramFront aria-hidden className="size-5" /></button>
          )}
        </div>
      )}

      {feed && (
        <p className={cn(glass, "pointer-events-none absolute bottom-[calc(2rem+env(safe-area-inset-bottom))] right-[max(0.75rem,env(safe-area-inset-right))] z-10 rounded px-2 py-0.5 text-ink-muted")}>
          <span lang="mn">{ERDENET_CREDIT}</span> <span className="font-mono tabular-nums text-ink">· {live} {t.live}</span>
        </p>
      )}

      {sel && (
        <div role="dialog" aria-label={sel.name} className={cn(glass, "absolute inset-x-[max(0.75rem,env(safe-area-inset-left))] bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-20 max-h-[60%] overflow-auto rounded-md p-4")}>
          <p className="sr-only" aria-live="polite" lang={erdenet ? "mn" : undefined}>{etaNote}</p>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="uppercase tracking-[0.12em] text-ink-muted">{sel.kind === "taxi" ? t.taxi : t.stop}</p>
              <h3 lang={sel.kind === "stop" && sel.id ? "mn" : undefined} className="text-lead">{sel.name}</h3>
              {sel.kind === "stop" && sel.routes.length > 0 && <p lang={erdenet ? "mn" : undefined} className="font-mono text-accent">{sel.routes.join("  ")}</p>}
            </div>
            <button ref={sheetClose} type="button" onClick={closeSheet} aria-label={t.closeSheet} className={btn}><X aria-hidden className="size-5" /></button>
          </div>
          {sel.kind === "taxi" && sel.phone && (
            <a href={`tel:${sel.phone}`} className="mt-3 inline-flex min-h-12 items-center gap-2 rounded-full bg-accent px-5 text-on-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
              <Phone aria-hidden className="size-5" /> {t.call} <span className="font-mono tabular-nums">{sel.phone}</span>
            </a>
          )}
          {sel.kind === "stop" && eta && (
            eta.length ? (
              <ul className="mt-3 space-y-1">
                {eta.map((a) => (
                  <li key={`${a.bus}${a.route}`} className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2 font-mono"><span aria-hidden className="size-3 rounded-full" style={{ background: a.color }} /><span lang={erdenet ? "mn" : undefined}>{a.route}</span> <span className="text-ink-muted">{a.bus}</span></span>
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
