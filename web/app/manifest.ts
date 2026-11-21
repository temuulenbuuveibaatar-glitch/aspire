import type { MetadataRoute } from "next";

// PWA manifest. Colours are the globals.css tokens: --color-bg (#050505), matching the viewport themeColor.
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
    background_color: "#050505",
    theme_color: "#050505",
    categories: ["lifestyle", "travel", "utilities"],
    icons: [{ src: "/favicon.ico", sizes: "any", type: "image/x-icon" }],
  };
}
