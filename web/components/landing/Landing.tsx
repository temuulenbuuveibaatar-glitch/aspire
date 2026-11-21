// Public homepage for signed-out visitors. A server component: no auth, no hooks, no client JS
// (the FAQ uses <details>, the language switcher is plain ?lang= links).
// Wiring (app/page.tsx): `generateMetadata` -> landingMetadata(lang, bare), and
// <Landing lang={...} /> when there is no session (?lang=, else Accept-Language).
import {
  Bus,
  ChevronDown,
  Download,
  Globe,
  KeyRound,
  Languages,
  Laptop,
  MapPin,
  MessagesSquare,
  Mic,
  Radio,
  Server,
  ShieldCheck,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { HTML_LANG, isLang, LANG_NAMES, LANGS, type Lang } from "@/lib/lang";
import { SITE_URL as ORIGIN } from "@/lib/site";
import type { LandingWeather } from "@/lib/landing-weather";
import { LANDING_TEXT, type LandingText } from "./LandingCopy";
import { LandingSky } from "./LandingSky";

const OG_LOCALE: Record<Lang, string> = { mn: "mn_MN", zh: "zh_CN", en: "en_US", ru: "ru_RU", de: "de_DE" };
const FEATURE_ICONS = [Radio, Languages, WandSparkles, Sparkles, MessagesSquare, ShieldCheck];
const SELF_ICONS = [Laptop, KeyRound, Server];

export const DESKTOP_URL = "https://github.com/temuulenbuuveibaatar-glitch/aspire/releases";

/** `?lang=` is untrusted: take the first value, cap it, keep only a supported base tag. English otherwise. */
export function landingLang(raw: unknown): Lang {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (typeof v !== "string") return "en";
  const base = v.slice(0, 16).trim().toLowerCase().split(/[-_]/, 1)[0];
  return isLang(base) ? base : "en";
}

// Search titles: brand first, then what people search for ("Aspire", "Erdenet", "voice assistant").
export const SEO_TITLE: Record<Lang, string> = {
  en: "Aspire - voice city assistant for Erdenet and every city",
  mn: "Aspire - Эрдэнэт болон бүх хотын дуут туслах",
  zh: "Aspire - 额尔登特及每座城市的语音城市助手",
  ru: "Aspire - голосовой городской помощник для Эрдэнэта и любого города",
  de: "Aspire - Sprachassistent für Erdenet und jede Stadt",
};

/**
 * Metadata for "/". `bare` is for the URL without ?lang= (language picked from Accept-Language):
 * its canonical stays "/" (the x-default), so each URL is canonical to itself.
 */
export function landingMetadata(lang?: unknown, bare = false): Metadata {
  const l = landingLang(lang);
  const t = LANDING_TEXT[l];
  const title = SEO_TITLE[l];
  const url = bare ? "/" : `/?lang=${l}`;
  return {
    metadataBase: new URL(ORIGIN),
    title: { absolute: title },
    description: t.lead,
    alternates: {
      canonical: url,
      languages: { ...Object.fromEntries(LANGS.map((x) => [HTML_LANG[x], `/?lang=${x}`])), "x-default": "/" },
    },
    openGraph: {
      type: "website",
      siteName: "Aspire",
      title,
      description: t.lead,
      url,
      locale: OG_LOCALE[l],
      alternateLocale: LANGS.filter((x) => x !== l).map((x) => OG_LOCALE[x]),
    },
    // Images come from app/opengraph-image.tsx; Twitter inherits them from Open Graph.
    twitter: { card: "summary_large_image", title, description: t.lead },
  };
}

/** schema.org WebSite + SoftwareApplication for search results (rendered as JSON-LD on the page). */
export function landingJsonLd(lang?: unknown) {
  const l = landingLang(lang);
  const t = LANDING_TEXT[l];
  const description = t.lead;
  const url = `${ORIGIN}/`;
  const inLanguage = LANGS.map((x) => HTML_LANG[x]);
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${ORIGIN}/#website`,
        name: "Aspire",
        alternateName: ["Aspire Erdenet", "Aspire Mongolia"],
        url,
        inLanguage,
        description,
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${ORIGIN}/#app`,
        name: "Aspire",
        url,
        inLanguage,
        description,
        applicationCategory: "LifestyleApplication",
        operatingSystem: "Web, Windows, macOS",
        downloadUrl: DESKTOP_URL,
        featureList: ["Voice assistant", "Live buses", "Traffic", "Weather", "Air quality", "Street cameras", "News", "Chat bots", "Open apps", "Desktop actions"],
        // Free: during the Orkhon Hackathon, and always with your own keys.
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      },
    ],
  };
}

// "<" escaped so text in the data can never close the <script> element.
const jsonLdHtml = (l: Lang) => JSON.stringify(landingJsonLd(l)).replace(/</g, "\\u003c");

const PRIMARY =
  "press inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-accent px-6 font-semibold text-on-accent shadow-accent hover:bg-accent-2";
const SECONDARY =
  "press inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-line-strong bg-surface-2 px-6 font-medium text-ink hover:bg-surface-3";
const H2 = "text-greeting text-ink";

export function Landing({ lang, weather }: { lang?: Lang; weather?: Promise<LandingWeather | null> }) {
  const l = landingLang(lang);
  const t = LANDING_TEXT[l];
  return (
    <div lang={HTML_LANG[l]} className="min-h-dvh overflow-x-clip text-ink">
      {/* The root layout renders <html lang="en">; set the document language for JS clients
          (screen readers, Google). The div lang above covers clients without JS. */}
      <script dangerouslySetInnerHTML={{ __html: `document.documentElement.lang=${JSON.stringify(HTML_LANG[l])}` }} />
      {/* The visitor's own sky behind the whole page. The headline never waits for it. */}
      {weather && (
        <Suspense fallback={null}>
          <LandingSky weather={weather} />
        </Suspense>
      )}
      <a href="#main" className="skip-link">
        {t.skip}
      </a>

      <header className="relative z-10 mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 pr-[max(1rem,env(safe-area-inset-right))] pl-[max(1rem,env(safe-area-inset-left))] sm:px-6 pt-[max(1rem,env(safe-area-inset-top))]">
        <a href={`/?lang=${l}`} className="inline-flex min-h-12 items-center font-display text-wordmark text-ink uppercase no-underline">
          Aspire
        </a>
        {/* Phone: wordmark + Sign in on one row, the languages on the next. */}
        <div className="contents sm:flex sm:items-center sm:gap-2">
          <nav aria-label={t.langLabel} className="order-last w-full sm:order-none sm:w-auto">
            <ul className="flex gap-1">
              {LANGS.map((x) => (
                <li key={x}>
                  <a
                    href={`/?lang=${x}`}
                    lang={HTML_LANG[x]}
                    hrefLang={HTML_LANG[x]}
                    aria-current={x === l ? "true" : undefined}
                    className={`press inline-flex min-h-11 min-w-11 items-center justify-center rounded-full px-2 text-label no-underline ${
                      x === l ? "bg-surface-3 text-ink underline decoration-accent decoration-2 underline-offset-4" : "text-ink-muted hover:text-ink"
                    }`}
                  >
                    {/* Accessible name "MN Монгол": starts with the visible code (voice control). */}
                    <span>{LANG_NAMES[x].code}</span>
                    <span className="sr-only"> {LANG_NAMES[x].native}</span>
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <a href="/login" className="press inline-flex min-h-11 items-center rounded-full border border-line-strong px-4 text-label text-ink no-underline hover:bg-surface-2">
            {t.signIn}
          </a>
        </div>
      </header>

      <main id="main" tabIndex={-1} className="relative z-10 mx-auto max-w-6xl pr-[max(1rem,env(safe-area-inset-right))] pl-[max(1rem,env(safe-area-inset-left))] pb-16 outline-none sm:px-6">
        {/* 1. Hero */}
        <section aria-labelledby="hero-title" className="grid items-center gap-10 py-10 sm:py-16 md:grid-cols-[1.15fr_0.85fr]">
          <div>
            {weather && (
              <Suspense fallback={null}>
                <SkyChip weather={weather} />
              </Suspense>
            )}
            <p className="text-label text-accent">{t.eyebrow}</p>
            {/* The brand sits in the h1 so "Aspire" + keyword searches match title, h1 and body. */}
            <h1 id="hero-title" className="mt-3 text-city text-ink">
              <span className="sr-only">Aspire</span>{" "}
              {t.title}
            </h1>
            <p className="mt-5 max-w-[38rem] text-lead text-ink-muted">{t.lead}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="/login" className={`${PRIMARY} no-underline`}>
                {t.cta}
              </a>
              <a href="#how" className={`${SECONDARY} no-underline`}>
                {t.how}
              </a>
            </div>
          </div>
          <HudMock t={t} />
        </section>

        {/* 2. What it does */}
        <section id="features" aria-labelledby="features-title" className="scroll-mt-6 py-10">
          <h2 id="features-title" className={H2}>
            {t.featuresTitle}
          </h2>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {t.features.map((f, i) => {
              const Icon = FEATURE_ICONS[i];
              return (
                <li key={f.title} className="v6-card p-5">
                  <span className="inline-flex size-11 items-center justify-center rounded-full bg-surface-3 text-accent">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <h3 className="mt-4 text-body font-semibold text-ink">{f.title}</h3>
                  <p className="mt-1.5 text-small text-ink-muted">{f.body}</p>
                </li>
              );
            })}
          </ul>
        </section>

        {/* 3. How it works */}
        <section id="how" aria-labelledby="how-title" className="scroll-mt-6 py-10">
          <h2 id="how-title" className={H2}>
            {t.howTitle}
          </h2>
          <ul className="mt-6 grid gap-4 md:grid-cols-3">
            {t.steps.map((s, i) => (
              <li key={s.title} className="v6-card flex gap-4 p-5">
                <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-accent font-mono text-body font-semibold text-on-accent">
                  {i + 1}
                </span>
                <div>
                  <h3 className="text-body font-semibold text-ink">{s.title}</h3>
                  <p className="mt-1 text-small text-ink-muted">{s.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* 4. Cities */}
        <section id="cities" aria-labelledby="cities-title" className="scroll-mt-6 py-10">
          <h2 id="cities-title" className={H2}>
            {t.citiesTitle}
          </h2>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {[
              { Icon: MapPin, ...t.erdenet },
              { Icon: Globe, ...t.world },
            ].map(({ Icon, title, body }) => (
              <div key={title} className="v6-card flex gap-4 p-5">
                <Icon className="mt-0.5 size-6 shrink-0 text-accent" aria-hidden />
                <div>
                  <h3 className="text-body font-semibold text-ink">{title}</h3>
                  <p className="mt-1 text-small text-ink-muted">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 5. Run it yourself: Aspire Desktop, own keys, own server. */}
        <section id="self-host" aria-labelledby="self-title" className="scroll-mt-6 py-10">
          <h2 id="self-title" className={H2}>
            {t.selfTitle}
          </h2>
          <p className="mt-3 max-w-[44rem] text-body text-ink-muted">{t.selfLead}</p>
          <ul className="mt-6 grid gap-4 md:grid-cols-3">
            {t.self.map((s, i) => {
              const Icon = SELF_ICONS[i];
              return (
                <li key={s.title} className="v6-card p-5">
                  <span className="inline-flex size-11 items-center justify-center rounded-full bg-surface-3 text-accent">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <h3 className="mt-4 text-body font-semibold text-ink">{s.title}</h3>
                  <p className="mt-1.5 text-small text-ink-muted">{s.body}</p>
                </li>
              );
            })}
          </ul>
          <div className="mt-6 flex flex-wrap gap-3">
            <a href={DESKTOP_URL} rel="noopener" className={`${PRIMARY} no-underline`}>
              <Download className="size-5" aria-hidden />
              {t.download}
            </a>
          </div>
        </section>

        {/* 6. FAQ */}
        <section id="faq" aria-labelledby="faq-title" className="scroll-mt-6 py-10">
          <h2 id="faq-title" className={H2}>
            {t.faqTitle}
          </h2>
          <div className="mt-6 space-y-3">
            {t.faq.map((item, i) => (
              <details key={item.q} className="group v6-card">
                <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-5 py-3 text-body font-semibold text-ink [&::-webkit-details-marker]:hidden">
                  {item.q}
                  <ChevronDown className="size-5 shrink-0 text-ink-muted transition-transform group-open:rotate-180 still:transition-none" aria-hidden />
                </summary>
                <p className="px-5 pb-5 text-small text-ink-muted">
                  {item.a}
                  {/* The two privacy answers end with a link to the full policy. */ (i === 1 || i === 3) && (
                    <>
                      {" "}
                      <a href={`/privacy#${l}`} className="text-accent underline">
                        {t.privacy}
                      </a>
                    </>
                  )}
                </p>
              </details>
            ))}
          </div>
          <div className="mt-10 flex flex-wrap gap-3">
            <a href="/login" className={`${PRIMARY} no-underline`}>
              {t.cta}
            </a>
          </div>
        </section>
      </main>

      {/* 7. Footer */}
      <footer className="relative z-10 border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 pr-[max(1rem,env(safe-area-inset-right))] pl-[max(1rem,env(safe-area-inset-left))] py-8 pb-[max(2rem,env(safe-area-inset-bottom))] text-small text-ink-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <nav aria-label={t.legal} className="flex gap-2">
            <a href={`/privacy#${l}`} className="inline-flex min-h-11 items-center px-1 text-ink-muted underline hover:text-ink">
              {t.privacy}
            </a>
            <a href={`/terms#${l}`} className="inline-flex min-h-11 items-center px-1 text-ink-muted underline hover:text-ink">
              {t.terms}
            </a>
          </nav>
          <p>{t.built}</p>
        </div>
      </footer>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(l) }} />
    </div>
  );
}

/** What the background shows: the real reading for the visitor's area (or a preview via ?sky= and ?hour=). */
async function SkyChip({ weather }: { weather: Promise<LandingWeather | null> }) {
  const w = await weather;
  if (!w) return null;
  const t = Math.round(w.tempC);
  return (
    <p className="v6-chip mb-4 w-fit gap-2 px-3 py-1 text-meta text-ink">
      <span aria-hidden className="size-1.5 rounded-full bg-accent" />
      <span>{w.place}</span>
      <span className="num">{`${t < 0 ? "−" : ""}${Math.abs(t)}°`}</span>
      <span className="text-ink-muted">{w.preview ? "Preview" : "Open-Meteo"}</span>
    </p>
  );
}

/** CSS-only sketch of the app screen. Labelled as an illustration: none of its numbers are live. */
function HudMock({ t }: { t: LandingText }) {
  const m = t.mock;
  const skyline = [38, 62, 46, 78, 54, 30, 66, 42, 58, 34];
  return (
    <figure className="mx-auto w-full max-w-[20rem]">
      <div role="img" aria-label={m.label} className="rounded-[2.5rem] border border-line-strong bg-surface p-2.5 shadow-lift">
        <div className="overflow-hidden rounded-[2rem] bg-bg">
          {/* "City photo": a gradient sky and a block skyline, no real image. */}
          <div className="relative h-56 bg-[linear-gradient(180deg,#22403f_0%,#3f6b62_48%,#8fb8a6_100%)]">
            <div className="absolute inset-x-0 bottom-0 flex h-24 items-end gap-1 px-2" aria-hidden>
              {skyline.map((h, i) => (
                <div key={i} className="flex-1 rounded-t-sm bg-bg/80" style={{ height: `${h}%` }} />
              ))}
            </div>
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgb(11_19_17/0.55)_0%,transparent_45%,rgb(11_19_17/0.7)_100%)]" />
            <span className="absolute top-4 left-4 text-card text-ink">{m.city}</span>{" "}
            <div className="absolute bottom-4 left-4">
              <span className="block text-[3.25rem] leading-none font-light tracking-tight text-ink">{"−12°"}</span>{" "}
              <span className="text-copy text-ink-muted">{m.sky}</span>
            </div>
          </div>
          <div className="space-y-2.5 p-3">
            <div className="flex items-center gap-3 rounded-[1rem] border border-line bg-surface px-3 py-2.5">
              <span className="inline-flex size-9 items-center justify-center rounded-full bg-surface-3 text-accent">
                <Bus className="size-4" />
              </span>
              <span className="flex-1 text-card text-ink">{m.bus}</span>{" "}
              <span className="font-mono text-value-sm text-sched">{m.mins}</span>
            </div>
            <div className="ml-auto w-fit max-w-[85%] rounded-[1rem] rounded-br-sm bg-surface-2 px-3 py-2 text-copy text-ink">{m.ask}</div>
            <div className="flex justify-center pt-1">
              <span className="inline-flex size-12 items-center justify-center rounded-full bg-accent text-on-accent shadow-accent">
                <Mic className="size-5" />
              </span>
            </div>
          </div>
        </div>
      </div>
      <figcaption className="mt-3 text-center text-small text-ink-faint">{m.note}</figcaption>
    </figure>
  );
}

export default Landing;
