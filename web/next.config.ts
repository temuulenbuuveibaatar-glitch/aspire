import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

// The in-app players and Erdenet's live cameras page (embedded in the camera sheet).
const PLAYER_ORIGINS = ["https://www.youtube-nocookie.com", "https://open.spotify.com", "https://dedtuv.erdenet.mn"];
const PLAYERS = PLAYER_ORIGINS.map((o) => `"${o}"`).join(" ");

const HOST = /^[a-z0-9.-]+\.[a-z]{2,}$/i;

/** Clerk's Frontend API host, read from the publishable key (pk_test_/pk_live_ + base64 "host$"). */
function clerkOrigin(key = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? ""): string {
  try {
    const host = Buffer.from(key.split("_")[2] ?? "", "base64").toString("utf8").replace(/\$$/, "");
    if (HOST.test(host)) return `https://${host}`;
  } catch {}
  return "https://*.clerk.accounts.dev"; // development instances
}

/** OpenFreeMap (style, tiles, sprites and glyphs on one host), plus a configured map style's origin. */
function mapOrigins(style = process.env.NEXT_PUBLIC_MAP_STYLE_URL ?? ""): string[] {
  const origins = ["https://tiles.openfreemap.org"];
  try {
    const u = new URL(style);
    if (u.protocol === "https:" && HOST.test(u.hostname) && !origins.includes(u.origin)) origins.push(u.origin);
  } catch {}
  return origins;
}

/**
 * Content-Security-Policy. No nonces: Partial Prerendering serves a static shell that cannot carry
 * one (Next's CSP guide, "Without Nonces"), so inline scripts are allowed and the rest is pinned.
 * Pictures come from many https hosts (weather photos, camera snapshots, Clerk avatars), so img-src
 * and media-src allow any https source; scripts, connections, frames and form posts do not.
 * window.__TAURI__ (Aspire Desktop) talks to the native side over ipc: / http(s)://ipc.localhost.
 */
function contentSecurityPolicy(): string {
  const dev = process.env.NODE_ENV !== "production";
  const preview = process.env.VERCEL_ENV === "preview"; // Vercel's comment toolbar on preview builds
  const clerk = clerkOrigin();
  const turnstile = "https://challenges.cloudflare.com"; // Clerk's bot check on sign-up
  const protect = "https://cdn.protect.clerk.com"; // Clerk's sign-in fraud check script
  const toolbar = preview ? ["https://vercel.live"] : [];
  return [
    "default-src 'self'",
    ["script-src 'self' 'unsafe-inline'", clerk, protect, turnstile, ...toolbar, ...(dev ? ["'unsafe-eval'"] : [])].join(" "),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob: https:",
    "font-src 'self' data:",
    ["connect-src 'self'", clerk, "https://*.protect.clerk.com", "https://clerk-telemetry.com", ...mapOrigins(), "ipc:", "http://ipc.localhost", "https://ipc.localhost", ...toolbar, ...(preview ? ["wss://ws-us3.pusher.com"] : [])].join(" "),
    ["frame-src", ...PLAYER_ORIGINS, turnstile, ...toolbar].join(" "),
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy() },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  // Other sites see only the origin, never the path. Not no-referrer: YouTube embeds refuse to play without it.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Microphone and (opt-in) location only for this site; no camera, no payments. The in-app YouTube
  // and Spotify players and Erdenet's cameras page may autoplay after a tap, play protected media and
  // go full screen.
  {
    key: "Permissions-Policy",
    value: [
      "microphone=(self)",
      "camera=()",
      "geolocation=(self)",
      "payment=()",
      `autoplay=(self ${PLAYERS})`,
      `encrypted-media=(self ${PLAYERS})`,
      `fullscreen=(self ${PLAYERS})`,
      `picture-in-picture=(self ${PLAYERS})`,
    ].join(", "),
  },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  // Pages opened from Aspire (links, Clerk's sign-in popups) cannot reach back into this window.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  // Never ship source maps to browsers (this is the default; pinned so it cannot be turned on by accident).
  productionBrowserSourceMaps: false,
  // Crawlers and link previews that get title, canonical and hreflang in <head> (blocking metadata)
  // instead of streamed into <body>. Setting this replaces Next's default list, so the defaults
  // (next/dist/shared/lib/router/utils/html-bots.js) are repeated, plus Googlebot and TelegramBot.
  htmlLimitedBots:
    /Googlebot|TelegramBot|[\w-]+-Google|Google-[\w-]+|Chrome-Lighthouse|Slurp|DuckDuckBot|baiduspider|yandex|sogou|bitlybot|tumblr|vkShare|quora link preview|redditbot|ia_archiver|Bingbot|BingPreview|applebot|facebookexternalhit|facebookcatalog|Twitterbot|LinkedInBot|Slackbot|Discordbot|WhatsApp|SkypeUriPreview|Yeti|googleweblight/i,
  // Keep Turbopack from picking up a stray lockfile in a parent folder.
  turbopack: { root: fileURLToPath(new URL(".", import.meta.url)) },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
