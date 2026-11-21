import type { MetadataRoute } from "next";
import { HTML_LANG, LANGS } from "@/lib/lang";
import { SITE_URL } from "@/lib/site";

// Public pages only (the app itself needs sign-in; "/" shows the landing page when signed out).
// Every URL of the homepage hreflang set gets its own entry carrying the full set (itself included),
// the same tags as landingMetadata, with "/" as x-default. /login is a thin sign-in page: not listed.
export default function sitemap(): MetadataRoute.Sitemap {
  const languages = {
    ...Object.fromEntries(LANGS.map((l) => [HTML_LANG[l], `${SITE_URL}/?lang=${l}`])),
    "x-default": `${SITE_URL}/`,
  };
  const updated = new Date("2026-11-21");
  const home = ["/", ...LANGS.map((l) => `/?lang=${l}`)];
  return [
    ...home.map((p) => ({
      url: `${SITE_URL}${p}`,
      lastModified: updated,
      changeFrequency: "weekly" as const,
      priority: p === "/" ? 1 : 0.9,
      alternates: { languages },
    })),
    { url: `${SITE_URL}/privacy`, lastModified: updated, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/terms`, lastModified: updated, changeFrequency: "yearly", priority: 0.3 },
  ];
}
