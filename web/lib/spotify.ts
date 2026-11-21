import "server-only";
// Spotify Web API search with the app's own client-credentials token (server only; no user login).
// SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET may be missing: callers then fall back to YouTube.
import { isSpotifyId } from "@/lib/tools/types";

export type SpotifyKind = "track" | "playlist";

export interface SpotifyItem {
  uri: string;
  id: string;
  type: SpotifyKind;
  title: string;
  artist: string;
}

const creds = () => ({ id: process.env.SPOTIFY_CLIENT_ID?.trim() ?? "", secret: process.env.SPOTIFY_CLIENT_SECRET?.trim() ?? "" });
export const spotifyConfigured = (): boolean => Boolean(creds().id && creds().secret);

let cached = { token: "", until: 0 };

/** Tests only. */
export function resetSpotifyToken(): void {
  cached = { token: "", until: 0 };
}

async function token(): Promise<string> {
  if (cached.token && Date.now() < cached.until) return cached.token;
  const { id, secret } = creds();
  if (!id || !secret) throw new Error("Spotify is not set up");
  const res = await fetch("https://accounts.spotify.com/api/token", {
    redirect: "error",
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Spotify token error ${res.status}`);
  const body = (await res.json()) as { access_token?: unknown; expires_in?: unknown };
  if (typeof body.access_token !== "string") throw new Error("Spotify token error");
  const ttl = typeof body.expires_in === "number" ? body.expires_in : 3600;
  cached = { token: body.access_token, until: Date.now() + (ttl - 60) * 1000 };
  return cached.token;
}

interface Raw {
  id?: unknown;
  uri?: unknown;
  name?: unknown;
  artists?: Array<{ name?: unknown }>;
  owner?: { display_name?: unknown };
}

/** Up to 3 tracks, then up to 3 playlists, for a free-text query. */
export async function searchSpotify(q: string): Promise<SpotifyItem[]> {
  const query = q.trim().slice(0, 200);
  if (!query) return [];
  const params = new URLSearchParams({ q: query, type: "track,playlist", limit: "3" });
  const res = await fetch(`https://api.spotify.com/v1/search?${params}`, {
    redirect: "error",
    headers: { Authorization: `Bearer ${await token()}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status === 401) resetSpotifyToken();
  if (!res.ok) throw new Error(`Spotify error ${res.status}`);
  const body = (await res.json()) as { tracks?: { items?: Array<Raw | null> }; playlists?: { items?: Array<Raw | null> } };
  const pick = (items: Array<Raw | null> | undefined, type: SpotifyKind): SpotifyItem[] =>
    (items ?? []).flatMap((it) =>
      it && isSpotifyId(it.id)
        ? [{
            uri: `spotify:${type}:${it.id}`,
            id: it.id,
            type,
            title: String(it.name ?? "").slice(0, 200),
            artist: String((type === "track" ? it.artists?.map((a) => a.name).join(", ") : it.owner?.display_name) ?? "").slice(0, 100),
          }]
        : [],
    );
  return [...pick(body.tracks?.items, "track"), ...pick(body.playlists?.items, "playlist")];
}
