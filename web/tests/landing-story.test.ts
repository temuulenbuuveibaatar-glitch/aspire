// The scroll story of the opening page (components/landing/Story.tsx and components/landing/story):
// its server render is the finished, readable page in every language (every scene title, the six
// card names, the five language lines, the feature rows), nothing in it waits for a script to be
// seen, made-up figures are labelled, the visitor's weather is only shown when it is real, the copy
// has no emojis and no em or en dashes, and the numbers behind the motion end where they should.
import { readdirSync, readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { prerender } from "react-dom/static";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setSkyOverride } from "@/components/landing/sky-store";
import { FeatureIndex, Marquee, Story } from "@/components/landing/Story";
import { CARD_IDS, CHIP_IDS, FEATURE_IDS, STORY_COPY, storyCopy } from "@/components/landing/story/copy";
import {
  askPhase,
  chipCss,
  chipWindow,
  fadeStops,
  fadeValues,
  LANG_STARTS,
  poseCss,
  SKY_DEMO,
  SKY_STARTS,
  skyStep,
  stackPose,
  stackRank,
  stackSetup,
  stackTimeline,
  usableReading,
} from "@/components/landing/story/math";
import { V6 } from "@/components/v6/text";
import { ON_IT } from "@/lib/brain/shared";
import type { LandingWeather } from "@/lib/landing-weather";
import { HTML_LANG, LANGS, type Lang } from "@/lib/lang";
import { ALL_TOOLS, TOOLS } from "@/lib/tools";

// The sky store is the other half's: here it only has to be seen never to be touched by a render.
vi.mock("@/components/landing/sky-store", () => ({ setSkyOverride: vi.fn(), useSkyOverride: () => null }));

const SYMBOLS = /[\u{2190}-\u{21FF}\u{2300}-\u{23FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]|\p{Extended_Pictographic}/u;
/** Figure dash, en dash, em dash, horizontal bar. The minus sign of a temperature (U+2212) is not one. */
const DASHES = /[\u2012-\u2015]/;
/** How React writes text into HTML. */
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
/** The page as plain text: tags out, React's entities back to characters. */
const textOf = (html: string) =>
  html
    .replace(/<[^>]+>/g, "")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
const count = (html: string, part: string) => html.split(part).length - 1;
const strings = (x: unknown): string[] => (typeof x === "string" ? [x] : x && typeof x === "object" ? Object.values(x).flatMap(strings) : []);
/** What is inside one of the six product cards. */
function cardOf(html: string, id: string): string {
  const at = html.indexOf(`data-card="${id}"`);
  expect(at, id).toBeGreaterThan(-1);
  return html.slice(html.indexOf(">", at) + 1, html.indexOf("</article>", at));
}

const story = (lang: Lang) => renderToString(createElement(Story, { lang }));
const marquee = (lang: Lang) => renderToString(createElement(Marquee, { lang }));
const index = (lang: Lang) => renderToString(createElement(FeatureIndex, { lang }));

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

/** The story once every <Suspense> has resolved (what a visitor ends up with). */
async function storyWith(weather: Promise<LandingWeather | null>, lang: Lang = "en"): Promise<string> {
  const { prelude } = await prerender(createElement(Story, { lang, weather }), { progressiveChunkSize: 1e9 });
  return new Response(prelude).text();
}

beforeEach(() => {
  vi.mocked(setSkyOverride).mockClear();
});

describe("Story (server render)", () => {
  for (const lang of LANGS) {
    it(`shows all five scenes in ${lang}`, () => {
      const html = story(lang);
      const c = STORY_COPY[lang];
      const scenes = [c.ask, c.city, c.weather, c.languages, c.work];
      expect(count(html, "<section")).toBe(5);
      expect(count(html, "<h2")).toBe(5);
      for (const [i, id] of ["ask", "city", "weather", "languages", "work"].entries()) {
        expect(html).toContain(`id="story-${id}" data-scene="${id}" aria-labelledby="story-${id}-title"`);
        expect(html).toContain(`<h2 id="story-${id}-title"`);
        // The big index numeral, the label, every line of the giant title and the one line under it.
        expect(html).toContain(`>0${i + 1}</span>`);
        expect(html).toContain(esc(scenes[i].label));
        expect(scenes[i].title.length).toBeGreaterThan(0);
        for (const row of scenes[i].title) expect(html).toContain(`>${esc(row)}</span>`);
        expect(html).toContain(esc(scenes[i].line));
      }
      // Read as plain text (search engines, screen readers in browse mode), the title's lines do not run together.
      expect(textOf(html)).toContain(c.ask.title.join(" "));
    });

    it(`shows the six cards, the five language lines and the seven jobs in ${lang}`, () => {
      const html = story(lang);
      const c = STORY_COPY[lang];
      expect(count(html, "data-card=")).toBe(6);
      for (const id of CARD_IDS) {
        expect(html).toContain(`data-card="${id}"`);
        expect(html).toMatch(new RegExp(`<h3[^>]*>.*?${esc(c.city.cards[id]).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</span></h3>`));
      }
      // One question in all five languages, each line marked with its own language.
      for (const x of LANGS) expect(html).toContain(`<span lang="${HTML_LANG[x]}" class="v6-on-photo min-w-0 [overflow-wrap:anywhere]">${esc(STORY_COPY[x].ask.q)}</span>`);
      expect(count(html, "data-chip=")).toBe(7);
      for (const id of CHIP_IDS) {
        expect(html).toContain(`data-chip="${id}"`);
        expect(html).toContain(`>${esc(c.work.chips[id])}</span>`);
      }
      // The example exchange is there in full: the question, the tool line and the reply.
      expect(html).toContain(esc(c.ask.q));
      expect(html).toContain(esc(c.ask.step));
      expect(html).toContain(esc(c.ask.a));
    });

    it(`needs no script to be read in ${lang}`, () => {
      const html = story(lang);
      // Normal flow: no pinned strip, and nothing left transparent, moved away or invisible.
      expect(html).toContain('data-story="still"');
      expect(html).not.toContain("data-live");
      expect(html).not.toContain("data-active");
      expect(html).not.toMatch(/opacity:0[;"]/);
      expect(html).not.toContain("visibility:hidden");
      expect(html).not.toMatch(/class="[^"]*\binvisible\b/);
      expect(html).not.toContain("translate3d");
      expect(html).not.toContain("blur(");
      expect(html).not.toContain('data-on="false"');
      // No heading above the page's own, no list markers, nothing folded away.
      expect(html).not.toContain("<h1");
      expect(html).not.toContain("<ol");
      expect(html).not.toContain("<details");
      // One canvas: the orb of scene 01. The sky belongs to the page, not to the story.
      expect(count(html, "<canvas")).toBe(1);
      expect(html).not.toMatch(SYMBOLS);
      expect(html).not.toMatch(DASHES);
    });
  }

  it("labels every made-up figure as an example and calls nothing live", () => {
    for (const lang of LANGS) {
      const html = story(lang);
      const c = STORY_COPY[lang];
      // The exchange of scene 01, and the weather, bus, traffic and air cards (no reading here).
      expect(count(html, `<span class="st-tag`)).toBe(5);
      expect(count(html, `>${esc(c.example)}</span>`)).toBe(5);
      for (const id of ["weather", "bus", "traffic", "air"]) expect(cardOf(html, id), `${lang}: ${id}`).toContain(`>${esc(c.example)}</span>`);
      // The camera and news cards show no figure at all.
      for (const id of ["cameras", "news"]) expect(textOf(cardOf(html, id)), `${lang}: ${id}`).not.toMatch(/\d/);
      expect(html).not.toContain("v6-live-dot");
      expect(html).not.toContain("data-prov=");
      expect(html).not.toContain("data-yours");
    }
  });

  it("uses the app's own words inside the cards and for the reply to a task", () => {
    for (const lang of LANGS) {
      const html = story(lang);
      const v = V6[lang];
      for (const word of [v.load.medium, v.aqi.good, v.usAqi, v.estimated, v.kinds.clear, v.kinds.rain, v.kinds.snow]) expect(html, `${lang}: ${word}`).toContain(esc(word));
      expect(textOf(html)).toContain(`3 ${STORY_COPY[lang].city.to[0]} 4 ${v.min}`);
      expect(STORY_COPY[lang].work.ack).toBe(ON_IT.mr[lang]);
      expect(html).toContain(esc(ON_IT.mr[lang]));
    }
  });

  it("never asks the page for another sky while rendering", () => {
    for (const lang of LANGS) story(lang);
    expect(setSkyOverride).not.toHaveBeenCalled();
  });

  it("falls back to English for an unknown language", () => {
    const html = renderToString(createElement(Story, { lang: "xx" as Lang }));
    expect(html).toContain(esc(STORY_COPY.en.city.line));
    expect(storyCopy("xx" as Lang)).toBe(STORY_COPY.en);
  });
});

describe("the visitor's weather in the story", () => {
  it("shows the real reading in the weather card and in scene 03, with its source", async () => {
    for (const lang of LANGS) {
      const html = await storyWith(Promise.resolve(reading()), lang);
      const v = V6[lang];
      const c = STORY_COPY[lang];
      const card = cardOf(html, "weather");
      expect(card).toContain("Darkhan");
      expect(card).toMatch(/<data value="-12.4"[^>]*>−12°<\/data>/);
      expect(card).toContain(esc(v.kinds.snow));
      expect(textOf(card)).toContain(`${v.forecast} · Open-Meteo`);
      expect(card).not.toContain("st-tag");
      // Scene 03 names the same reading under the three example skies.
      expect(html).toContain("data-yours");
      const yours = html.slice(html.indexOf("data-yours"));
      expect(textOf(yours)).toContain(`Darkhan · −12°C · ${v.kinds.snow}`);
      expect(count(html, 'data-prov="forecast"')).toBe(2);
      // One example label fewer than without a reading: the weather card is real now.
      expect(count(html, `>${esc(c.example)}</span>`)).toBe(4);
      expect(html).not.toContain("v6-skeleton");
      expect(html).not.toMatch(SYMBOLS);
      expect(html).not.toMatch(DASHES);
    }
  });

  it("names Erdenet in the page language when the visitor's place is not known", async () => {
    for (const lang of LANGS) {
      const html = await storyWith(Promise.resolve(reading({ place: "Erdenet", local: false })), lang);
      expect(cardOf(html, "weather")).toContain(`>${STORY_COPY[lang].erdenet}</p>`);
    }
  });

  it("never shows an overridden reading as the current weather", async () => {
    const html = await storyWith(Promise.resolve(reading({ preview: true })));
    expect(cardOf(html, "weather")).toContain(`>${STORY_COPY.en.example}</span>`);
    expect(html).not.toContain("data-prov=");
    expect(html).not.toContain("data-yours");
    expect(html).not.toContain("Open-Meteo");
  });

  it("treats a null, rejected or unusable reading as no reading", async () => {
    const bad = [Promise.resolve(null), Promise.reject(new Error("down")), Promise.resolve(reading({ tempC: Number.NaN })), Promise.resolve({ place: "X" } as LandingWeather)];
    for (const p of bad) {
      const html = await storyWith(p);
      expect(html).toContain(esc(STORY_COPY.en.city.line));
      expect(html).not.toContain("NaN");
      expect(html).not.toContain("data-prov=");
      expect(html).toMatch(/<data value="-12"[^>]*>−12°<\/data>/);
      expect(count(html, `>${STORY_COPY.en.example}</span>`)).toBe(5);
    }
  });

  it("never makes the story wait for the reading", () => {
    // A reading that never arrives: the synchronous render still has every scene and all six cards.
    // The weather card is the labelled example meanwhile (a finished card even without JavaScript), never a skeleton.
    const html = renderToString(createElement(Story, { lang: "en", weather: new Promise<LandingWeather | null>(() => {}) }));
    const c = STORY_COPY.en;
    for (const scene of [c.ask, c.city, c.weather, c.languages, c.work]) expect(html).toContain(esc(scene.line));
    for (const id of CARD_IDS) expect(html).toContain(esc(c.city.cards[id]));
    expect(html).toMatch(/<data value="-12"[^>]*>−12°<\/data>/);
    expect(html).toContain(`>${c.example}</span>`);
    expect(html).not.toContain("v6-skeleton");
    expect(html).not.toContain("data-prov=");
    expect(html).toContain(esc(c.work.chips.desktop));
  });

  it("escapes a place name and keeps it short", async () => {
    const html = await storyWith(Promise.resolve(reading({ place: `<img src=x onerror=alert(1)>${"a".repeat(300)}` })));
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("a".repeat(81));
  });

  it("checks a reading before it is shown", () => {
    expect(usableReading(null)).toBeNull();
    expect(usableReading(undefined)).toBeNull();
    expect(usableReading(reading({ tempC: Number.POSITIVE_INFINITY }))).toBeNull();
    expect(usableReading({ ...reading(), sky: null } as unknown as LandingWeather)).toBeNull();
    expect(usableReading(reading())).toEqual({ place: "Darkhan", local: true, current: true, tempC: -12.4, kind: "snow", isDay: false });
    const odd = usableReading(reading({ place: `  ${"b".repeat(200)}  `, preview: true, sky: { kind: "lava" as never, intensity: 9, isDay: "yes" as never, windKph: 0, cloudCover: null } }));
    expect(odd).toMatchObject({ current: false, kind: "clear", isDay: false });
    expect(odd?.place).toHaveLength(80);
  });
});

describe("Marquee (server render)", () => {
  it("lists every city once, in every language", () => {
    for (const lang of LANGS) {
      const html = marquee(lang);
      const c = STORY_COPY[lang].marquee;
      expect(html).toContain(esc(c.label));
      expect(html).toContain(esc(c.note));
      expect(c.cities).toHaveLength(STORY_COPY.en.marquee.cities.length);
      expect(new Set(c.cities).size).toBe(c.cities.length);
      for (const city of c.cities) expect(count(html, `>${esc(city)}</li>`), `${lang}: ${city}`).toBe(1);
      // The second run of names that fills the moving row is decoration: only a live page adds it.
      expect(html).not.toContain("aria-hidden");
      expect(html).not.toContain("data-live");
      expect(html).not.toMatch(/opacity:0[;"]/);
      expect(html).not.toMatch(SYMBOLS);
      expect(html).not.toMatch(DASHES);
    }
    // Aspire's home city comes first and is the one filled in.
    expect(marquee("en")).toMatch(/<li class="st-mq-item" data-home="true">Erdenet<\/li>/);
    expect(count(marquee("en"), "data-home")).toBe(1);
  });
});

describe("FeatureIndex (server render)", () => {
  it("shows the eight numbered rows with their title and line, in every language", () => {
    expect(FEATURE_IDS).toHaveLength(8);
    for (const lang of LANGS) {
      const html = index(lang);
      const c = STORY_COPY[lang].index;
      expect(html).toContain(`<h2 id="story-index-title" class="st-label v6-on-photo">${esc(c.label)}</h2>`);
      expect(Object.keys(c.rows).sort()).toEqual([...FEATURE_IDS].sort());
      expect(count(html, "data-row=")).toBe(8);
      for (const [i, id] of FEATURE_IDS.entries()) {
        expect(html).toContain(`data-row="${id}"`);
        expect(html).toContain(`>0${i + 1}</span>`);
        expect(html).toContain(`<h3 class="st-ix-title v6-on-photo">${esc(c.rows[id].title)}</h3>`);
        expect(html).toContain(`<p class="st-ix-line v6-on-photo">${esc(c.rows[id].line)}</p>`);
      }
      // Text extraction keeps number, title and line apart.
      expect(textOf(html)).toContain(`01 ${c.rows.bus.title} ${c.rows.bus.line}`);
      // The picture that follows the pointer is for a mouse only: never in the server's HTML.
      expect(html).not.toContain("st-ix-preview");
      expect(html).not.toMatch(/opacity:0[;"]/);
      expect(html).not.toContain("<ol");
      expect(html).not.toContain("<h1");
      expect(html).not.toMatch(SYMBOLS);
      expect(html).not.toMatch(DASHES);
    }
  });
});

describe("story copy", () => {
  it("has no em or en dash and no emoji in copy.ts", () => {
    const source = readFileSync(new URL("../components/landing/story/copy.ts", import.meta.url), "utf8");
    expect(source).not.toContain("\u2014");
    expect(source).not.toContain("\u2013");
    expect(source).not.toMatch(DASHES);
    expect(source).not.toMatch(SYMBOLS);
    expect(source).not.toMatch(/[\u{1F1E6}-\u{1F1FF}]/u);
  });

  it("has no em or en dash anywhere in the story's source", () => {
    const dir = new URL("../components/landing/story/", import.meta.url);
    const files = readdirSync(dir).filter((f) => /\.(tsx?|css)$/.test(f));
    expect(files.length).toBeGreaterThan(10);
    for (const f of files) expect(readFileSync(new URL(f, dir), "utf8"), f).not.toMatch(DASHES);
    expect(readFileSync(new URL("../components/landing/Story.tsx", import.meta.url), "utf8")).not.toMatch(DASHES);
  });

  it("has the same shape and no empty or symbol strings in every language", () => {
    const shape = (o: unknown): unknown =>
      typeof o === "string" ? "s" : Array.isArray(o) ? o.map(shape) : Object.fromEntries(Object.entries(o as object).map(([k, v]) => [k, shape(v)]));
    // Titles may break into a different number of lines per language: compare everything else.
    const loose = (c: (typeof STORY_COPY)[Lang]) => shape({ ...c, ask: { ...c.ask, title: 0 }, city: { ...c.city, title: 0 }, weather: { ...c.weather, title: 0 }, languages: { ...c.languages, title: 0 }, work: { ...c.work, title: 0 } });
    for (const lang of LANGS) {
      const c = STORY_COPY[lang];
      expect(loose(c)).toEqual(loose(STORY_COPY.en));
      const all = strings(c);
      expect(all.filter((s) => !s.trim())).toEqual([]);
      expect(all.filter((s) => SYMBOLS.test(s))).toEqual([]);
      expect(all.filter((s) => DASHES.test(s))).toEqual([]);
      for (const scene of [c.ask, c.city, c.weather, c.languages, c.work]) {
        expect(scene.title.length).toBeGreaterThanOrEqual(1);
        expect(scene.title.length).toBeLessThanOrEqual(3);
      }
      expect(Object.keys(c.city.cards)).toEqual([...CARD_IDS]);
      expect(Object.keys(c.work.chips)).toEqual([...CHIP_IDS]);
      // The sign in the photo preview is in another language than the page, so there is something to read out.
      expect(c.index.signLang).not.toBe(lang);
    }
  });

  it("names only jobs the agent has a tool for", () => {
    const names = new Set(ALL_TOOLS.map((t) => t.name));
    for (const tool of ["add_to_calendar", "get_calendar", "play_video", "play_music", "open_app", "set_reminder", "get_next_bus", "get_weather", "get_air_quality", "get_traffic", "find_cameras", "get_news", "find_places", "set_timer"]) {
      expect(names.has(tool), tool).toBe(true);
    }
    // Aspire Desktop: the desktop_ tools exist, and only outside the everyday toolbox.
    expect(ALL_TOOLS.some((t) => t.name.startsWith("desktop_"))).toBe(true);
    expect(TOOLS.some((t) => t.name.startsWith("desktop_"))).toBe(false);
  });
});

describe("the numbers behind the motion", () => {
  const setups = [stackSetup(2, false), stackSetup(3, false), stackSetup(6, false), stackSetup(6, true)];

  it("leaves every card exactly in its own cell at rest", () => {
    for (const setup of setups) {
      for (let slot = 0; slot < 6; slot++) {
        const p = stackPose(slot, 1, 1, setup);
        expect(Math.abs(p.x)).toBeLessThan(1e-6);
        expect(Math.abs(p.y)).toBeLessThan(1e-6);
        expect(Math.abs(p.rotate)).toBeLessThan(1e-6);
        expect(p.scale).toBeCloseTo(1, 6);
        expect(p.opacity).toBe(1);
        expect(poseCss(p)).toBe("none");
      }
    }
  });

  it("deals six cards onto one pile in the middle of the grid, the weather card on top", () => {
    for (const setup of setups) {
      const { dealEnd, fanFrom } = stackTimeline(setup);
      expect(dealEnd).toBeGreaterThan(0);
      expect(fanFrom).toBeGreaterThan(dealEnd);
      // Before the stage arrives nothing is shown; once dealt, every card is.
      for (let slot = 0; slot < 6; slot++) {
        expect(stackPose(slot, 0, 0, setup).opacity).toBe(0);
        expect(stackPose(slot, 1, dealEnd, setup).opacity).toBe(1);
      }
      // Where each card's centre is, in cells from the grid's top left corner: all six within a third of a cell.
      const centres = Array.from({ length: 6 }, (_, slot) => {
        const p = stackPose(slot, 1, dealEnd, setup);
        return [(slot % setup.cols) + p.x / 100, Math.floor(slot / setup.cols) + p.y / 100];
      });
      for (const [x, y] of centres) {
        expect(Math.abs(x - (setup.cols - 1) / 2)).toBeLessThan(0.1);
        expect(Math.abs(y - ((setup.rows - 1) / 2 + setup.lift / 100))).toBeLessThan(0.1);
      }
      // Slight rotations, larger than in the row, and never from nothing.
      for (let slot = 0; slot < 6; slot++) {
        const p = stackPose(slot, 1, dealEnd, setup);
        expect(Math.abs(p.rotate)).toBeGreaterThan(1);
        expect(Math.abs(p.rotate)).toBeLessThan(12);
        expect(p.scale).toBeGreaterThan(1);
        expect(stackPose(slot, 0.9, 0, setup).scale).toBeGreaterThan(1);
      }
      expect(stackRank(0, 0, setup)).toBe(5);
      expect(new Set(Array.from({ length: 6 }, (_, slot) => stackRank(slot, 0, setup))).size).toBe(6);
    }
  });

  it("cuts the deck once on a wide screen, and never on a phone", () => {
    const wide = stackSetup(6, true);
    const { cutFrom, cutMid, cutEnd } = stackTimeline(wide);
    // At the middle of the cut the two halves lie side by side...
    const xs = Array.from({ length: 6 }, (_, slot) => (slot % 6) + stackPose(slot, 1, cutMid, wide).x / 100);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(1);
    // ...the lower half goes on top, and the pile closes again.
    expect(stackRank(0, cutFrom, wide)).toBe(5);
    expect(stackRank(0, cutEnd, wide)).toBe(2);
    expect(stackRank(3, cutEnd, wide)).toBe(5);
    const closed = Array.from({ length: 6 }, (_, slot) => (slot % 6) + stackPose(slot, 1, cutEnd, wide).x / 100);
    expect(Math.max(...closed) - Math.min(...closed)).toBeLessThan(0.1);
    const phone = stackSetup(2, false);
    for (let slot = 0; slot < 6; slot++) expect(stackRank(slot, 1, phone)).toBe(stackRank(slot, 0, phone));
  });

  it("fans the pile out without ever stepping back, and holds the finished row", () => {
    for (const setup of setups) {
      const { fanFrom } = stackTimeline(setup);
      for (let slot = 0; slot < 6; slot++) {
        let far = Infinity;
        for (let pin = fanFrom; pin <= 1.0001; pin += 0.01) {
          const p = stackPose(slot, 1, pin, setup);
          const d = Math.hypot(p.x, p.y);
          // The arc lifts a card a little on its way: allow for it.
          expect(d).toBeLessThanOrEqual(far + 6.5);
          far = Math.min(far, d);
        }
        expect(poseCss(stackPose(slot, 1, 0.95, setup))).toBe("none");
      }
    }
  });

  it("flies each chip in from far away and lands it in its cell", () => {
    for (let i = 0; i < CHIP_IDS.length; i++) {
      const [from, to] = chipWindow(i);
      expect(from).toBeGreaterThanOrEqual(0);
      expect(to).toBeLessThanOrEqual(0.95);
      expect(chipCss(i, 1)).toBe("none");
      const start = chipCss(i, 0);
      expect(start).toMatch(/^translate3d\(-?\d+\.\d+%, -?\d+\.\d+%, 0\) rotate\(-?\d+\.\d+deg\) scale\(0\.9000\)$/);
      // Never from nothing: the smallest a chip ever is.
      expect(chipCss(i, -3)).toBe(start);
    }
    expect(chipWindow(1)[0]).toBeGreaterThan(chipWindow(0)[0]);
  });

  it("asks the page for clear, rain and snow in turn, and for nothing before, after or at rest", () => {
    expect(SKY_DEMO).toEqual(["clear", "rain", "snow"]);
    expect(skyStep(0.2, 0, 0)).toBe(-1); // not yet on screen
    expect(skyStep(1, 0, 0)).toBe(0);
    expect(skyStep(1, SKY_STARTS[1] + 0.01, 0)).toBe(1);
    expect(skyStep(1, SKY_STARTS[2] + 0.01, 0)).toBe(2);
    expect(skyStep(1, SKY_STARTS[3] + 0.01, 0)).toBe(-1); // the visitor's own sky again, still pinned
    expect(skyStep(1, 0.4, 0.5)).toBe(-1); // leaving
    expect(skyStep(1, 1, 0)).toBe(-1); // at rest: a still page never asks
  });

  it("keeps exactly one step readable at any point of a crossfade", () => {
    for (const starts of [SKY_STARTS, LANG_STARTS]) {
      for (let i = 0; i < starts.length; i++) {
        const at = fadeStops(starts, i, 0.03);
        const on = fadeValues(starts, i, 0, 1, 0);
        expect(at).toHaveLength(on.length);
        for (let k = 1; k < at.length; k++) expect(at[k]).toBeGreaterThan(at[k - 1]);
      }
      // The first step is on from the very start and the last one stays to the end.
      expect(fadeValues(starts, 0, 0, 1, 0)[0]).toBe(1);
      expect(fadeValues(starts, starts.length - 1, 0, 1, 0).at(-1)).toBe(1);
    }
    expect(LANG_STARTS).toHaveLength(LANGS.length);
  });

  it("plays the exchange in order and ends on the finished one", () => {
    expect([0, 0.2, 0.45, 0.7, 1].map(askPhase)).toEqual(["idle", "ask", "think", "answer", "rest"]);
  });
});
