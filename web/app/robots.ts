import type { MetadataRoute } from "next";

const BASE = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://aspire-mn.vercel.app";

export default function robots(): MetadataRoute.Robots {
  return {
    // Public pages are crawlable; the API and signed-in app are not useful to index.
    rules: [{ userAgent: "*", allow: ["/", "/login", "/privacy", "/terms"], disallow: ["/api/"] }],
    sitemap: `${BASE}/sitemap.xml`,
    host: BASE,
  };
}
