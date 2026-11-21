import type { MetadataRoute } from "next";

// Public pages only (the app itself needs sign-in). Each language version of the homepage is listed
// as an alternate so Google can show the right one (hreflang).
const BASE = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://aspire-mn.vercel.app";
const LANGS = ["mn", "en", "zh", "ru", "de"] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const languages = Object.fromEntries(LANGS.map((l) => [l, `${BASE}/?lang=${l}`]));
  const updated = new Date("2026-11-21");
  return [
    { url: `${BASE}/`, lastModified: updated, changeFrequency: "weekly", priority: 1, alternates: { languages } },
    { url: `${BASE}/login`, lastModified: updated, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE}/privacy`, lastModified: updated, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE}/terms`, lastModified: updated, changeFrequency: "yearly", priority: 0.3 },
  ];
}
