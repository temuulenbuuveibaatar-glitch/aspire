"use client";

import { X } from "lucide-react";
import type { Lang } from "@/lib/lang";
import { isSpotifyId, isVideoId, type MediaAction } from "@/lib/tools/types";

const TEXT: Record<Lang, { video: string; music: string; playlist: string; player: string; close: string }> = {
  mn: { video: "Видео", music: "Хөгжим", playlist: "Жагсаалт", player: "Тоглуулагч", close: "Хаах" },
  zh: { video: "视频", music: "音乐", playlist: "歌单", player: "播放器", close: "关闭" },
  en: { video: "Video", music: "Music", playlist: "Playlist", player: "Player", close: "Close" },
  ru: { video: "Видео", music: "Музыка", playlist: "Плейлист", player: "Плеер", close: "Закрыть" },
  de: { video: "Video", music: "Musik", playlist: "Playlist", player: "Player", close: "Schließen" },
};

/** In-app player: YouTube (16:9, privacy-enhanced) or Spotify (compact 152px). Ids are re-checked here. */
export function MediaCard({ action, lang, onClose }: { action: MediaAction; lang: Lang; onClose?: () => void }) {
  const t = TEXT[lang] ?? TEXT.en;
  const video = action.type === "video";
  if (video ? !isVideoId(action.videoId) : !isSpotifyId(action.id) || !["track", "playlist"].includes(action.kind)) return null;
  const label = video ? t.video : action.kind === "playlist" ? t.playlist : t.music;
  const by = video ? action.channel : action.artist;
  const src = video
    ? `https://www.youtube-nocookie.com/embed/${action.videoId}?playsinline=1&rel=0&hl=${lang}`
    : `https://open.spotify.com/embed/${action.kind}/${action.id}?theme=0`;

  return (
    <section className="hud flex flex-col gap-2 p-3 text-ink" aria-label={`${label}: ${action.title}`}>
      <header className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-label uppercase tracking-[0.12em] text-ink-muted">
            {label} / {video ? "YouTube" : "Spotify"}
          </p>
          <p className="truncate text-body font-medium">{action.title}</p>
          {by && <p className="truncate text-small text-ink-muted">{by}</p>}
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label={t.close}
            className="grid size-12 shrink-0 place-items-center rounded-full text-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
          >
            <X aria-hidden className="size-5" />
          </button>
        )}
      </header>
      <iframe
        src={src}
        title={`${t.player}: ${action.title}`}
        allow="autoplay; encrypted-media; picture-in-picture"
        allowFullScreen={video}
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
        className={video ? "aspect-video w-full rounded-md border-0" : "h-[152px] w-full rounded-md border-0"}
      />
    </section>
  );
}
