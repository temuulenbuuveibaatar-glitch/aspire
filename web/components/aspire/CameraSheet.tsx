"use client";

// Public cameras near a point (GET /api/cameras): a list, and a viewer for the one picked.
// embed/video play in a sandboxed iframe, image shows the snapshot with its credit and its age (or
// that the source gives no time), link opens the operator's own site in a new tab. Every URL is
// checked again here (safeCameraUrl) before it reaches the page. Nothing found = said plainly; a
// source that did not answer is never passed off as "no cameras".

import { ExternalLink } from "lucide-react";
import { Fragment, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ageS, ageText } from "@/components/v6/Card";
import { HTML_LANG, type Lang } from "@/lib/lang";
import { cameraName, isHls, safeCameraUrl, safeImageUrl, type Camera, type CameraKind } from "@/lib/tools/camera-types";
import { Sheet } from "./Sheet";

type Key =
  | "title" | "close" | "loading" | "empty" | "error" | "partly" | "notAll" | "open" | "newTab" | "km" | "at" | "source" | "clip" | "stream" | "noTime" | "checked";
export const CAMERA_TEXT: Record<Lang, Record<Key, string> & { kinds: Record<CameraKind, string> }> = {
  mn: {
    title: "Ойролцоох камерууд", close: "Хаах", loading: "Камер хайж байна", empty: "Энд ойролцоо нийтэд нээлттэй камер алга",
    error: "Камерын мэдээлэл одоо ирэхгүй байна. Дараа дахин оролдоно уу.", partly: "Зарим эх сурвалж хариу өгсөнгүй",
    notAll: "Зарим эх сурвалж хариу өгөөгүй тул бүх камерыг шалгаж чадсангүй. Дараа дахин оролдоно уу.", open: "Сайтыг нээх",
    newTab: "шинэ цонхонд нээгдэнэ", km: "км", at: "Зургийн цаг", source: "Эх сурвалж", clip: "Богино бичлэг", stream: "Шууд дамжуулалт",
    noTime: "Эх сурвалж зургийн цагийг заагаагүй; оператор хэдэн минут тутам шинэчилдэг.", checked: "Шалгах үед шууд гарч байсан",
    kinds: { embed: "Шууд хуудас", video: "Шууд дамжуулалт", image: "Агшин зураг", link: "Вэб сайт" },
  },
  zh: {
    title: "附近的摄像头", close: "关闭", loading: "正在查找摄像头", empty: "附近没有公开的摄像头",
    error: "摄像头信息暂时无法获取，请稍后再试。", partly: "部分来源没有响应",
    notAll: "部分摄像头来源没有响应，无法检查所有摄像头。请稍后再试。", open: "打开网站",
    newTab: "在新标签页中打开", km: "公里", at: "画面时间", source: "来源", clip: "短视频", stream: "直播流",
    noTime: "来源未提供画面时间；运营方每隔几分钟更新一次。", checked: "检查时正在直播",
    kinds: { embed: "直播页面", video: "直播视频", image: "快照", link: "网站" },
  },
  en: {
    title: "Cameras nearby", close: "Close", loading: "Looking for cameras", empty: "No public cameras near here",
    error: "Camera information is not available right now. Please try again later.", partly: "Some sources did not answer",
    notAll: "Some camera sources did not answer, so not every camera could be checked. Please try again later.", open: "Open site",
    newTab: "opens in a new tab", km: "km", at: "Picture taken", source: "Source", clip: "Short clip", stream: "Live stream",
    noTime: "Time not given by the source; the operator refreshes it every few minutes.", checked: "Live when checked",
    kinds: { embed: "Live page", video: "Live video", image: "Snapshot", link: "Website" },
  },
  ru: {
    title: "Камеры рядом", close: "Закрыть", loading: "Ищу камеры", empty: "Рядом нет общедоступных камер",
    error: "Данные о камерах сейчас недоступны. Попробуйте позже.", partly: "Некоторые источники не ответили",
    notAll: "Некоторые источники камер не ответили, поэтому проверить все камеры не удалось. Попробуйте позже.", open: "Открыть сайт",
    newTab: "откроется в новой вкладке", km: "км", at: "Снимок сделан", source: "Источник", clip: "Короткое видео", stream: "Прямая трансляция",
    noTime: "Источник не указывает время снимка; оператор обновляет его каждые несколько минут.", checked: "В эфире при проверке",
    kinds: { embed: "Онлайн-страница", video: "Прямой эфир", image: "Снимок", link: "Сайт" },
  },
  de: {
    title: "Kameras in der Nähe", close: "Schließen", loading: "Suche Kameras", empty: "Keine öffentlichen Kameras in der Nähe",
    error: "Kameradaten sind gerade nicht verfügbar. Bitte später erneut versuchen.", partly: "Einige Quellen haben nicht geantwortet",
    notAll: "Einige Kameraquellen haben nicht geantwortet, daher konnten nicht alle Kameras geprüft werden. Bitte später erneut versuchen.", open: "Website öffnen",
    newTab: "öffnet in neuem Tab", km: "km", at: "Bild von", source: "Quelle", clip: "Kurzer Clip", stream: "Livestream",
    noTime: "Die Quelle nennt keine Bildzeit; der Betreiber aktualisiert das Bild alle paar Minuten.", checked: "Live bei Prüfung",
    kinds: { embed: "Live-Seite", video: "Live-Video", image: "Standbild", link: "Website" },
  },
};

export type CameraState = { status: "loading" } | { status: "error" } | { status: "ok"; cameras: Camera[]; credit: string[]; partly: boolean };

const KINDS: readonly CameraKind[] = ["embed", "image", "link", "video"];

/** The /api/cameras answer, re-checked: unknown shapes and unsafe URLs are dropped. */
export function toCameraState(data: unknown): CameraState {
  const d = data as { cameras?: unknown; credit?: unknown; unavailable?: unknown } | null;
  if (!d || !Array.isArray(d.cameras)) return { status: "error" };
  const cameras: Camera[] = [];
  for (const c of d.cameras as Partial<Camera>[]) {
    const kind = c?.kind;
    if (!kind || !KINDS.includes(kind)) continue;
    const url = safeCameraUrl(kind, c.url);
    const { id, name, lat, lng, distanceKm, source, credit, updatedAt } = c;
    if (!url || typeof id !== "string" || typeof name !== "string" || typeof credit !== "string" || typeof source !== "string") continue;
    if (![lat, lng, distanceKm].every((n) => typeof n === "number" && Number.isFinite(n))) continue;
    cameras.push({
      id: id.slice(0, 80), name: name.slice(0, 120), lat: lat!, lng: lng!, distanceKm: distanceKm!, kind, url, source, credit: credit.slice(0, 120),
      thumb: safeImageUrl(c.thumb) ?? undefined, clip: safeImageUrl(c.clip) ?? undefined,
      updatedAt: typeof updatedAt === "string" && Number.isFinite(Date.parse(updatedAt)) ? updatedAt : undefined,
    });
  }
  const credit = Array.isArray(d.credit) ? d.credit.filter((x): x is string => typeof x === "string") : [];
  return { status: "ok", cameras, credit, partly: Array.isArray(d.unavailable) && d.unavailable.length > 0 };
}

export function CameraSheet(props: { lat: number; lng: number; lang: Lang; onClose: () => void }) {
  const { lat, lng, lang, onClose } = props;
  const t = CAMERA_TEXT[lang] ?? CAMERA_TEXT.en;
  const query = new URLSearchParams({ lat: lat.toFixed(3), lng: lng.toFixed(3) }).toString();
  // The answer is kept with the query it belongs to, so a new position shows "loading" by itself.
  const [answer, setAnswer] = useState<{ query: string; state: CameraState } | null>(null);
  const state: CameraState = answer?.query === query ? answer.state : { status: "loading" };

  useEffect(() => {
    const ctl = new AbortController();
    fetch(`/api/cameras?${query}`, { signal: ctl.signal, cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setAnswer({ query, state: toCameraState(d) }))
      .catch(() => {
        if (!ctl.signal.aborted) setAnswer({ query, state: { status: "error" } });
      });
    return () => ctl.abort();
  }, [query]);

  return (
    <Sheet open title={t.title} closeLabel={t.close} onClose={onClose}>
      <CameraPanel key={query} state={state} lang={lang} />
    </Sheet>
  );
}

const subscribeNothing = () => () => {};
const subscribeTick = (cb: () => void) => {
  const id = window.setInterval(cb, 15_000);
  return () => window.clearInterval(id);
};
let hlsNative: boolean | null = null;
/** Whether this browser plays an HLS stream itself (Safari, iOS); false on the server. */
const canPlayHls = () => (hlsNative ??= document.createElement("video").canPlayType("application/vnd.apple.mpegurl") !== "");

/** The sheet's content (no fetching): exported so it can be rendered on its own. */
export function CameraPanel({ state, lang }: { state: CameraState; lang: Lang }) {
  const t = CAMERA_TEXT[lang] ?? CAMERA_TEXT.en;
  const [picked, setPicked] = useState<string | null>(null);
  // The viewer opens above the list: focus moves to it so screen readers and keyboards land on the picked
  // camera. The figcaption (name, source, time) names the figure, so the image alt says only its kind.
  const viewer = useRef<HTMLElement>(null);
  useEffect(() => {
    if (picked) viewer.current?.focus();
  }, [picked]);
  // The clock in 15 s steps for picture ages; null on the server.
  const step = useSyncExternalStore(subscribeTick, () => Math.floor(Date.now() / 15_000), () => null);
  const now = step == null ? null : step * 15_000;
  const hls = useSyncExternalStore(subscribeNothing, canPlayHls, () => false);

  if (state.status === "loading") return <p role="status" className="text-body text-ink-muted">{t.loading}</p>;
  if (state.status === "error") return <p role="status" className="text-body text-ink-muted">{t.error}</p>;
  if (!state.cameras.length)
    return (
      <p role="status" className="text-body text-ink">
        {state.partly ? t.notAll : t.empty}
      </p>
    );

  const current = state.cameras.find((c) => c.id === picked && c.kind !== "link");
  const time = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString(HTML_LANG[lang], { hour: "2-digit", minute: "2-digit" }) : null);
  /** "10:42 (3 min ago)": the clock time and, once the clock runs, how old it is. */
  const when = (iso: string) => {
    const s = ageS(iso, now);
    return (
      <>
        <span className="font-mono tabular-nums">{time(iso)}</span>
        {s != null && <> ({ageText(s, lang)})</>}
      </>
    );
  };
  // TfL's mp4 plays everywhere; Caltrans' HLS stream only where the browser plays HLS itself.
  const clip = current?.kind === "image" && current.clip && (!isHls(current.clip) || hls) ? current.clip : null;
  const currentName = current ? cameraName(current, lang) : "";
  const osmCredit = state.cameras.find((c) => c.source === "osm")?.credit;
  const row = "press flex min-h-12 w-full items-center gap-3 rounded-[var(--radius-md)] border border-line bg-panel-2 px-3 py-2 text-left hover:bg-panel-3";

  return (
    <div className="flex flex-col gap-3">
      {current && (
        <figure ref={viewer} tabIndex={-1} className="flex flex-col gap-2 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
          {current.kind === "image" ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element -- remote snapshot from an allow-listed host */}
              <img src={current.url} alt={t.kinds.image} loading="lazy" referrerPolicy="no-referrer" className="w-full rounded-[var(--radius-md)] border border-line bg-bg" />
              {clip && (
                <>
                  <p className="text-small text-ink-muted">{isHls(clip) ? t.stream : t.clip}</p>
                  <video src={clip} controls muted playsInline preload="none" aria-label={`${currentName}: ${isHls(clip) ? t.stream : t.clip}`} className="w-full rounded-[var(--radius-md)] border border-line bg-bg" />
                </>
              )}
            </>
          ) : (
            <iframe
              src={current.url}
              title={currentName}
              // YouTube's own links (logo, title) must open: its policies forbid blocking player features.
              sandbox={"allow-scripts allow-same-origin allow-presentation" + (current.kind === "video" ? " allow-popups allow-popups-to-escape-sandbox" : "")}
              allow={current.kind === "video" ? "fullscreen; picture-in-picture" : "autoplay; fullscreen"}
              allowFullScreen
              loading="lazy"
              // YouTube's player needs a Referer (else "Error 153"); the city page gets none.
              referrerPolicy={current.kind === "video" ? "strict-origin-when-cross-origin" : "no-referrer"}
              className={"w-full rounded-[var(--radius-md)] border border-line bg-bg " + (current.kind === "video" ? "aspect-video" : "h-[min(60dvh,560px)] min-h-[320px]")}
            />
          )}
          <figcaption className="text-small text-ink-muted">
            {currentName}. {t.source}: {current.credit}.
            {current.kind === "video" && current.updatedAt && <> {t.checked}: {when(current.updatedAt)}.</>}
            {current.kind === "image" && (current.updatedAt ? <> {t.at}: {when(current.updatedAt)}.</> : <> {t.noTime}</>)}
          </figcaption>
        </figure>
      )}

      {state.partly && <p className="text-small text-ink-muted">{t.partly}</p>}

      <ul className="flex flex-col gap-2">
        {state.cameras.map((c) => {
          const body = (
            <>
              <span className="min-w-0 flex-1">
                <span className="block text-body text-ink [overflow-wrap:anywhere]">{cameraName(c, lang)}</span>
                <span className="block text-small text-ink-muted">
                  {t.kinds[c.kind]} · <span className="font-mono tabular-nums">{c.distanceKm.toFixed(1)} {t.km}</span> · {c.credit}
                </span>
              </span>
              {c.kind === "link" && <ExternalLink aria-hidden className="size-5 shrink-0 text-ink-muted" />}
            </>
          );
          return (
            <li key={c.id}>
              {c.kind === "link" ? (
                <a href={c.url} target="_blank" rel="noopener noreferrer" className={row}>
                  {body}
                  <span className="sr-only">({t.open}, {t.newTab})</span>
                </a>
              ) : (
                <button type="button" aria-pressed={c.id === current?.id} onClick={() => setPicked(c.id)} className={row}>
                  {body}
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {state.credit.length > 0 && (
        <p className="text-small text-ink-muted">
          {t.source}:{" "}
          {state.credit.map((c, i) => (
            <Fragment key={c}>
              {i > 0 && "; "}
              {c === osmCredit ? (
                <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="underline">
                  {c}
                </a>
              ) : (
                c
              )}
            </Fragment>
          ))}
        </p>
      )}
    </div>
  );
}
