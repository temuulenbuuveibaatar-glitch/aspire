import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MediaCard } from "@/components/aspire/MediaCard";
import { resetSpotifyToken, searchSpotify } from "@/lib/spotify";
import { playMusic, playVideo } from "@/lib/tools/media";
import type { ClientAction, MediaAction, ToolContext } from "@/lib/tools/types";
import { searchVideos } from "@/lib/youtube";

const VID = "dQw4w9WgXcQ";
const SID = "4uLU6hMCjMI75M1A2tKUQC";
const PID = "37i9dQZF1DX4sWSpwq3LiO";

const ctx = (): ToolContext => ({ now: new Date(), lang: "de", device: { memory: {}, reminders: [] }, actions: [] });
const tool = (name: string) => [playVideo, playMusic].find((t) => t.name === name)!;

const yt = { items: [{ id: { videoId: VID }, snippet: { title: "Tom &amp; Jerry &#39;Live&#39;", channelTitle: "Chan" } }, { id: { videoId: "bad" }, snippet: {} }] };
const sp = {
  tracks: { items: [{ id: SID, name: "Bohemian Rhapsody", artists: [{ name: "Queen" }] }] },
  playlists: { items: [null, { id: PID, name: "Peaceful Piano", owner: { display_name: "Spotify" } }] },
};

type Call = { url: string; init?: RequestInit };
function mockFetch(handler: (url: string) => Response) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return handler(String(url));
    }),
  );
  return calls;
}
const json = (b: unknown, status = 200) => Response.json(b, { status });
const routes = (url: string) =>
  url.includes("googleapis.com/youtube")
    ? json(yt)
    : url.includes("accounts.spotify.com")
      ? json({ access_token: "tok", expires_in: 3600 })
      : url.includes("api.spotify.com")
        ? json(sp)
        : json({}, 404);

beforeEach(() => {
  resetSpotifyToken();
  vi.stubEnv("GOOGLE_MAPS_API_KEY", "gkey");
  vi.stubEnv("SPOTIFY_CLIENT_ID", "cid");
  vi.stubEnv("SPOTIFY_CLIENT_SECRET", "csecret");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("searchVideos", () => {
  it("sends the key only in the header, with safe, embeddable, max 3 params", async () => {
    const calls = mockFetch(routes);
    const out = await searchVideos("cats", "zh");
    expect(out).toEqual([{ id: VID, title: "Tom & Jerry 'Live'", channel: "Chan" }]);
    const u = new URL(calls[0].url);
    expect(u.searchParams.get("type")).toBe("video");
    expect(u.searchParams.get("safeSearch")).toBe("moderate");
    expect(u.searchParams.get("videoEmbeddable")).toBe("true");
    expect(u.searchParams.get("maxResults")).toBe("3");
    expect(u.searchParams.get("relevanceLanguage")).toBe("zh-Hans");
    expect(calls[0].url).not.toContain("gkey");
    expect((calls[0].init?.headers as Record<string, string>)["X-Goog-Api-Key"]).toBe("gkey");
  });

  it("errors without leaking the key", async () => {
    mockFetch(() => json({ error: { message: "key gkey bad" } }, 403));
    await expect(searchVideos("x")).rejects.toThrow(/^YouTube error 403$/);
  });
});

describe("searchSpotify", () => {
  it("caches the client-credentials token and maps tracks then playlists", async () => {
    const calls = mockFetch(routes);
    const out = await searchSpotify("queen");
    await searchSpotify("piano");
    expect(out).toEqual([
      { uri: `spotify:track:${SID}`, id: SID, type: "track", title: "Bohemian Rhapsody", artist: "Queen" },
      { uri: `spotify:playlist:${PID}`, id: PID, type: "playlist", title: "Peaceful Piano", artist: "Spotify" },
    ]);
    expect(calls.filter((c) => c.url.includes("accounts.spotify.com"))).toHaveLength(1);
    expect((calls[1].init?.headers as Record<string, string>).Authorization).toBe("Bearer tok");
  });
});

describe("media tools", () => {
  it("play_video pushes a video action", async () => {
    mockFetch(routes);
    const c = ctx();
    const out = (await tool("play_video").run({ query: "cats" }, c)) as Record<string, unknown>;
    expect(out.title).toBe("Tom & Jerry 'Live'");
    expect(c.actions).toEqual([{ type: "video", videoId: VID, title: "Tom & Jerry 'Live'", channel: "Chan" }]);
  });

  it("play_music uses Spotify and picks the asked kind", async () => {
    mockFetch(routes);
    const c = ctx();
    await tool("play_music").run({ query: "calm piano", kind: "playlist" }, c);
    expect(c.actions).toEqual([{ type: "spotify", kind: "playlist", id: PID, title: "Peaceful Piano", artist: "Spotify" }]);
  });

  it("play_music falls back to YouTube when Spotify is not configured", async () => {
    vi.stubEnv("SPOTIFY_CLIENT_SECRET", "");
    const calls = mockFetch(routes);
    const c = ctx();
    await tool("play_music").run({ query: "queen", kind: "track" }, c);
    expect(c.actions[0]).toMatchObject({ type: "video", videoId: VID });
    expect(calls.some((x) => x.url.includes("spotify"))).toBe(false);
  });

  it("play_music falls back to YouTube when Spotify fails", async () => {
    mockFetch((u) => (u.includes("spotify") ? json({}, 500) : routes(u)));
    const c = ctx();
    await tool("play_music").run({ query: "queen", kind: "track" }, c);
    expect(c.actions[0]).toMatchObject({ type: "video" });
  });

  it("play_video reports a missing key without calling out", async () => {
    vi.stubEnv("GOOGLE_MAPS_API_KEY", "");
    const calls = mockFetch(routes);
    expect(await tool("play_video").run({ query: "cats" }, ctx())).toEqual({ error: "YouTube is not set up" });
    expect(calls).toHaveLength(0);
  });

  it("rejects an empty query", async () => {
    const c = ctx();
    expect(await tool("play_video").run({ query: "  " }, c)).toEqual({ error: "query is required" });
    expect(c.actions).toEqual([]);
  });
});

describe("MediaCard", () => {
  const html = (action: ClientAction) => renderToString(createElement(MediaCard, { action: action as MediaAction, lang: "ru", onClose: () => {} }));

  it("embeds youtube-nocookie with a title and lazy loading", () => {
    const h = html({ type: "video", videoId: VID, title: "Cats", channel: "Chan" });
    expect(h).toContain(`https://www.youtube-nocookie.com/embed/${VID}?playsinline=1`);
    expect(h).toContain('title="Плеер: Cats"');
    expect(h).toContain('loading="lazy"');
    expect(h).toContain('aria-label="Закрыть"');
  });

  it("embeds Spotify and refuses bad ids", () => {
    expect(html({ type: "spotify", kind: "track", id: SID, title: "B", artist: "Q" })).toContain(`https://open.spotify.com/embed/track/${SID}`);
    expect(html({ type: "video", videoId: "x/../evil", title: "", channel: "" })).toBe("");
  });
});
