import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const PLAYERS = '"https://www.youtube-nocookie.com" "https://open.spotify.com"';

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Microphone and (opt-in) location only for this site; no camera, no payments. The in-app YouTube
  // and Spotify players may autoplay after a tap, play protected media and go full screen.
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
  // Keep Turbopack from picking up a stray lockfile in a parent folder.
  turbopack: { root: fileURLToPath(new URL(".", import.meta.url)) },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
