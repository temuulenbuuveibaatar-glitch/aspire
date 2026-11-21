import "server-only";
// YouTube Data API v3 search (server only). Same Google Cloud key as Maps (GOOGLE_MAPS_API_KEY),
// sent only in the X-Goog-Api-Key header, never in URLs, logs or error messages.
// Quota: search costs 100 of the 10,000 free daily units; Google refuses past that, nothing is billed.
import { HTML_LANG, type Lang } from "@/lib/lang";
import { isVideoId } from "@/lib/tools/types";

export interface Video {
  id: string;
  title: string;
  channel: string;
}

// Snippet titles arrive HTML-escaped ("Tom &amp; Jerry").
const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'" };
const unescape = (s: string) => s.replace(/&(amp|lt|gt|quot|#39|apos);/g, (_, e: string) => ENTITIES[e]);

/** Up to 3 embeddable videos, moderate safe search, biased to the person's language. */
export async function searchVideos(q: string, lang: Lang = "en"): Promise<Video[]> {
  const key = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (!key) throw new Error("YouTube is not set up");
  const query = q.trim().slice(0, 200);
  if (!query) return [];
  const params = new URLSearchParams({
    part: "snippet",
    type: "video",
    safeSearch: "moderate",
    videoEmbeddable: "true",
    maxResults: "3",
    relevanceLanguage: HTML_LANG[lang],
    q: query,
  });
  let res: Response;
  try {
    res = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`, {
      redirect: "error",
      headers: { "X-Goog-Api-Key": key },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new Error("YouTube is unreachable");
  }
  if (!res.ok) throw new Error(`YouTube error ${res.status}`);
  const body = (await res.json()) as { items?: Array<{ id?: { videoId?: unknown }; snippet?: { title?: unknown; channelTitle?: unknown } }> };
  return (body.items ?? []).flatMap((it) =>
    isVideoId(it.id?.videoId)
      ? [{ id: it.id.videoId, title: unescape(String(it.snippet?.title ?? "")).slice(0, 200), channel: unescape(String(it.snippet?.channelTitle ?? "")).slice(0, 100) }]
      : [],
  );
}
