// The opening page for signed-out visitors, top to bottom: a short intro (first visit only), the
// instrument bar that stays on screen, the hero (the app's voice orb inside its gauge, the visitor's
// own sky and its readings, the headline), the scroll story, the city marquee and what Aspire does
// (./Story, ./Bento), then how it works, run it yourself, the questions, the close and the footer.
//
// A server component: every word is in the HTML and readable with no JavaScript. The client parts
// (Intro, HeroScene and the bar's small parts, SkyLayer, Cta, Cursor and the story) only add motion
// on top of what is already there.
//
// Wiring (app/page.tsx): `generateMetadata` -> landingMetadata(lang, bare), and
// <Landing lang={...} weather={landingWeather(...)} /> when there is no session. The weather is a
// promise that is NOT awaited: the headline and everything else render at once, and the places that
// show the reading (the sky behind the page, the bar, the readings beside the hero, the story) read
// it inside <Suspense>. Until it arrives, and when there is none, the page keeps its plain dark look
// and those places stay empty: nothing is ever made up.
import "./landing.css";
import { Download, KeyRound, Laptop, Plus, Server } from "lucide-react";
import type { Metadata } from "next";
import { Fragment, Suspense, use, type CSSProperties } from "react";
import { PROVIDER } from "@/components/v6/Card";
import { textFor } from "@/components/v6/text";
import { HTML_LANG, isLang, LANG_NAMES, LANGS, type Lang } from "@/lib/lang";
import type { LandingWeather } from "@/lib/landing-weather";
import { SITE_URL as ORIGIN } from "@/lib/site";
import { temp } from "@/lib/utils";
import { Bento } from "./Bento";
import { Cta, Stamp } from "./Cta";
import { Cursor } from "./Cursor";
import { HeroScene, MotionSwitch, PlaceTime, SceneNav, ScrollTicks, type SceneLink } from "./HeroScene";
import { Intro } from "./Intro";
import { LANDING_TEXT, type LandingText } from "./LandingCopy";
import { landingScene, usableWeather } from "./scene";
import { SkyLayer } from "./SkyLayer";
import { Marquee, Story } from "./Story";
import { storyCopy } from "./story/copy";

const OG_LOCALE: Record<Lang, string> = { mn: "mn_MN", zh: "zh_CN", en: "en_US", ru: "ru_RU", de: "de_DE" };
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
    description: t.description,
    alternates: {
      canonical: url,
      languages: { ...Object.fromEntries(LANGS.map((x) => [HTML_LANG[x], `/?lang=${x}`])), "x-default": "/" },
    },
    openGraph: {
      type: "website",
      siteName: "Aspire",
      title,
      description: t.description,
      url,
      locale: OG_LOCALE[l],
      alternateLocale: LANGS.filter((x) => x !== l).map((x) => OG_LOCALE[x]),
    },
    // Images come from app/opengraph-image.tsx; Twitter inherits them from Open Graph.
    twitter: { card: "summary_large_image", title, description: t.description },
  };
}

/** schema.org WebSite + SoftwareApplication for search results (rendered as JSON-LD on the page). */
export function landingJsonLd(lang?: unknown) {
  const l = landingLang(lang);
  const description = LANDING_TEXT[l].description;
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
        featureList: ["Voice assistant", "Live buses", "Traffic", "Weather", "Air quality", "Street cameras", "City map", "News", "Reminders", "Reading text in photos", "Chat bots", "Open apps", "Desktop actions"],
        // Free, with no conditions.
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      },
    ],
  };
}

// "<" escaped so text in the data can never close the <script> element.
const jsonLdHtml = (l: Lang) => JSON.stringify(landingJsonLd(l)).replace(/</g, "\\u003c");

// In the theme layer on purpose: Tailwind's reset hides [hidden] with !important from the base
// layer, and among !important rules an earlier layer wins.
const NO_SCRIPT_CSS = "@layer theme{div[hidden]:has(> .lp-root){display:block!important}}body>main:empty,.lp-bar button{display:none}";

type Reading = Promise<LandingWeather | null> | undefined;
/** The reading with the minute the server read its clock at, so the clocks are in the HTML. */
type Stamped = Promise<{ w: LandingWeather; minute: number } | null> | undefined;

const minuteNow = () => Math.floor(Date.now() / 60_000);
/** Custom properties for landing.css: the place in a staggered entrance, the headline's width. */
const vars = (v: Record<`--${string}`, string | number>) => v as CSSProperties;
/** The steps of "how it works" are lettered. */
const LETTERS = ["A", "B", "C"];

/**
 * How wide a headline line sets, in em (the sans at display size with tight tracking). An estimate
 * on the generous side: landing.css divides the screen width by it, so the longest line of every
 * language still fits a narrow phone.
 */
function lineEm(line: string): number {
  let em = 0;
  for (const ch of line) {
    // CJK ideographs, kana and full-width forms set one em wide.
    if (/[⺀-鿿豈-﫿＀-￯]/.test(ch)) em += 1;
    else if (ch === " ") em += 0.24;
    else if (/[.,:;!?']/.test(ch)) em += 0.26;
    else if (/[iljtfrIJ]/.test(ch)) em += 0.34;
    else if (/[mwMWЖШЩЮЫжшщюыф]/.test(ch)) em += 0.82;
    else if (/\p{Lu}/u.test(ch)) em += 0.68;
    else em += 0.57;
  }
  return em;
}

/** The visitor's sky behind the whole page (SkyLayer). No reading: nothing is drawn. */
function PageSky({ weather }: { weather: Reading }) {
  const w = weather ? use(weather) : null;
  return <SkyLayer base={w ? landingScene(w) : null} />;
}

/** The place a reading is for: the visitor's own, kept short, or Erdenet by its name in the page's language. */
const placeOf = (w: LandingWeather, t: LandingText) => (w.local && w.place.trim() ? w.place.trim().slice(0, 80) : t.erdenet);
/** Whose place it is: a preview is called a preview, and Erdenet is our home, never "near you". */
const captionOf = (w: LandingWeather, t: LandingText) => (w.preview ? t.hud.preview : w.local ? t.hud.near : t.hud.home);

const degrees = (v: number, plus: string, minus: string) => {
  const r = Math.round(v * 10) / 10;
  return `${Math.abs(r).toFixed(1)}° ${r < 0 ? minus : plus}`;
};
/**
 * Where the reading was taken, to a tenth of a degree (about 11 km: the same rounding the lookup
 * uses, so nothing finer than a district is ever shown). Null when the reading carries no position.
 */
function positionOf(w: LandingWeather): string | null {
  const c = (w as { coords?: unknown }).coords as { lat?: unknown; lng?: unknown } | null | undefined;
  if (!c || typeof c !== "object") return null;
  const { lat, lng } = c;
  if (typeof lat !== "number" || typeof lng !== "number" || !(Math.abs(lat) <= 90) || !(Math.abs(lng) <= 180)) return null;
  return `${degrees(lat, "N", "S")}, ${degrees(lng, "E", "W")}`;
}
/** The wind in whole km/h, or null when the reading has none. */
function windOf(w: LandingWeather): number | null {
  const v: unknown = w.sky.windKph;
  return typeof v === "number" && Number.isFinite(v) && v >= 0 && v < 500 ? Math.round(v) : null;
}

/**
 * The place and its clock, in the bar on wide screens: whose place it is, its name, and the time
 * there with running seconds. A preview has no clock: its hour is not the real one.
 */
function Where({ t, weather }: { t: LandingText; weather: Stamped }) {
  const got = weather ? use(weather) : null;
  if (!got) return null;
  const { w, minute } = got;
  const place = placeOf(w, t);
  return (
    <p className="lp-where">
      <span className="lp-where-cap">{captionOf(w, t)}</span>{" "}
      <span className="lp-where-place" title={place}>
        {place}
      </span>
      {!w.preview && w.timeZone && (
        <>
          <span aria-hidden>,</span>{" "}
          <span className="lp-clock num">
            <PlaceTime timeZone={w.timeZone} minute={minute} seconds />
          </span>
        </>
      )}
    </p>
  );
}

/**
 * The readings beside the hero, as lines of telemetry between two frame marks: the place, its
 * position, the time there, the temperature with the sky in words, the wind, and who measured it.
 * Real values only. A reading changed by ?sky= or ?hour= is called a preview and never the current
 * weather (and shows nothing else); without the visitor's own place it names Erdenet as Aspire's
 * home city. On wide screens the bar already shows the place and its clock, so landing.css leaves
 * those two lines out there.
 */
function Hud({ l, t, weather }: { l: Lang; t: LandingText; weather: Stamped }) {
  const got = weather ? use(weather) : null;
  if (!got) return null;
  const { w, minute } = got;
  const v = textFor(l);
  const scene = landingScene(w);
  const place = placeOf(w, t);
  const position = w.preview ? null : positionOf(w);
  const wind = w.preview ? null : windOf(w);
  let i = 0;
  return (
    <div role="group" aria-label={v.weather} className="lp-hud" data-weather={w.preview ? "preview" : w.local ? "local" : "home"}>
      <p aria-hidden className="lp-hud-mark">
        {"//"}
      </p>
      <dl>
        <div data-row="place" style={vars({ "--i": i++ })}>
          <dt>{captionOf(w, t)}</dt>
          <dd title={place}>{place}</dd>
        </div>
        {position && (
          <div data-row="position" style={vars({ "--i": i++ })}>
            <dt>{t.hud.position}</dt>
            <dd className="num">{position}</dd>
          </div>
        )}
        {!w.preview && w.timeZone && (
          <div data-row="time" style={vars({ "--i": i++ })}>
            <dt>{t.hud.time}</dt>
            <dd className="num">
              <PlaceTime timeZone={w.timeZone} minute={minute} />
            </dd>
          </div>
        )}
        <div data-row="now" style={vars({ "--i": i++ })}>
          <dt>{w.preview ? t.hud.notLive : v.now}</dt>
          <dd>
            <data value={w.tempC} className="num">
              {temp(w.tempC, false)}
            </data>{" "}
            <span aria-hidden>·</span> {v.kinds[scene.kind]}
          </dd>
        </div>
        {wind !== null && (
          <div data-row="wind" style={vars({ "--i": i++ })}>
            <dt>{t.hud.wind}</dt>
            <dd>
              <data value={wind} className="num">
                {wind}
              </data>{" "}
              {t.hud.kmh}
            </dd>
          </div>
        )}
        {!w.preview && (
          <div data-row="source" style={vars({ "--i": i++ })}>
            <dt>{t.hud.source}</dt>
            <dd>{PROVIDER[w.source] ?? PROVIDER["open-meteo"]}</dd>
          </div>
        )}
      </dl>
      <p aria-hidden className="lp-hud-mark">
        {"};"}
      </p>
    </div>
  );
}

export function Landing({ lang, weather }: { lang?: Lang; weather?: Promise<LandingWeather | null> }) {
  const l = landingLang(lang);
  const t = LANDING_TEXT[l];
  const story = storyCopy(l);
  // One promise for every place that shows the reading. A rejected one counts as no reading.
  const reading = weather?.then(usableWeather, () => null);
  const stamped = reading?.then((w) => (w ? { w, minute: minuteNow() } : null));
  const titleEm = Math.max(4, ...t.hero.title.map(lineEm));
  // The five scenes of the story, by the ids its sections carry and the labels they show.
  const scenes: SceneLink[] = [
    { id: "story-ask", name: story.ask.label },
    { id: "story-city", name: story.city.label },
    { id: "story-weather", name: story.weather.label },
    { id: "story-languages", name: story.languages.label },
    { id: "story-work", name: story.work.label },
  ];
  return (
    // suppressHydrationWarning: the intro's script marks this element before React sees it.
    <div lang={HTML_LANG[l]} className="lp-root" suppressHydrationWarning>
      {/* No JavaScript: this page is streamed into a hidden holder that a script would move into
          place (the Suspense boundary in app/page.tsx), so without scripts nothing would show at
          all. Show the holder itself, drop the empty placeholder it was meant to replace, and hide
          the pause button, which could do nothing. */}
      <noscript>
        <style>{NO_SCRIPT_CSS}</style>
      </noscript>
      <a href="#main" className="skip-link">
        {t.skip}
      </a>

      {/* The page's one inline script. It sets the document language (the root layout renders
          <html lang="en">; the div lang above covers clients without JS) and plays the intro. It
          has to stay a direct child of the root: that is the element it marks. */}
      <Intro line={t.intro} lang={l} />

      <Suspense fallback={<SkyLayer base={null} />}>
        <PageSky weather={reading} />
      </Suspense>

      <div className="lp-page">
        {/* 0. The instrument bar: fixed to the top of the screen for the whole page. Wide screens get
            all of it; small ones the wordmark, Sign in, the languages and a thin progress line. */}
        <header className="lp-bar">
          <div className="lp-bar-in">
            {/* lang: the brand keeps its capitals and tracking on the Chinese page too. */}
            <a href={`/?lang=${l}`} lang="en" className="lp-wordmark">
              Aspire
            </a>
            <div className="lp-bar-mid">
              <Suspense fallback={null}>
                <Where t={t} weather={stamped} />
              </Suspense>
              <SceneNav label={t.sections} items={scenes} />
            </div>
            <ScrollTicks />
            <nav aria-label={t.langLabel} className="lp-langs">
              <ul>
                {LANGS.map((x) => (
                  <li key={x}>
                    <a href={`/?lang=${x}`} lang={HTML_LANG[x]} hrefLang={HTML_LANG[x]} aria-current={x === l ? "true" : undefined} className="press lp-lang">
                      {/* Accessible name "MN Монгол": starts with the visible code (voice control). */}
                      <span>{LANG_NAMES[x].code}</span>
                      <span className="sr-only"> {LANG_NAMES[x].native}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
            <MotionSwitch pause={t.motion.pause} play={t.motion.play} />
            <a href="/login" className="press lp-signin">
              {t.signIn}
            </a>
          </div>
        </header>

        <main id="main" tabIndex={-1} className="outline-none">
          {/* 1. Hero: the core, the visitor's sky and its readings, the headline. */}
          <HeroScene
            lang={l}
            hint={t.hero.scroll}
            hud={
              <Suspense fallback={null}>
                <Hud l={l} t={t} weather={stamped} />
              </Suspense>
            }
          >
            <p className="lp-tag lp-rise" style={vars({ "--i": 0 })}>
              {t.hero.tag}
            </p>
            {/* The brand sits in the h1 (for readers and search), the wordmark above shows it. The
                headline is plain server text: it waits for nothing. */}
            <h1 id="hero-title" className="lp-title" style={vars({ "--w": titleEm.toFixed(2) })}>
              <span className="sr-only">Aspire </span>
              {t.hero.title.map((line, i) => (
                <Fragment key={line}>
                  {i > 0 && " "}
                  <span className="lp-line">
                    <span style={vars({ "--i": i })}>{line}</span>
                  </span>
                </Fragment>
              ))}
            </h1>
            <p className="lp-lead lp-rise" style={vars({ "--i": 4 })}>
              {t.hero.lead}
            </p>
            <div className="lp-actions lp-rise" style={vars({ "--i": 5 })}>
              <a href="/login" data-on-accent className="press lp-button lp-button-primary">
                {t.hero.cta}
              </a>
              <a href="#how" className="press lp-button lp-button-ghost">
                {t.hero.how}
              </a>
            </div>
          </HeroScene>

          {/* 2. The scroll story, the cities and what Aspire does. */}
          <Story lang={l} weather={reading} />
          <Marquee lang={l} />
          <Bento lang={l} weather={reading} />

          <div className="lp-deck">
            {/* 3. How it works: three lettered steps, each under a faint giant numeral. */}
            <section id="how" aria-labelledby="how-title" className="lp-section">
              <div className="lp-wrap">
                <div className="lp-head lp-in">
                  <p className="lp-label">{t.how.label}</p>
                  <h2 id="how-title" className="lp-h2">
                    {t.how.title}
                  </h2>
                </div>
                <ul className="lp-steps">
                  {t.how.steps.map((s, i) => (
                    <li key={s.title} className="lp-in" style={vars({ "--i": i })}>
                      <span aria-hidden className="numeral lp-step-n">
                        0{i + 1}
                      </span>
                      <h3>
                        <span className="lp-letter">{`${LETTERS[i]}.`}</span> {s.title}
                      </h3>
                      <p>{s.body}</p>
                    </li>
                  ))}
                </ul>
              </div>
            </section>

            {/* 4. Run it yourself: Aspire Desktop, own keys, own server. */}
            <section id="self-host" aria-labelledby="self-title" className="lp-section">
              <div className="lp-wrap lp-split">
                <div className="lp-head lp-in">
                  <p className="lp-label">{t.self.label}</p>
                  <h2 id="self-title" className="lp-h2">
                    {t.self.title}
                  </h2>
                  <p className="lp-section-lead">{t.self.lead}</p>
                  <a href={DESKTOP_URL} rel="noopener" data-on-accent className="press lp-button lp-button-primary">
                    <Download aria-hidden />
                    {t.self.download}
                  </a>
                </div>
                <ul className="lp-points">
                  {t.self.points.map((s, i) => {
                    const Icon = SELF_ICONS[i];
                    return (
                      <li key={s.title} className="lp-in" style={vars({ "--i": i })}>
                        <span aria-hidden className="lp-point-icon">
                          <Icon />
                        </span>
                        <div>
                          <h3>{s.title}</h3>
                          <p>{s.body}</p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </section>

            {/* 5. Questions */}
            <section id="faq" aria-labelledby="faq-title" className="lp-section">
              <div className="lp-wrap lp-split">
                <div className="lp-head lp-in">
                  <p className="lp-label">{t.faq.label}</p>
                  <h2 id="faq-title" className="lp-h2">
                    {t.faq.title}
                  </h2>
                </div>
                <div className="lp-faq">
                  {t.faq.items.map((item, i) => (
                    <details key={item.q} name="lp-faq" className="lp-in" style={vars({ "--i": i })}>
                      <summary>
                        <span>{item.q}</span>
                        <span aria-hidden className="lp-faq-mark">
                          <Plus />
                        </span>
                      </summary>
                      <p>
                        {item.a}
                        {/* The two privacy answers end with a link to the full policy. */ (i === 1 || i === 3) && (
                          <>
                            {" "}
                            <a href={`/privacy#${l}`}>{t.privacy}</a>
                          </>
                        )}
                      </p>
                    </details>
                  ))}
                </div>
              </div>
            </section>
          </div>

          {/* 6. The close: one line, the button, the wordmark across the screen. */}
          <Cta label={t.end.label} line={t.end.line} cta={t.hero.cta} />
        </main>

        {/* 7. Footer: its own solid band, so the small print never sits on the sky. The stamp is the
            device's own date, time and UTC offset, written by the browser alone. */}
        <footer className="lp-footer">
          <div className="lp-wrap">
            <Stamp />
            <nav aria-label={t.legal}>
              <a href={`/privacy#${l}`}>{t.privacy}</a>
              <a href={`/terms#${l}`}>{t.terms}</a>
            </nav>
            <p>{t.built}</p>
          </div>
        </footer>
      </div>
      <Cursor />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(l) }} />
    </div>
  );
}

export default Landing;
