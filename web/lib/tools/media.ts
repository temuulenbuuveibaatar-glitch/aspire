// Media tools: play a YouTube video or Spotify music inside the app (a MediaCard on screen).
import { searchSpotify, spotifyConfigured, type SpotifyKind } from "@/lib/spotify";
import { searchVideos } from "@/lib/youtube";
import { str, type Tool, type ToolContext } from "./types";

async function showVideo(query: string, ctx: ToolContext) {
  try {
    const [v] = await searchVideos(query, ctx.lang ?? "en");
    if (!v) return { error: "No video found; try other words" };
    ctx.actions.push({ type: "video", videoId: v.id, title: v.title, channel: v.channel });
    return { playing: "video", title: v.title, channel: v.channel, note: "The player is on screen; the person taps play" };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "YouTube search failed" };
  }
}

export const playVideo: Tool = {
  name: "play_video",
  label: { mn: "Видео", en: "Video" },
  description:
    "Find a YouTube video and show its player inside the app (how-to, news, a clip, a song's video). Use whenever the person asks to watch or see a video.",
  parameters: {
    type: "object",
    properties: { query: { type: "string", description: "What to search on YouTube, in the person's words" } },
    required: ["query"],
  },
  async run(input, ctx) {
    const query = str(input.query, 200);
    return query ? showVideo(query, ctx) : { error: "query is required" };
  },
};

export const playMusic: Tool = {
  name: "play_music",
  label: { mn: "Хөгжим", en: "Music" },
  description:
    "Play music inside the app: a song, an artist, an album or a mood. Uses Spotify when available (a track or a playlist), otherwise a YouTube video.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Song, artist, album or mood, e.g. 'Queen Bohemian Rhapsody' or 'calm piano'" },
      kind: { type: "string", description: "track = one song; playlist = a mood, genre or 'some music'", enum: ["track", "playlist"] },
    },
    required: ["query", "kind"],
  },
  async run(input, ctx) {
    const query = str(input.query, 200);
    if (!query) return { error: "query is required" };
    const kind: SpotifyKind = str(input.kind, 10) === "playlist" ? "playlist" : "track";
    if (spotifyConfigured()) {
      try {
        const items = await searchSpotify(query);
        const it = items.find((i) => i.type === kind) ?? items[0];
        if (it) {
          ctx.actions.push({ type: "spotify", kind: it.type, id: it.id, title: it.title, artist: it.artist });
          return { playing: `spotify ${it.type}`, title: it.title, artist: it.artist };
        }
      } catch {
        // Spotify down or refused: fall through to YouTube.
      }
    }
    return showVideo(query, ctx);
  },
};
