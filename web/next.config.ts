import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

// The in-app players and Erdenet's live cameras page (embedded in the camera sheet).
const PLAYERS = '"https://www.youtube-nocookie.com" "https://open.spotify.com" "https://dedtuv.erdenet.mn"';

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
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
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
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
