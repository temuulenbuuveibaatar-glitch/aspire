// The public homepage renders on the server in every language, sends visitors to /login,
// and carries no emojis or arrow glyphs.
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DESKTOP_URL, Landing, landingJsonLd, landingLang, landingMetadata, SEO_TITLE } from "@/components/landing/Landing";
import { LANDING_TEXT } from "@/components/landing/LandingCopy";
import { ON_IT } from "@/lib/brain/shared";
import { HTML_LANG, langFrom, LANGS, type Lang } from "@/lib/lang";

// The root layout pulls in fonts and Clerk; only its exported metadata is under test here.
vi.mock("next/font/google", () => {
  const font = () => ({ variable: "font", className: "font" });
  return { Inter: font, Tektur: font, Noto_Sans_SC: font };
});
vi.mock("@clerk/nextjs", () => ({ ClerkProvider: () => null }));
vi.mock("@clerk/ui/themes", () => ({ dark: {} }));

const SYMBOLS = /[\u{2190}-\u{21FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]|\p{Extended_Pictographic}/u;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const render = (lang?: Lang) => renderToString(createElement(Landing, { lang }));
const strings = (x: unknown): string[] =>
  typeof x === "string" ? [x] : x && typeof x === "object" ? Object.values(x).flatMap(strings) : [];

describe("Landing (server render)", () => {
  for (const lang of LANGS) {
    it(`renders in ${lang}`, () => {
      const html = render(lang);
      const t = LANDING_TEXT[lang];
      expect(html).toContain(`lang="${HTML_LANG[lang]}"`);
      expect(html).toMatch(new RegExp(`<a href="/login" class="[^"]*">${esc(t.cta)}</a>`));
      expect(html).toContain('href="#how"');
      expect(html).toContain('id="how"');
      expect(html).toContain(`href="/privacy#${lang}"`);
      expect(html).toContain(`href="/terms#${lang}"`);
      expect(html).toContain(`aria-label="${t.legal}"`);
      expect(html.match(/<h1/g)).toHaveLength(1);
      expect(html.match(/<details/g)).toHaveLength(4);
      // Both privacy answers link to the full policy (plus the footer link).
      expect(html.split(`href="/privacy#${lang}"`).length - 1).toBe(3);
      for (const f of t.features) expect(html).toContain(f.title);
      for (const x of LANGS) expect(html).toContain(`href="/?lang=${x}"`);
      expect(html).toMatch(new RegExp(`href="/\\?lang=${lang}"[^>]*aria-current="true"`));
      expect(html.match(/aria-current="true"/g)).toHaveLength(1);
      expect(html).not.toMatch(SYMBOLS);
    });
  }

  it("falls back to English for an unknown language", () => {
    const html = renderToString(createElement(Landing, { lang: "xx" as Lang }));
    expect(html).toContain(LANDING_TEXT.en.title);
  });

  it("has the same shape and no empty or symbol strings in every language", () => {
    const shape = (o: unknown): unknown =>
      typeof o === "string" ? "s" : Array.isArray(o) ? o.map(shape) : Object.fromEntries(Object.entries(o as object).map(([k, v]) => [k, shape(v)]));
    for (const lang of LANGS) {
      expect(shape(LANDING_TEXT[lang])).toEqual(shape(LANDING_TEXT.en));
      const all = strings(LANDING_TEXT[lang]);
      expect(all.filter((s) => !s.trim())).toEqual([]);
      expect(all.filter((s) => SYMBOLS.test(s))).toEqual([]);
      expect(all.join(" ")).toMatch(/Telegram/);
    }
  });

  it("quotes the app's real task reply and names the third-party processors", () => {
    for (const lang of LANGS) {
      const t = LANDING_TEXT[lang];
      expect(t.features[2].body).toContain(ON_IT.mr[lang].replace(/[.。]$/u, ""));
      for (const name of ["Anthropic", "DeepSeek", "Google", "Microsoft", "ElevenLabs", "Clerk"]) expect(t.faq[1].a).toContain(name);
      // Plain words on the feature card; provider names only in the FAQ answer.
      expect(t.features[5].body).not.toContain("Clerk");
    }
  });

  it("shows no prices or hackathon banner, and reads cleanly as text", () => {
    for (const lang of LANGS) {
      const t = LANDING_TEXT[lang];
      const html = render(lang);
      expect(html).not.toContain('id="pricing"');
      expect(html).not.toMatch(/[$€₮¥]s?d/);
      // Text extraction (screen readers in browse mode, search engines): no run-together words.
      const text = html.replace(/<[^>]+>/g, "");
      expect(text).toContain(`Aspire ${t.title}`);
      expect(text).toContain(`${t.mock.bus} ${t.mock.mins}`);
      // Steps: one visible number each, no <ol> marker on top of it.
      expect(html).not.toContain("<ol");
    }
  });

  it("offers self-hosting and the desktop download in every language", () => {
    for (const lang of LANGS) {
      const t = LANDING_TEXT[lang];
      const html = render(lang);
      expect(html).toContain('id="self-host"');
      expect(html).toContain(`href="${DESKTOP_URL}"`);
      expect(t.self[0].title).toMatch(/Windows.*macOS/);
      expect(t.self[0].body).toContain("Qwen2.5");
    }
  });

  it("covers everything the product does", () => {
    const en = strings(LANDING_TEXT.en).join(" ");
    for (const w of ["buses", "traffic", "weather", "air quality", "cameras", "news", "Telegram", "Discord", "Slack", "Aspire Desktop", "voice", "Mongolian", "German", "device"])
      expect(en).toContain(w);
  });
});

describe("landingLang", () => {
  it("accepts supported tags and rejects everything else", () => {
    expect(landingLang("mn")).toBe("mn");
    expect(landingLang(" RU ")).toBe("ru");
    expect(landingLang("zh-Hans")).toBe("zh");
    expect(landingLang(["de", "mn"])).toBe("de");
    expect(landingLang("fr")).toBe("en");
    expect(landingLang("<script>")).toBe("en");
    expect(landingLang("m".repeat(10_000))).toBe("en");
    expect(landingLang(undefined)).toBe("en");
    expect(landingLang(42)).toBe("en");
    expect(landingLang({ toString: () => "mn" })).toBe("en");
  });
});

describe("landingMetadata", () => {
  it("localises title, description and Open Graph, with hreflang alternates", () => {
    for (const lang of LANGS) {
      const m = landingMetadata(lang);
      const t = LANDING_TEXT[lang];
      expect(m.description).toBe(t.lead);
      expect(JSON.stringify(m.title)).toContain("Aspire");
      expect(m.openGraph?.description).toBe(t.lead);
      expect(m.alternates?.canonical).toBe(`/?lang=${lang}`);
      expect(Object.keys(m.alternates?.languages ?? {})).toEqual(["mn", "zh-Hans", "en", "ru", "de", "x-default"]);
      expect(String(m.metadataBase)).toBe("https://aspire-mn.vercel.app/");
    }
    expect(landingMetadata("nope").alternates?.canonical).toBe("/?lang=en");
  });
});

describe("landing SEO", () => {
  it("uses a localised, brand-first title and a large Twitter card", () => {
    for (const lang of LANGS) {
      const m = landingMetadata(lang);
      expect(m.title).toEqual({ absolute: SEO_TITLE[lang] });
      expect(SEO_TITLE[lang].startsWith("Aspire - ")).toBe(true);
      expect(SEO_TITLE[lang]).not.toMatch(SYMBOLS);
      expect(m.twitter).toMatchObject({ card: "summary_large_image", title: SEO_TITLE[lang] });
      expect(m.openGraph?.title).toBe(SEO_TITLE[lang]);
    }
    expect(SEO_TITLE.en).toBe("Aspire - voice city assistant for Erdenet and every city");
  });

  it("keeps the bare URL canonical to itself (language from Accept-Language)", () => {
    const m = landingMetadata("mn", true);
    expect(m.alternates?.canonical).toBe("/");
    expect(m.description).toBe(LANDING_TEXT.mn.lead);
    expect(landingMetadata("mn").alternates?.canonical).toBe("/?lang=mn");
  });

  it("renders WebSite and SoftwareApplication JSON-LD", () => {
    const html = render("de");
    const m = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/);
    expect(m).not.toBeNull();
    const data = JSON.parse(m![1]);
    expect(data).toEqual(landingJsonLd("de"));
    const [site, app] = data["@graph"];
    expect(site).toMatchObject({ "@type": "WebSite", name: "Aspire", url: "https://aspire-mn.vercel.app/" });
    expect(app).toMatchObject({
      "@type": "SoftwareApplication",
      name: "Aspire",
      applicationCategory: "LifestyleApplication",
    });
    expect(app.offers).toEqual({ "@type": "Offer", price: "0", priceCurrency: "USD" });
    expect(app.operatingSystem).toBe("Web, Windows, macOS");
    expect(app.downloadUrl).toBe(DESKTOP_URL);
    expect(app.inLanguage).toEqual(LANGS.map((x) => HTML_LANG[x]));
    expect(app.description).toBe(LANDING_TEXT.de.lead);
  });
});

describe("root layout metadata", () => {
  it("sets the site defaults search engines and share cards read", async () => {
    const { metadata } = await import("@/app/layout");
    expect(String(metadata.metadataBase)).toBe("https://aspire-mn.vercel.app/");
    expect(metadata.title).toEqual({ default: "Aspire - voice city assistant for Erdenet and every city", template: "%s | Aspire" });
    expect(metadata.keywords).toEqual(
      expect.arrayContaining(["Aspire", "Aspire Erdenet", "Aspire Mongolia", "voice assistant", "Jarvis", "Erdenet bus", "Эрдэнэт автобус", "Aspire туслах", "Orkhon Hackathon"]),
    );
    expect(metadata.robots).toMatchObject({ index: true, follow: true });
    expect(metadata.twitter).toMatchObject({ card: "summary_large_image" });
    expect(metadata.openGraph).toMatchObject({ siteName: "Aspire", type: "website" });
    // No hreflang, canonical or og:url at the root: /login, /privacy and /terms would inherit the homepage ones.
    expect(metadata.alternates).toBeUndefined();
    expect(metadata.openGraph).not.toHaveProperty("url");
    expect(metadata.icons).toBeTruthy();
  });

  it("manifest and sitemap use the same name, colour and hreflang tags", async () => {
    const manifest = (await import("@/app/manifest")).default();
    expect(manifest.short_name).toBe("Aspire");
    expect(manifest.theme_color).toBe("#0b1311");
    expect(manifest.start_url).toBe("/");
    const entries = (await import("@/app/sitemap")).default();
    expect(entries[0].url).toBe("https://aspire-mn.vercel.app/");
    // Every URL of the hreflang set is listed with the full set.
    const home = entries.filter((e) => e.alternates?.languages);
    expect(home.map((e) => e.url)).toEqual(["https://aspire-mn.vercel.app/", ...LANGS.map((l) => `https://aspire-mn.vercel.app/?lang=${l}`)]);
    for (const e of home) expect(Object.keys(e.alternates?.languages ?? {})).toEqual(["mn", "zh-Hans", "en", "ru", "de", "x-default"]);
    expect(entries.map((e) => e.url)).not.toContain("https://aspire-mn.vercel.app/login");
  });
});

describe("langFrom (Accept-Language)", () => {
  it("picks the best supported language, English otherwise", () => {
    expect(langFrom("mn-MN,mn;q=0.9,en;q=0.8")).toBe("mn");
    expect(langFrom("fr-FR,de;q=0.7,en;q=0.5")).toBe("de");
    expect(langFrom("en;q=0.2,ru;q=0.9")).toBe("ru");
    expect(langFrom("zh-CN")).toBe("zh");
    expect(langFrom("fr")).toBe("en");
    expect(langFrom("mn;q=0")).toBe("en");
    expect(langFrom(null)).toBe("en");
    expect(langFrom("x".repeat(10_000))).toBe("en");
  });
});
