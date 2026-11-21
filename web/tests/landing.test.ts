// The public opening page renders on the server in every language with all of its words in the
// HTML, sends visitors to /login, shows the visitor's weather only when there is a reading (and
// never calls a preview current), keeps its intro out of the way, and carries no emojis, arrow
// glyphs or em and en dashes. The scroll story inside it has its own tests.
import { readdirSync, readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { prerender } from "react-dom/static";
import { describe, expect, it, vi } from "vitest";
import { utcLabel } from "@/components/landing/Cta";
import { INTRO_KEYFRAMES } from "@/components/landing/Intro";
import { DESKTOP_URL, Landing, landingJsonLd, landingLang, landingMetadata, SEO_TITLE } from "@/components/landing/Landing";
import { LANDING_TEXT } from "@/components/landing/LandingCopy";
import { storyCopy } from "@/components/landing/story/copy";
import { DEMO_HOUR, demoScene, landingScene, PAGE_SKY_EASE, usableWeather } from "@/components/landing/scene";
import { setSkyOverride } from "@/components/landing/sky-store";
import { V6 } from "@/components/v6/text";
import { SKY_KINDS } from "@/lib/ambient-types";
import type { LandingWeather } from "@/lib/landing-weather";
import { HTML_LANG, langFrom, LANGS, type Lang } from "@/lib/lang";

// The root layout pulls in fonts and Clerk; only its exported metadata is under test here.
vi.mock("next/font/google", () => {
  const font = () => ({ variable: "font", className: "font" });
  return { Inter: font, JetBrains_Mono: font, Tektur: font, Noto_Sans_SC: font };
});
vi.mock("@clerk/nextjs", () => ({ ClerkProvider: () => null }));
vi.mock("@clerk/ui/themes", () => ({ dark: {} }));

const SYMBOLS = /[\u{2190}-\u{21FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]|\p{Extended_Pictographic}/u;
/** Figure dash, en dash, em dash, horizontal bar. The minus sign of a temperature (U+2212) is not one. */
const DASHES = /[\u2012-\u2015]/;
const PROCESSORS = ["Anthropic", "DeepSeek", "Google", "Microsoft", "ElevenLabs", "Clerk"];
const css = readFileSync(new URL("../components/landing/landing.css", import.meta.url), "utf8");

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** A string as React writes it into HTML text. */
const inHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
const render = (lang?: Lang) => renderToString(createElement(Landing, { lang }));
const strings = (x: unknown): string[] =>
  typeof x === "string" ? [x] : x && typeof x === "object" ? Object.values(x).flatMap(strings) : [];
const textOf = (html: string) => html.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, "");
/** One section of the page, by the id on its opening tag. */
const section = (html: string, id: string) => html.match(new RegExp(`<section id="${id}"[\\s\\S]*?</section>`))?.[0] ?? "";
/** The hero: from its opening tag to the end of its section. */
const hero = (html: string) => html.match(/<section aria-labelledby="hero-title"[\s\S]*?<\/section>/)?.[0] ?? "";
/** The readings beside the hero: the lines of telemetry between their two frame marks. */
const hud = (html: string) => html.match(/<div role="group"[^>]*class="lp-hud"[\s\S]*?<\/dl><p[^>]*>\};<\/p><\/div>/)?.[0] ?? "";
/** The bar on top of the page. */
const bar = (html: string) => html.match(/<header class="lp-bar">[\s\S]*?<\/header>/)?.[0] ?? "";
/** The place and its clock, in the bar. */
const where = (html: string) => bar(html).match(/<p class="lp-where">[\s\S]*?<\/p>/)?.[0] ?? "";
/** One rule of the stylesheet's own layer, by its selector. */
const rule = (selector: string) => css.match(new RegExp("\\n {2}" + esc(selector) + " \\{[\\s\\S]*?\\n {2}\\}"))?.[0] ?? "";

/** The five scenes of the scroll story, by the ids of their sections. */
const SCENES = ["ask", "city", "weather", "languages", "work"] as const;

/** A reading as lib/landing-weather.ts returns it: Darkhan, minus 12.4, snowing at 21:00. */
const reading = (over: Partial<LandingWeather> = {}): LandingWeather => ({
  place: "Darkhan",
  local: true,
  preview: false,
  tempC: -12.4,
  sky: { kind: "snow", intensity: 0.6, isDay: false, windKph: 12, cloudCover: 90 },
  localHour: 21,
  timeZone: "Asia/Ulaanbaatar",
  at: "2026-11-21T13:00:00.000Z",
  source: "open-meteo",
  ...over,
});

/**
 * The whole page once every <Suspense> has resolved (what a visitor ends up with). The chunk size
 * keeps React from sending a large boundary (the sky) as its fallback plus a script that swaps it in.
 */
async function renderWith(weather: Promise<LandingWeather | null>, lang: Lang = "en"): Promise<string> {
  const { prelude } = await prerender(createElement(Landing, { lang, weather }), { progressiveChunkSize: 1e9 });
  return new Response(prelude).text();
}

describe("Landing (server render)", () => {
  for (const lang of LANGS) {
    it(`renders in ${lang}, with every word in the HTML`, () => {
      const html = render(lang);
      const t = LANDING_TEXT[lang];
      expect(html).toContain(`lang="${HTML_LANG[lang]}"`);

      // One h1, with the brand in it (for readers and search) and the headline's three short lines.
      expect(html.match(/<h1/g)).toHaveLength(1);
      const h1 = html.match(/<h1[\s\S]*?<\/h1>/)![0];
      expect(h1).toContain('<span class="sr-only">Aspire </span>');
      expect(t.hero.title).toHaveLength(3);
      expect(h1.match(/class="lp-line"/g)).toHaveLength(3);
      expect(textOf(h1)).toBe(`Aspire ${t.hero.title.join(" ")}`);

      // Ways in: the hero button, Sign in, and the button at the close.
      expect(html).toMatch(new RegExp(`<a href="/login"[^>]*>${esc(inHtml(t.hero.cta))}</a>`));
      expect(html).toMatch(new RegExp(`<a href="/login"[^>]*>${esc(inHtml(t.signIn))}</a>`));
      expect(html.split('href="/login"').length - 1).toBe(3);
      expect(html).toContain('href="#how"');
      expect(html).toContain('<section id="how"');
      expect(html).toContain('<a href="#main" class="skip-link">');
      expect(html).toContain('<main id="main"');

      // The language switch: one link per language with its hreflang, the current one marked.
      for (const x of LANGS) expect(html).toMatch(new RegExp(`<a href="/\\?lang=${x}" lang="${HTML_LANG[x]}" hrefLang="${HTML_LANG[x]}"`, "i"));
      expect(html).toMatch(new RegExp(`href="/\\?lang=${lang}"[^>]*aria-current="true"`));
      expect(html.match(/aria-current="true"/g)).toHaveLength(1);

      // The questions: four of them, the two privacy answers linking to the policy, plus the footer.
      const faq = section(html, "faq");
      expect(faq.match(/<details/g)).toHaveLength(4);
      expect(html.match(/<details/g)).toHaveLength(4);
      const answers = faq.match(/<details[\s\S]*?<\/details>/g)!;
      expect(answers.map((a) => a.includes(`href="/privacy#${lang}"`))).toEqual([false, true, false, true]);
      expect(html.split(`href="/privacy#${lang}"`).length - 1).toBe(3);
      expect(html).toContain(`href="/terms#${lang}"`);
      expect(html).toContain(`aria-label="${inHtml(t.legal)}"`);

      // Every string of the shell is there before any script runs. (The description is for search
      // results, the readings need a reading, "play" is the pause button's other name.)
      const { description, hud: _hud, motion, intro, ...visible } = t;
      void _hud;
      for (const s of strings(visible)) expect(html, s).toContain(inHtml(s));
      expect(html).toContain(`aria-label="${inHtml(motion.pause)}"`);
      expect(html).toContain(intro); // inside the intro's script, see below
      // The description is only in the structured data: the page itself says it in fewer words.
      expect(textOf(html)).not.toContain(description);

      expect(html).not.toMatch(SYMBOLS);
      expect(html).not.toMatch(DASHES);
    });
  }

  it("falls back to English for an unknown language", () => {
    const html = renderToString(createElement(Landing, { lang: "xx" as Lang }));
    expect(html).toContain(LANDING_TEXT.en.hero.title[0]);
  });

  it("has the same shape and no empty, symbol or dash strings in every language", () => {
    const shape = (o: unknown): unknown =>
      typeof o === "string" ? "s" : Array.isArray(o) ? o.map(shape) : Object.fromEntries(Object.entries(o as object).map(([k, v]) => [k, shape(v)]));
    for (const lang of LANGS) {
      expect(shape(LANDING_TEXT[lang])).toEqual(shape(LANDING_TEXT.en));
      const all = strings(LANDING_TEXT[lang]);
      expect(all.filter((s) => !s.trim())).toEqual([]);
      expect(all.filter((s) => SYMBOLS.test(s))).toEqual([]);
      expect(all.filter((s) => DASHES.test(s))).toEqual([]);
      expect(SEO_TITLE[lang]).not.toMatch(DASHES);
    }
  });

  it("has no em or en dash anywhere in the landing source", () => {
    const dir = new URL("../components/landing/", import.meta.url);
    const files = readdirSync(dir).filter((f) => /\.(tsx?|css)$/.test(f));
    expect(files.length).toBeGreaterThan(5);
    for (const f of files) expect(readFileSync(new URL(f, dir), "utf8"), f).not.toMatch(DASHES);
  });

  it("names the third-party processors in the data answer and nowhere else in its own copy", () => {
    for (const lang of LANGS) {
      const { faq, ...rest } = LANDING_TEXT[lang];
      for (const name of PROCESSORS) expect(faq.items[1].a).toContain(name);
      const other = strings([rest, faq.label, faq.title, faq.items[0], faq.items[2], faq.items[3]]).join(" ");
      for (const name of [...PROCESSORS, "Open-Meteo", "OpenAI", "Azure"]) expect(other, `${lang}: ${name}`).not.toContain(name);
    }
  });

  it("shows no prices, and reads cleanly as text", () => {
    for (const lang of LANGS) {
      const t = LANDING_TEXT[lang];
      const html = render(lang);
      expect(html).not.toContain('id="pricing"');
      expect(html).not.toMatch(/[$€₮¥]\s?\d/);
      // Text extraction (screen readers in browse mode, search engines): no run-together words.
      const text = textOf(hero(html));
      expect(text).toContain(`Aspire ${t.hero.title.join(" ")}${t.hero.lead}`);
      // Steps: one visible number each, no <ol> marker on top of it.
      expect(section(html, "how")).not.toContain("<ol");
      expect(section(html, "how").match(/<li[ >]/g)).toHaveLength(3);
    }
  });

  it("offers self-hosting and the desktop download in every language", () => {
    for (const lang of LANGS) {
      const t = LANDING_TEXT[lang];
      const self = section(render(lang), "self-host");
      expect(self).toContain(`href="${DESKTOP_URL}"`);
      expect(self.match(/<li[ >]/g)).toHaveLength(3);
      expect(t.self.points[0].title).toMatch(/Windows.*macOS/);
      expect(t.self.points[0].body).toContain("Qwen2.5");
    }
  });

  it("says what the product is in its description", () => {
    const d = LANDING_TEXT.en.description;
    for (const w of ["Aspire", "buses", "weather", "traffic", "cameras", "news", "voice", "Mongolian", "German"]) expect(d).toContain(w);
  });
});

describe("the bar", () => {
  it("stays on top of the page, solid, and keeps links and focus clear of itself", () => {
    const r = rule(".lp-bar");
    expect(r).toContain("position: fixed;");
    expect(r).toContain("height: var(--lp-bar);");
    // Two heights: two rows on small screens, one from 40rem. A link into the page lands under each.
    expect(css).toMatch(/--lp-bar: calc\(6rem \+ env\(safe-area-inset-top, 0px\)\);/);
    expect(css).toMatch(/--lp-bar: calc\(3\.5rem \+ env\(safe-area-inset-top, 0px\)\);/);
    expect(css).toMatch(/html:has\(\.lp-root\) \{\s*scroll-padding-top: calc\(6\.5rem \+ env\(safe-area-inset-top, 0px\)\);/);
    expect(css).toMatch(/html:has\(\.lp-root\) \{\s*scroll-padding-top: calc\(4rem \+ env\(safe-area-inset-top, 0px\)\);/);
    // The hero starts under it: the core is placed from the bar's foot, and the copy from the core.
    expect(rule(".lp-hero")).toContain("var(--lp-core-y)");
    expect(css).toMatch(/--lp-core-y: calc\(var\(--lp-bar\) \+/);
  });

  it("holds the wordmark, the scenes, the languages, the pause button and Sign in, once each", () => {
    for (const lang of LANGS) {
      const t = LANDING_TEXT[lang];
      const html = render(lang);
      expect(html.match(/<header class="lp-bar">/g)).toHaveLength(1);
      const b = bar(html);
      expect(b).toContain('<a href="/?lang=' + lang + '" lang="en" class="lp-wordmark">Aspire</a>');
      expect(b).toContain('<nav aria-label="' + inHtml(t.langLabel) + '" class="lp-langs">');
      expect(b.match(/hrefLang=/g)).toHaveLength(LANGS.length);
      expect(b).toContain('<a href="/login" class="press lp-signin">' + inHtml(t.signIn) + "</a>");
      expect(b).toContain('aria-label="' + inHtml(t.motion.pause) + '"');
      // Every control in it is a link or a button.
      expect(b.match(/<(a|button) /g)).toHaveLength(1 + SCENES.length + LANGS.length + 2);
    }
  });

  it("links to the five scenes by their index numbers, each named in full", () => {
    for (const lang of LANGS) {
      const t = LANDING_TEXT[lang];
      const story = storyCopy(lang);
      const b = bar(render(lang));
      expect(b).toContain('<nav aria-label="' + inHtml(t.sections) + '" class="lp-scenes">');
      SCENES.forEach((id, i) => {
        const name = inHtml(story[id].label);
        // Visible: three digits. For screen readers and on hover: the scene's own label after them.
        expect(b, lang + ": " + id).toContain('<a href="#story-' + id + '" title="' + name + '"><span>00' + (i + 1) + '</span><span class="sr-only"> ' + name + "</span></a>");
      });
      expect(b.match(/href="#story-/g)).toHaveLength(SCENES.length);
    }
  });

  it("draws the scroll strip as decoration that starts empty", () => {
    const b = bar(render("en"));
    // Wide screens: the ticks, with nothing filled in yet. Small ones: the thin line, at no width.
    expect(b).toMatch(/<span aria-hidden="true" class="lp-ticks"><span class="lp-ticks-on" style="clip-path:inset\(0 100\.00% 0 0\)"><\/span><\/span>/);
    expect(b).toMatch(/<span aria-hidden="true" class="lp-progress"><span style="transform:scaleX\(0\)"><\/span><\/span>/);
    // It moves by clip-path and transform alone.
    expect(rule(".lp-progress > span")).toContain("transform-origin: 0 50%;");
  });

  it("keeps every control at 44 px", () => {
    for (const selector of [".lp-wordmark", ".lp-lang", ".lp-signin"]) expect(rule(selector), selector).toContain("min-height: 2.75rem;");
    expect(rule(".lp-lang")).toContain("min-width: 2.75rem;");
    expect(rule(".lp-icon")).toMatch(/width: 2\.75rem;\s*height: 2\.75rem;/);
    // The scene links are a short row of figures: their pressable area reaches past the row.
    expect(css).toMatch(/\.lp-scenes a \{[^}]*min-width: 2\.75rem;\s*height: 1\.5rem;/);
    expect(css).toMatch(/\.lp-scenes a::before \{[^}]*inset: -0\.75rem 0 -0\.5rem;/);
    for (const selector of [".lp-button", ".lp-end-button"]) expect(rule(selector), selector).toMatch(/min-height: 3(\.5)?rem;/);
    expect(rule(".lp-footer a")).toContain("min-height: 2.75rem;");
    expect(rule(".lp-faq summary")).toContain("min-height: 4.5rem;");
  });
});

describe("the sections and the close", () => {
  it("letters the three steps under faint numerals that are decoration", () => {
    for (const lang of LANGS) {
      const how = section(render(lang), "how");
      ["A", "B", "C"].forEach((letter, i) => {
        expect(how).toContain('<span class="lp-letter">' + letter + ".</span>");
        expect(how).toContain('<span aria-hidden="true" class="numeral lp-step-n">0<!-- -->' + (i + 1) + "</span>");
      });
      expect(how.match(/<h3>/g)).toHaveLength(3);
    }
    // Ink at a tenth: a figure in the background, not text to read.
    expect(rule(".lp-step-n")).toContain("color: rgb(221 221 221 / 0.1);");
  });

  it("writes no date or time into the footer on the server: the stamp is the device's own", () => {
    for (const lang of LANGS) {
      const footer = render(lang).match(/<footer class="lp-footer">[\s\S]*?<\/footer>/)?.[0] ?? "";
      expect(footer).toContain('<p class="lp-stamp"></p>');
      expect(footer).not.toContain("<time");
      expect(footer).not.toContain("UTC");
      expect(footer).toContain(inHtml(LANDING_TEXT[lang].built));
    }
    // What the browser then writes for the offset: no dash, a real minus sign west of UTC.
    expect(utcLabel(480)).toBe("UTC+8");
    expect(utcLabel(330)).toBe("UTC+5:30");
    expect(utcLabel(0)).toBe("UTC");
    expect(utcLabel(-300)).toBe("UTC−5");
    expect(utcLabel(-210)).toBe("UTC−3:30");
    expect(utcLabel(Number.NaN)).toBe("UTC");
    for (const east of [840, 345, -720]) expect(utcLabel(east)).not.toMatch(DASHES);
  });

  it("closes on the line, the button and the wordmark, with the haze and the letters as decoration", () => {
    const html = render("en");
    const end = html.match(/<section aria-labelledby="end-title"[\s\S]*?<\/section>/)?.[0] ?? "";
    expect(end).toContain('<div aria-hidden="true" class="lp-haze"></div>');
    expect(end).toContain('<h2 id="end-title" class="lp-end-line">' + LANDING_TEXT.en.end.line + "</h2>");
    expect(end).toMatch(/<a href="\/login" data-on-accent="true" class="press lp-end-button">/);
    expect(end).toContain('<p aria-hidden="true" class="lp-mark">');
    expect(end.match(/class="lp-mark-letter"/g)).toHaveLength(6);
    // The wordmark is plain off-white: no gradient in it.
    expect(rule(".lp-mark")).toContain("color: var(--color-ink);");
    expect(rule(".lp-mark-letter > span")).not.toContain("gradient");
  });

  it("uses no colour but the accent, and no gradient text", () => {
    // Every colour in the sheet is a token, or off-white, the page colour, black, white light or the accent.
    const colours = [...css.matchAll(/rgb\((\d+ \d+ \d+)/g)].map((m) => m[1]);
    expect([...new Set(colours)].sort()).toEqual(["0 0 0", "221 221 221", "252 79 0", "255 255 255", "5 5 5"]);
    expect(css).not.toMatch(/#[0-9a-f]{6}\b/i);
    expect(css).not.toContain("background-clip: text");
  });
});

describe("the hero", () => {
  it("draws the core as plain markup, and no canvas before the page's script runs", () => {
    const h = hero(render("en"));
    // The still orb, and the gauge around it: the ticks, the cross marks, the orbit and its point of light.
    for (const part of ["lp-orb-still", "lp-ring-ticks", "lp-turn", "lp-cross", "lp-ring-orbit", "lp-comet"]) expect(h).toContain(part);
    expect(h).not.toContain("<canvas");
    // The scroll hint and the still core are decoration.
    expect(h).toMatch(/<p aria-hidden="true" class="lp-hint">/);
    expect(h).toMatch(/<div aria-hidden="true" class="lp-core">/);
  });

  it("puts a small tag over the headline, and two ways on under it", () => {
    for (const lang of LANGS) {
      const t = LANDING_TEXT[lang];
      const h = hero(render(lang));
      const tag = h.indexOf(">" + inHtml(t.hero.tag) + "</p>");
      expect(tag).toBeGreaterThan(-1);
      expect(tag).toBeLessThan(h.indexOf("<h1"));
      // The tag does not say again what the line under the headline says.
      expect(t.hero.lead.toLowerCase()).not.toContain(t.hero.tag.toLowerCase());
      expect(h.indexOf('href="/login"')).toBeGreaterThan(h.indexOf("</h1>"));
      expect(h.indexOf('href="#how"')).toBeGreaterThan(h.indexOf('href="/login"'));
    }
  });

  it("sizes the headline from its longest line, in every language", () => {
    for (const lang of LANGS) {
      const w = Number(render(lang).match(/class="lp-title" style="--w:([\d.]+)"/)?.[1]);
      expect(w).toBeGreaterThanOrEqual(4);
      expect(w).toBeLessThan(10);
    }
    // Chinese sets one em per character.
    expect(render("zh")).toContain('style="--w:5.00"');
  });

  it("offers a way to stop everything that moves (WCAG 2.2.2)", () => {
    for (const lang of LANGS) {
      const t = LANDING_TEXT[lang];
      expect(render(lang)).toMatch(new RegExp(`<button type="button" aria-label="${esc(inHtml(t.motion.pause))}" title="${esc(inHtml(t.motion.pause))}"`));
    }
  });
});

describe("the intro", () => {
  it("is one inline script that builds its own overlay, and nothing React renders", () => {
    for (const lang of LANGS) {
      const html = render(lang);
      const scripts = html.match(/<script type="text\/javascript">[\s\S]*?<\/script>/g) ?? [];
      expect(scripts).toHaveLength(1);
      const js = scripts[0] ?? "";
      // The root layout says lang="en": the page's script sets the document's own language first.
      expect(js).toContain(`>document.documentElement.lang="${HTML_LANG[lang]}";`);
      // Once per tab, never under reduced motion or Calm mode, and it cleans up after itself.
      for (const part of ["sessionStorage", "aspire-intro-v1", "prefers-reduced-motion: reduce", "data-calm", "data-lp-intro", ".remove()", "pointerdown", "keydown", "wheel", "touchstart"]) expect(js).toContain(part);
      expect(js).toContain("setTimeout(f,1280)");
      // The overlay's markup lives inside the script: the line in the page language, the core, the counter.
      expect(js).toContain(LANDING_TEXT[lang].intro);
      expect(js).toContain(`"lang":"${HTML_LANG[lang]}"`);
      for (const part of ["lp-intro-line", "lp-orb-still", "lp-ring-ticks", "lp-odo", "lp-reel-100", "lp-reel-10", "lp-reel-1"]) expect(js).toContain(part);
      // Nothing in it can close the script element early.
      expect(js.slice("<script type=\"text/javascript\">".length, -"</script>".length)).not.toContain("<");
      // No overlay element in the HTML itself: with no JavaScript there is no intro.
      expect(html).not.toMatch(/<div[^>]*class="lp-intro"/);
    }
  });

  it("lasts 1.2 seconds, opens from the core and never takes a click", () => {
    // The overlay's own rule (the first ".lp-intro {" in the file only shares the page's measures).
    const overlay = (css.match(/\n {2}\.lp-intro \{[\s\S]*?\n {2}\}/g) ?? []).find((r) => r.includes("position: fixed")) ?? "";
    expect(overlay).toContain("pointer-events: none");
    expect(overlay).toMatch(/lp-iris 440ms var\(--lp-through\) 760ms both/);
    expect(overlay).toMatch(/lp-gone 1ms linear 1200ms forwards/);
    // The hero's entrance starts as the screen opens, by the stylesheet and by the script's own count.
    expect(css).toMatch(/\.lp-root\[data-lp-intro\] \{\s*--lp-t0: 800ms;/);
    expect(render("en")).toContain("Math.max(0,800-s)");
    // The keyframes in the stylesheet are the ones Intro.tsx builds.
    const flat = (s: string) => s.replace(/\s+/g, " ");
    expect(flat(css)).toContain(flat(INTRO_KEYFRAMES));
    // The circle opens on the orb, wherever the hero has it: the same two measures place both.
    expect(INTRO_KEYFRAMES).toContain("var(--lp-core-x)");
    expect(INTRO_KEYFRAMES).toContain("var(--lp-core-y)");
    expect(rule(".lp-core")).toMatch(/top: var\(--lp-core-y\);\s*left: var\(--lp-core-x\);/);
    // The counter ends on 100: the last keyframe of each reel.
    expect(INTRO_KEYFRAMES).toMatch(/lp-reel-1 \{[\s\S]*100% \{\s*transform: translate3d\(0, -100em, 0\);/);
    expect(INTRO_KEYFRAMES).toMatch(/lp-reel-10 \{[\s\S]*100% \{\s*transform: translate3d\(0, -10em, 0\);/);
    expect(INTRO_KEYFRAMES).toMatch(/lp-reel-100 \{[\s\S]*100% \{\s*transform: translate3d\(0, -1em, 0\);/);
  });
});

describe("the visitor's weather", () => {
  it("renders the plain dark page with no reading", () => {
    const html = render("en");
    expect(html).not.toContain('class="lp-sky"');
    expect(html).not.toContain("data-weather=");
    expect(hud(html)).toBe("");
    expect(where(html)).toBe("");
    // No clock anywhere: the bar's needs a reading, and the footer's stamp is the browser's alone.
    expect(html).not.toContain("<time");
    expect(html).toContain('<p class="lp-stamp"></p>');
  });

  it("treats a null, rejected or unusable reading as no reading", async () => {
    const bad = [Promise.resolve(null), Promise.reject(new Error("down")), Promise.resolve(reading({ tempC: Number.NaN })), Promise.resolve({ place: "X" } as LandingWeather)];
    for (const p of bad) {
      const html = await renderWith(p);
      expect(html).toContain(LANDING_TEXT.en.hero.title[0]);
      expect(html).not.toContain('class="lp-sky"');
      expect(html).not.toContain("data-weather=");
      expect(html).not.toContain("NaN");
    }
  });

  it("never makes the headline wait for the reading", () => {
    // A reading that never arrives: the synchronous render still has the whole page.
    const html = renderToString(createElement(Landing, { lang: "en", weather: new Promise<LandingWeather | null>(() => {}) }));
    const t = LANDING_TEXT.en;
    expect(html).toContain(t.hero.title[1]);
    expect(html).toContain(t.hero.lead);
    expect(html).toMatch(new RegExp(`<a href="/login"[^>]*>${esc(t.hero.cta)}</a>`));
    expect(html).toContain(t.faq.items[3].q);
    expect(html).toContain(t.end.line);
    // In the meantime the readings are empty and no sky is drawn.
    expect(html).not.toContain("data-weather=");
    expect(html).not.toContain('class="lp-sky"');
  });

  it("shows the place, the time there, the temperature, the wind and the source beside the hero", async () => {
    for (const lang of LANGS) {
      const t = LANDING_TEXT[lang];
      const v = V6[lang];
      const html = await renderWith(Promise.resolve(reading()), lang);
      const h = hud(html);
      expect(h).toContain('data-weather="local"');
      expect(h).toContain(`aria-label="${inHtml(v.weather)}"`);
      expect(h).toContain(`<dt>${inHtml(t.hud.near)}</dt><dd title="Darkhan">Darkhan</dd>`);
      expect(h).toMatch(new RegExp(`<dt>${esc(inHtml(t.hud.time))}</dt><dd class="num"><time dateTime="[^"]+">\\d\\d:\\d\\d</time></dd>`));
      expect(h).toMatch(new RegExp(`<dt>${esc(v.now)}</dt><dd><data value="-12.4" class="num">−12°C</data> <span aria-hidden="true">·</span> (?:<!-- -->)?${esc(v.kinds.snow)}</dd>`));
      expect(h).toMatch(new RegExp(`<dt>${esc(inHtml(t.hud.wind))}</dt><dd><data value="12" class="num">12</data> (?:<!-- -->)?${esc(inHtml(t.hud.kmh))}</dd>`));
      expect(h).toContain(`<dt>${inHtml(t.hud.source)}</dt><dd>Open-Meteo</dd>`);
      expect(textOf(h)).toContain(`−12°C · ${v.kinds.snow}`);
      // This reading carries no position, so there is no line for one.
      expect(h.match(/<dt>/g)).toHaveLength(5);
      expect(h).not.toContain(`<dt>${inHtml(t.hud.position)}</dt>`);
      // The two frame marks are decoration.
      expect(h.match(/<p aria-hidden="true" class="lp-hud-mark">/g)).toHaveLength(2);

      // Wide screens: the bar says whose place it is, its name and the time there (the browser adds the seconds).
      const w = where(html);
      expect(w).toContain(`<span class="lp-where-cap">${inHtml(t.hud.near)}</span> <span class="lp-where-place" title="Darkhan">Darkhan</span>`);
      expect(w).toMatch(/<span class="lp-clock num"><time dateTime="[^"]+">\d\d:\d\d<\/time><\/span><\/p>$/);

      // The sky itself: the app's Sky, drawn once, under the scrim, behind the page.
      const sky = html.match(/<div aria-hidden="true" class="lp-sky"[\s\S]*?<div class="lp-scrim"><\/div><\/div>/)?.[0] ?? "";
      expect(sky).toMatch(/^<div aria-hidden="true" class="lp-sky" data-tone="dark" data-fall="true">/);
      expect(sky).toContain('<div class="lp-sky-art">');
      expect(sky.match(/<canvas/g)).toHaveLength(1);
      expect(html.match(/class="lp-sky"/g)).toHaveLength(1);
      expect(html).not.toMatch(DASHES);
      expect(html).not.toMatch(SYMBOLS);
    }
  });

  it("names Erdenet as Aspire's home city when the visitor's place is unknown", async () => {
    for (const lang of LANGS) {
      const t = LANDING_TEXT[lang];
      const html = await renderWith(Promise.resolve(reading({ place: "Erdenet", local: false })), lang);
      const h = hud(html);
      expect(h).toContain('data-weather="home"');
      expect(h).toContain(`<dt>${inHtml(t.hud.home)}</dt><dd title="${inHtml(t.erdenet)}">${inHtml(t.erdenet)}</dd>`);
      expect(h).not.toContain(`<dt>${inHtml(t.hud.near)}</dt>`);
      // The bar says the same: our home, never "near you".
      expect(where(html)).toContain(`<span class="lp-where-cap">${inHtml(t.hud.home)}</span> <span class="lp-where-place" title="${inHtml(t.erdenet)}">${inHtml(t.erdenet)}</span>`);
      expect(where(html)).not.toContain(inHtml(t.hud.near));
    }
  });

  it("shows where the reading was taken, rounded, only when the reading says", async () => {
    /** A reading with a position (the field is optional: older readings have none). */
    const at = (coords: unknown) => Promise.resolve({ ...reading(), coords } as unknown as LandingWeather);
    for (const lang of LANGS) {
      const t = LANDING_TEXT[lang];
      const h = hud(await renderWith(at({ lat: 49.5, lng: 105.9 }), lang));
      expect(h).toContain(`<dt>${inHtml(t.hud.position)}</dt><dd class="num">49.5° N, 105.9° E</dd>`);
      expect(h.match(/<dt>/g)).toHaveLength(6);
    }
    // South and west are letters, never a minus sign; one decimal is all that is ever shown.
    expect(hud(await renderWith(at({ lat: -33.8688, lng: -70.6693 })))).toContain('<dd class="num">33.9° S, 70.7° W</dd>');
    expect(hud(await renderWith(at({ lat: 0, lng: 0 })))).toContain('<dd class="num">0.0° N, 0.0° E</dd>');
    // Anything that is not a position on Earth is left out.
    for (const bad of [null, "49,105", { lat: 999, lng: 0 }, { lat: Number.NaN, lng: 5 }, { lat: "49", lng: "105" }, { lat: 49 }]) {
      const h = hud(await renderWith(at(bad)));
      expect(h).not.toContain(`<dt>${LANDING_TEXT.en.hud.position}</dt>`);
      expect(h).not.toContain("NaN");
      expect(h.match(/<dt>/g)).toHaveLength(5);
    }
    // A preview shows no position either.
    expect(hud(await renderWith(Promise.resolve({ ...reading({ preview: true }), coords: { lat: 49.5, lng: 105.9 } } as unknown as LandingWeather)))).not.toContain("49.5");
  });

  it("leaves the wind out when the reading has none", async () => {
    for (const windKph of [null, Number.NaN, -3, "12" as unknown as number]) {
      const h = hud(await renderWith(Promise.resolve(reading({ sky: { ...reading().sky, windKph } }))));
      expect(h).not.toContain(`<dt>${LANDING_TEXT.en.hud.wind}</dt>`);
      expect(h).not.toContain("NaN");
      expect(h.match(/<dt>/g)).toHaveLength(4);
    }
    // Whole kilometres per hour.
    expect(hud(await renderWith(Promise.resolve(reading({ sky: { ...reading().sky, windKph: 7.6 } }))))).toContain('<data value="8" class="num">8</data>');
  });

  it("calls an overridden reading a preview, never the current weather", async () => {
    for (const lang of LANGS) {
      const t = LANDING_TEXT[lang];
      const html = await renderWith(Promise.resolve(reading({ preview: true })), lang);
      const h = hud(html);
      expect(h).toContain('data-weather="preview"');
      expect(h).toContain(`<dt>${inHtml(t.hud.preview)}</dt><dd title="Darkhan">Darkhan</dd>`);
      expect(h).toContain(`<dt>${inHtml(t.hud.notLive)}</dt>`);
      // No "now", no clock, no wind, no source for it.
      expect(h.match(/<dt>/g)).toHaveLength(2);
      expect(h).not.toContain(`<dt>${V6[lang].now}</dt>`);
      expect(h).not.toContain(`<dt>${inHtml(t.hud.wind)}</dt>`);
      expect(h).not.toContain("<time");
      expect(h).not.toContain("Open-Meteo");
      // The bar calls it a preview too, and runs no clock for it.
      expect(where(html)).toContain(`<span class="lp-where-cap">${inHtml(t.hud.preview)}</span>`);
      expect(html).not.toContain("<time");
    }
  });

  it("leaves the clock out when the place has no time zone", async () => {
    const html = await renderWith(Promise.resolve(reading({ timeZone: null })));
    const h = hud(html);
    expect(html).not.toContain("<time");
    expect(h.match(/<dt>/g)).toHaveLength(4);
    expect(where(html)).toContain(">Darkhan</span>");
  });

  it("escapes a place name and keeps it short", async () => {
    const html = await renderWith(Promise.resolve(reading({ place: `<img src=x onerror=alert(1)>${"a".repeat(300)}` })));
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("a".repeat(81));
  });
});

describe("landingScene and the story's sky", () => {
  it("picks the scrim by how bright the sky can get", () => {
    expect(landingScene(reading()).tone).toBe("dark"); // night
    expect(landingScene(reading({ localHour: 13, sky: { kind: "snow", intensity: 1, isDay: true, windKph: 0, cloudCover: 100 } })).tone).toBe("bright");
    expect(landingScene(reading({ localHour: 13, sky: { kind: "clear", intensity: 0, isDay: true, windKph: 0, cloudCover: 0 } })).tone).toBe("bright");
    expect(landingScene(reading({ localHour: 13, sky: { kind: "storm", intensity: 1, isDay: true, windKph: 0, cloudCover: 100 } })).tone).toBe("dark");
    expect(landingScene(reading({ localHour: null, sky: { kind: "fog", intensity: 1, isDay: true, windKph: null, cloudCover: null } })).tone).toBe("bright");
  });

  it("marks falling weather, and cleans what it is given", () => {
    for (const kind of SKY_KINDS) {
      const s = landingScene(reading({ sky: { kind, intensity: 0.5, isDay: true, windKph: 5, cloudCover: 50 } }));
      expect(s.falls).toBe(["drizzle", "rain", "sleet", "hail", "storm", "snow"].includes(kind));
    }
    const odd = landingScene(reading({ localHour: 27.9, sky: { kind: "lava" as never, intensity: 9, isDay: "yes" as never, windKph: Number.NaN, cloudCover: null } }));
    expect(odd).toMatchObject({ kind: "clear", intensity: 1, isDay: false, hour: 3, windKph: null, cloudCover: null });
    expect(usableWeather(null)).toBeNull();
    expect(usableWeather(reading())).not.toBeNull();
    // The page-wide sky draws fewer particles than the app's hero.
    expect(PAGE_SKY_EASE).toBeGreaterThan(0);
    expect(PAGE_SKY_EASE).toBeLessThan(1);
  });

  it("shows a sky the story asks for by night, whatever the visitor's hour", () => {
    const day = landingScene(reading({ localHour: 13, sky: { kind: "clear", intensity: 0, isDay: true, windKph: 12, cloudCover: 0 } }));
    expect(day.tone).toBe("bright");
    expect(demoScene("clear", day)).toMatchObject({ kind: "clear", isDay: false, hour: DEMO_HOUR, tone: "dark", falls: false, windKph: 12 });
    expect(demoScene("rain", day)).toMatchObject({ kind: "rain", isDay: false, hour: DEMO_HOUR, tone: "dark", falls: true });
    // No reading: the same night, with a light wind.
    expect(demoScene("snow", null)).toMatchObject({ kind: "snow", isDay: false, hour: DEMO_HOUR, tone: "dark", falls: true, windKph: 8 });
  });

  it("keeps the override in the browser: the server never draws it", () => {
    setSkyOverride("rain");
    try {
      expect(render("en")).not.toContain('class="lp-sky"');
      // An unknown kind clears it instead of reaching Sky.
      expect(() => setSkyOverride("lava" as never)).not.toThrow();
    } finally {
      setSkyOverride(null);
    }
  });
});

describe("text contrast over the sky (WCAG 1.4.3)", () => {
  const lin = (c: number) => (c / 255 <= 0.03928 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);
  const lum = ([r, g, b]: number[]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const contrast = (a: number[], b: number[]) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
  const BG = [5, 5, 5];
  const INK = [221, 221, 221];
  const ACCENT = [252, 79, 0];
  const base = Number(css.match(/\n {4}--lp-scrim: ([\d.]+);/)?.[1]);
  const lift = Number(css.match(/--lp-scrim-lift: ([\d.]+);/)?.[1]);
  const demoBase = Number(css.match(/\.lp-sky\[data-demo\] \{\s*--lp-scrim: ([\d.]+);/)?.[1]);
  /** The grain over the sky is white at about this strength on average (landing.css .lp-sky::after). */
  const GRAIN = 0.04;

  // The CSS filter functions as Filter Effects 1 defines them: sRGB values 0..1, clamped after each.
  type Rgb = number[];
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  const matrix = (m: number[][]) => (c: Rgb) => m.map((r) => clamp(r[0] * c[0] + r[1] * c[1] + r[2] * c[2]));
  const FILTERS: Record<string, (n: number) => (c: Rgb) => Rgb> = {
    grayscale: () => matrix([[0.2126, 0.7152, 0.0722], [0.2126, 0.7152, 0.0722], [0.2126, 0.7152, 0.0722]]),
    sepia: () => matrix([[0.393, 0.769, 0.189], [0.349, 0.686, 0.168], [0.272, 0.534, 0.131]]),
    "hue-rotate": (deg) => {
      const c = Math.cos((deg * Math.PI) / 180);
      const s = Math.sin((deg * Math.PI) / 180);
      return matrix([
        [0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928],
        [0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.14, 0.072 - c * 0.072 - s * 0.283],
        [0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072],
      ]);
    },
    saturate: (n) => matrix([[0.213 + 0.787 * n, 0.715 - 0.715 * n, 0.072 - 0.072 * n], [0.213 - 0.213 * n, 0.715 + 0.285 * n, 0.072 - 0.072 * n], [0.213 - 0.213 * n, 0.715 - 0.715 * n, 0.072 + 0.928 * n]]),
    brightness: (n) => (c) => c.map((v) => clamp(v * n)),
    contrast: (n) => (c) => c.map((v) => clamp((v - 0.5) * n + 0.5)),
  };
  /** The filter of one state of the sky, read from the stylesheet and applied to a colour (0..255). */
  const filterOf = (selector: string) => {
    const text = css.match(new RegExp(`\\n {2}${esc(selector)} \\{[^}]*?filter: ([^;]+);`))?.[1] ?? "";
    const steps = [...text.matchAll(/([a-z-]+)\(([\d.]+)(?:deg)?\)/g)].map(([, name, n]) => FILTERS[name](Number(n)));
    // grayscale, brightness, contrast: the sky carries no hue of its own.
    expect(steps.length, selector).toBe(3);
    return (sky: Rgb) => steps.reduce((c, f) => f(c), sky.map((v) => v / 255)).map((v) => v * 255);
  };
  /** A patch of sky as the page shows it: filtered, under `scrim` of the page colour, then the grain. */
  const shown = (sky: Rgb, filter: (c: Rgb) => Rgb, scrim: number) => filter(sky).map((c, i) => (c * (1 - scrim) + BG[i] * scrim) * (1 - GRAIN) + 255 * GRAIN);
  const readable = (patch: Rgb, what: string) => {
    expect(contrast(INK, patch), `ink on ${what}`).toBeGreaterThanOrEqual(4.5);
    // The accent is only ever large figures and marks on the sky (never small text): 3:1.
    expect(contrast(ACCENT, patch), `accent on ${what}`).toBeGreaterThanOrEqual(3);
  };
  const WHITE = [255, 255, 255];
  // Rain at golden hour with its warm glow and veil: the lightest sky that takes the first scrim alone.
  const RAIN_GOLD = [147, 136, 137];
  // Fog by night at its thickest (Sky: #DCE2EA noise at up to 0.59 over the night horizon #2C333D).
  const FOG_NIGHT = [220, 226, 234].map((c, i) => c * 0.59 + [44, 51, 61][i] * 0.41);

  it("ink keeps 4.5:1 and the accent 3:1 on the brightest possible daytime sky", () => {
    expect(base).toBeGreaterThan(0);
    expect(lift).toBeGreaterThan(0);
    const full = 1 - (1 - base) * (1 - lift);
    readable(shown(WHITE, filterOf('.lp-sky[data-tone="bright"] .lp-sky-art'), full), "a white day sky");
  });

  it("the first scrim alone holds for the lightest night, rain and storm sky", () => {
    readable(shown(RAIN_GOLD, filterOf(".lp-sky-art"), base), "rain at golden hour");
    // Fog is pale at every hour, so it never takes the first scrim alone (scene.ts).
    expect(landingScene(reading({ localHour: 2, sky: { kind: "fog", intensity: 1, isDay: false, windKph: null, cloudCover: null } })).tone).toBe("bright");
    readable(shown(FOG_NIGHT, filterOf('.lp-sky[data-tone="bright"] .lp-sky-art'), 1 - (1 - base) * (1 - lift)), "fog by night");
  });

  it("a sky the story is showing off stays readable too", () => {
    expect(demoBase).toBeGreaterThan(0);
    expect(demoBase).toBeLessThan(base);
    // Demonstrations are night skies (demoScene). Their lightest patch is the snow sky's horizon
    // (Sky: #2E3D55) under its veil: #DCE2EA at (0.06 + 0.08 x 0.9) x 0.6.
    const veil = (0.06 + 0.08 * 0.9) * 0.6;
    const snowNight = [46, 61, 85].map((c, i) => c * (1 - veil) + [220, 226, 234][i] * veil);
    const demo = filterOf(".lp-sky[data-demo] .lp-sky-art");
    readable(shown(snowNight, demo, demoBase), "the snow demonstration");
    readable(shown([26, 35, 48], demo, demoBase), "the rain demonstration");
    readable(shown([27, 42, 74], demo, demoBase), "the clear demonstration");
    for (const kind of ["clear", "rain", "snow"] as const) expect(demoScene(kind, null).tone, kind).toBe("dark");
  });

  it("text set straight on the sky is ink, and small print gets a solid band", () => {
    for (const selector of [".lp-title", ".lp-lead", ".lp-hud dd", ".lp-hint-word", ".lp-end-line"]) expect(rule(selector), selector).toContain("color: var(--color-ink);");
    // Small labels on the sky are ink too: the orange accent does not reach 4.5:1 on a grey sky.
    for (const selector of [".lp-label", ".lp-hud dt", ".lp-hud-mark", ".lp-tag", ".lp-button-ghost"]) expect(rule(selector), selector).toContain("color: var(--color-ink);");
    expect(rule(".lp-footer")).toContain("background-color: var(--color-bg);");
    expect(render("en")).toContain('<footer class="lp-footer">');
    // The bar is solid as well: that is what lets Sign in be small orange type on it.
    expect(rule(".lp-bar")).toContain("background-color: var(--color-bg);");
    expect(rule(".lp-signin")).toContain("color: var(--color-accent);");
    expect(contrast(ACCENT, BG)).toBeGreaterThanOrEqual(4.5);
    // Its ground is the page colour under a tenth of the accent.
    expect(rule(".lp-signin")).toContain("background-color: rgb(252 79 0 / 0.1);");
    const ground = BG.map((c, i) => c * 0.9 + ACCENT[i] * 0.1);
    expect(contrast(ACCENT, ground)).toBeGreaterThanOrEqual(4.5);
  });

  it("the haze at the close leaves the line on it readable", () => {
    // The strongest part of the haze, as the stylesheet draws it, over the page colour.
    const strength = Number(rule(".lp-haze").match(/rgb\(252 79 0 \/ ([\d.]+)\) 0%/)?.[1]);
    expect(strength).toBeGreaterThan(0);
    const haze = BG.map((c, i) => c * (1 - strength) + ACCENT[i] * strength);
    expect(contrast(INK, haze)).toBeGreaterThanOrEqual(4.5);
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
      expect(m.description).toBe(t.description);
      expect(JSON.stringify(m.title)).toContain("Aspire");
      expect(m.openGraph?.description).toBe(t.description);
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
    expect(m.description).toBe(LANDING_TEXT.mn.description);
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
    expect(app.description).toBe(LANDING_TEXT.de.description);
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
    expect(manifest.theme_color).toBe("#050505");
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
