import type { MetadataRoute } from "next";

// PWA manifest. Colours are the globals.css tokens: --color-bg (#0b1311), matching the viewport themeColor.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Aspire - voice city assistant",
    short_name: "Aspire",
    description:
      "A Jarvis-style voice assistant for Erdenet and every city. Ask out loud in Mongolian, Chinese, English, Russian or German.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0b1311",
    theme_color: "#0b1311",
    categories: ["lifestyle", "travel", "utilities"],
    icons: [{ src: "/favicon.ico", sizes: "any", type: "image/x-icon" }],
  };
}
