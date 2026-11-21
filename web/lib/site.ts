/** The canonical public origin. Canonicals, hreflang, the sitemap and robots.txt all use it. */
export const SITE_URL = "https://aspire-mn.vercel.app";

/** The User-Agent for every outbound call to public feeds (Erdenet transit, Open-Meteo, Wikimedia). */
export const UA = `Aspire/1.0 (+${SITE_URL})`;

// Public project info shown in the privacy policy and terms.
export const SITE = {
  name: "Aspire",
  team: "Orkhon Hackathon team",
  event: "Orkhon Hackathon, Erdenet (orkhonhackathon.com)",
  repoUrl: process.env.NEXT_PUBLIC_REPO_URL ?? "",
  contactEmail: process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? "",
  updated: "2026-11-21",
};
