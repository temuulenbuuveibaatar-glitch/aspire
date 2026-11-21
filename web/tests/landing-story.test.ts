// The scroll story of the opening page (components/landing/Story.tsx and components/landing/story):
// its server render is the finished, readable page in every language (every scene title, the five
// language lines, the seven jobs), nothing in it waits for a script to be seen
// and no control is in it that only a script could work, made-up content is labelled, the
// visitor's readings are only shown when they are real (a dial for each figure the reading has, a
// live mark only on a current one), the copy has no emojis and no em or en dashes, and the numbers
// behind the motion (the dials, the steps, the settling line) end where they should.
import { readdirSync, readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { prerender } from "react-dom/static";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setSkyOverride } from "@/components/landing/sky-store";
import { Marquee, Story } from "@/components/landing/Story";
import { CHIP_IDS, FEATURE_IDS, STORY_COPY, storyCopy } from "@/components/landing/story/copy";
import { DECODE_MS, decodeFrame, decodeMs } from "@/components/landing/story/Decode";
import {
  clockDial,
  clockText,
  DIAL_IDS,
  dialFill,
  dialStarts,
  dialsTall,
  dialTurn,
  figureFit,
  ghostAlpha,
  minutesAt,
  readingDials,
  soloAlpha,
  utcOffsetLabel,
} from "@/components/landing/story/dials";
import {
  askPhase,
  chipCss,
  chipWindow,
  fadeStops,
  fadeValues,
  LANG_STARTS,
  pinScrollTop,
  SKY_DEMO,
  SKY_STARTS,
  skyStep,
  stepAt,
  stepTarget,
  usableReading,
} from "@/components/landing/story/math";
import { liveWord } from "@/components/landing/story/SceneCity";
import { clipSrc, createPlayer } from "@/components/landing/story/sound";
import { aqiPosition } from "@/components/v6/AirCard";
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
/** What is inside one dial of scene 002. */
function dialOf(html: string, id: string): string {
  const at = html.indexOf(`data-dial="${id}"`);
  expect(at, id).toBeGreaterThan(-1);
  return html.slice(html.indexOf(">", at) + 1, html.indexOf("</li>", at));
}
/** What is inside one scene: from the end of its section tag to the next section. */
function sceneOf(html: string, id: string): string {
  const at = html.indexOf(`id="story-${id}"`);
  expect(at, id).toBeGreaterThan(-1);
  const next = html.indexOf("<section", at);
  return html.slice(html.indexOf(">", at) + 1, next === -1 ? undefined : next);
}
/** Words of four letters or more, lower case: the ones that would be noticed if they came twice. */
const contentWords = (text: string) => (text.toLowerCase().match(/[\p{L}]{4,}/gu) ?? []) as string[];

const story = (lang: Lang) => renderToString(createElement(Story, { lang }));
const marquee = (lang: Lang) => renderToString(createElement(Marquee, { lang }));

/** A reading as lib/landing-weather.ts returns it: Darkhan, minus 12.4, snowing at 21:00, wind 12 km/h, 90% cloud. */
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
        // The three-digit index at the far right, the label, every line of the title and the one line under it.
        expect(html).toContain(`>00${i + 1}</span>`);
        expect(html).toContain(esc(scenes[i].label));
        expect(scenes[i].title.length).toBeGreaterThan(0);
        for (const row of scenes[i].title) expect(html).toContain(`>${esc(row)}</span>`);
        expect(html).toContain(esc(scenes[i].line));
        // The index is said once to a screen reader (with the label) and shown once: never a count like "01 / 05".
        expect(count(sceneOf(html, id), `00${i + 1}`)).toBe(2);
        expect(textOf(sceneOf(html, id))).not.toMatch(/\d\s*\/\s*0?5/);
      }
      // Read as plain text (search engines, screen readers in browse mode), the title's lines do not
      // run together, and neither do the label, the index and the title.
      expect(textOf(html)).toContain(c.ask.title.join(" "));
      expect(textOf(sceneOf(html, "ask"))).toContain(`001 ${c.ask.label} 001 ${c.ask.title[0]}`);
      // The label is in the page once: the settling effect never leaves a second copy in the HTML.
      expect(count(textOf(sceneOf(html, "ask")), c.ask.label)).toBe(1);
    });

    it(`shows the exchange, the five language lines and the seven jobs in ${lang}`, () => {
      const html = story(lang);
      const c = STORY_COPY[lang];
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
      // The line at the foot of scene 005 starts on the first job: it is in the page before any press.
      expect(textOf(sceneOf(html, "work"))).toContain(c.work.runs[CHIP_IDS[0]]);
      // Without a reading, and without the visitor's clock, there is no dial at all.
      expect(html).not.toContain("data-dial=");
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
      expect(html).not.toContain("st-unseen");
      expect(html).not.toContain("translate3d");
      expect(html).not.toContain("blur(");
      expect(html).not.toContain('data-on="false"');
      // Nothing that only a script could work: the play button, the step marks and the language
      // buttons appear once script runs, and the seven jobs are plain boxes until then.
      expect(html).not.toContain("<button");
      expect(html).not.toContain("<audio");
      expect(html).not.toContain("aria-current");
      // No heading above the page's own, no list markers, nothing folded away.
      expect(html).not.toContain("<h1");
      expect(html).not.toContain("<ol");
      expect(html).not.toContain("<details");
      // One canvas: the orb of scene 001. The sky belongs to the page, not to the story.
      expect(count(html, "<canvas")).toBe(1);
      expect(html).not.toMatch(SYMBOLS);
      expect(html).not.toMatch(DASHES);
    });
  }

  it("labels what is made up as an example, once per scene, and calls nothing live", () => {
    for (const lang of LANGS) {
      const html = story(lang);
      const c = STORY_COPY[lang];
      // The exchange of scene 001 and the typed line of scene 005. Nothing else here is made up:
      // the three skies of scene 003 are a legend of what the app draws, with no figure.
      expect(count(html, `<span class="st-tag`)).toBe(2);
      expect(count(html, `>${esc(c.example)}</span>`)).toBe(2);
      for (const id of ["ask", "work"]) expect(count(sceneOf(html, id), `>${esc(c.example)}</span>`), `${lang}: ${id}`).toBe(1);
      // The line that is typed out sits right beside its label, in one paragraph.
      const work = sceneOf(html, "work");
      const run = work.slice(work.indexOf('<p class="st-run"'), work.indexOf("</p>", work.indexOf('<p class="st-run"')));
      expect(run).toContain(`>${esc(c.example)}</span>`);
      expect(textOf(run)).toContain(c.work.runs.calendar);
      // The status that answers a press is there and empty: nothing is announced before one.
      expect(count(work, 'role="status"')).toBe(1);
      expect(work).toContain('<span class="sr-only" role="status"></span>');
      // No reading: no figure, no live mark, no source.
      expect(html).not.toContain("st-live-dot");
      expect(html).not.toContain("v6-live-dot");
      expect(html).not.toContain("data-prov=");
      expect(html).not.toContain("data-yours");
      expect(html).not.toContain("Open-Meteo");
      // Scene 002 without a reading shows no figure at all (its own index aside).
      expect(textOf(sceneOf(html, "city")).replaceAll("002", "")).not.toMatch(/\d/);
    }
  });

  it("uses the app's own words for the skies and for the reply to a task", () => {
    for (const lang of LANGS) {
      const html = story(lang);
      const v = V6[lang];
      for (const word of [v.kinds.clear, v.kinds.rain, v.kinds.snow]) expect(html, `${lang}: ${word}`).toContain(esc(word));
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

describe("the visitor's readings in the story", () => {
  it("shows a dial for every figure the reading has, with its unit, its source and one live mark", async () => {
    for (const lang of LANGS) {
      const html = await storyWith(Promise.resolve(reading({ aqi: 42 })), lang);
      const v = V6[lang];
      const c = STORY_COPY[lang];
      const city = sceneOf(html, "city");
      // Temperature, wind, cloud cover and air quality, in that order. The clock is the visitor's
      // own device: the server never guesses the time there, so it is not in this HTML.
      expect([...city.matchAll(/data-dial="(\w+)"/g)].map((m) => m[1])).toEqual(["temp", "wind", "cloud", "air"]);
      expect(dialOf(html, "temp")).toContain(`>${esc(c.city.dials.temp)}</h3>`);
      expect(dialOf(html, "temp")).toMatch(/<data value="-12.4">−12<\/data>/);
      expect(textOf(dialOf(html, "temp"))).toContain("−12 °C");
      expect(dialOf(html, "wind")).toContain(`>${esc(c.city.dials.wind)}</h3>`);
      expect(textOf(dialOf(html, "wind"))).toContain(`12 ${c.city.kmh}`);
      expect(dialOf(html, "cloud")).toContain(`>${esc(c.city.dials.cloud)}</h3>`);
      expect(textOf(dialOf(html, "cloud"))).toContain("90 %");
      // Air quality in the app's own words.
      expect(dialOf(html, "air")).toContain(`>${esc(v.air)}</h3>`);
      expect(textOf(dialOf(html, "air"))).toContain(`42 ${v.usAqi}`);
      // Each gauge's arc goes as far as its figure.
      expect(dialOf(html, "temp").length).toBeGreaterThan(0);
      expect(city).toContain("--st-fill:0.3450");
      expect(city).toContain("--st-fill:0.1500");
      expect(city).toContain("--st-fill:0.9000");
      expect(city).toContain(`--st-fill:${aqiPosition(42).toFixed(4)}`);
      // Every dial has its own index, and none of them is the scene's.
      expect([...city.matchAll(/>(2\.\d)<\/span>/g)].map((m) => m[1])).toEqual(["2.1", "2.2", "2.3", "2.4"]);
      // One line says where the figures come from, with the one live mark of the scene.
      expect(textOf(city)).toContain(`${liveWord(lang)} · Open-Meteo · Darkhan`);
      expect(count(city, "st-live-dot")).toBe(1);
      expect(count(city, 'data-live="true"')).toBe(1);
      expect(count(textOf(city), "Darkhan")).toBe(1);
      // Scene 003 names the same reading under the three skies.
      expect(html).toContain("data-yours");
      const yours = html.slice(html.indexOf("data-yours"));
      // Snow has its own chip in the legend above, so the word is not printed a second time: it
      // stays in the line for screen readers.
      expect(textOf(yours)).toContain(`Darkhan · −12°C ${v.kinds.snow}`);
      expect(yours).toContain(`<span class="sr-only">${esc(v.kinds.snow)}</span>`);
      // Who gave it: the provider by name, marked as a forecast. The word itself is in the
      // scene's own line above, so it is not printed a second time.
      expect(textOf(yours)).toContain("Open-Meteo");
      expect(count(html, 'data-prov="forecast"')).toBe(1);
      expect(yours).toContain('data-prov="forecast"');
      expect(count(textOf(sceneOf(html, "weather")).toLowerCase(), v.forecast.toLowerCase())).toBeLessThanOrEqual(1);
      // The reading adds no example label: the exchange and the typed line keep theirs.
      expect(count(html, `>${esc(c.example)}</span>`)).toBe(2);
      expect(html).not.toContain("v6-skeleton");
      expect(html).not.toContain("NaN");
      expect(html).not.toMatch(SYMBOLS);
      expect(html).not.toMatch(DASHES);
    }
  });

  it("reads a promise that React passed down from the server", async () => {
    // A promise prop does not reach a client component as a Promise: it is React's own thenable,
    // and its then() calls back without returning a new promise. The story must not chain on it.
    const fromServer = <T,>(value: T) =>
      ({
        then(resolve: (v: T) => void) {
          resolve(value);
        },
      }) as unknown as Promise<T>;
    expect((fromServer(1) as Promise<number>).then(() => 2)).toBeUndefined();
    const html = await storyWith(fromServer<LandingWeather | null>(reading({ aqi: 42 })));
    expect([...sceneOf(html, "city").matchAll(/data-dial="(\w+)"/g)].map((m) => m[1])).toEqual(["temp", "wind", "cloud", "air"]);
    expect(html).toContain("data-yours");
    // One that fails the same way is no reading, and nothing breaks.
    const failing = {
      then(_: unknown, reject: (e: unknown) => void) {
        reject(new Error("down"));
      },
    } as unknown as Promise<LandingWeather | null>;
    const none = await storyWith(failing);
    expect(count(none, "<section")).toBe(5);
    expect(none).not.toContain("data-dial=");
  });

  it("draws no dial for a figure the reading does not have", async () => {
    // No air quality figure.
    const noAir = sceneOf(await storyWith(Promise.resolve(reading())), "city");
    expect([...noAir.matchAll(/data-dial="(\w+)"/g)].map((m) => m[1])).toEqual(["temp", "wind", "cloud"]);
    expect(noAir).not.toContain(V6.en.usAqi);
    // No wind and no cloud cover: the temperature stands alone, and the indices stay in step.
    const bare = sceneOf(await storyWith(Promise.resolve(reading({ sky: { kind: "clear", intensity: 0, isDay: true, windKph: null, cloudCover: null } }))), "city");
    expect([...bare.matchAll(/data-dial="(\w+)"/g)].map((m) => m[1])).toEqual(["temp"]);
    expect(bare).toContain(">2.1</span>");
    expect(bare).not.toContain(">2.2</span>");
    // Figures that cannot be true are dropped, never clamped into something that looks real.
    const odd = sceneOf(await storyWith(Promise.resolve(reading({ aqi: -3, sky: { kind: "snow", intensity: 1, isDay: false, windKph: -8, cloudCover: 140 } }))), "city");
    expect([...odd.matchAll(/data-dial="(\w+)"/g)].map((m) => m[1])).toEqual(["temp"]);
  });

  it("puts the word beside the live dot on the screen only once", () => {
    for (const lang of LANGS) {
      const v = V6[lang];
      const c = STORY_COPY[lang].city;
      const word = liveWord(lang);
      // One of the app's own two words for it...
      expect([v.live, v.now]).toContain(word);
      // ...and not one the scene's label, title or line already says.
      for (const text of [c.label, ...c.title, c.line]) expect(text.toLowerCase(), `${lang}: ${text}`).not.toContain(word.toLowerCase());
    }
  });

  it("says no content word twice in scene 002", () => {
    // Chinese is not split into words by spaces: the other four are checked.
    for (const lang of LANGS.filter((x) => x !== "zh")) {
      const v = V6[lang];
      const c = STORY_COPY[lang].city;
      const words = contentWords([c.label, ...c.title, c.line, c.dials.temp, c.dials.wind, c.dials.cloud, v.air, c.dials.time, liveWord(lang), c.device].join(" "));
      const twice = words.filter((w, i) => words.indexOf(w) !== i);
      expect(twice, lang).toEqual([]);
    }
  });

  it("types no word in scene 005 that another box or the scene's own text already shows", () => {
    // Chinese is not split into words by spaces: there the lines are checked for whole labels.
    for (const lang of LANGS) {
      const c = STORY_COPY[lang].work;
      expect(Object.keys(c.runs)).toEqual([...CHIP_IDS]);
      const scene = [c.label, ...c.title, c.line, c.ack].join(" ");
      for (const id of CHIP_IDS) {
        const others = CHIP_IDS.filter((x) => x !== id).map((x) => c.chips[x]);
        if (lang === "zh") {
          for (const label of others.filter((x) => /[\u4e00-\u9fff]/.test(x))) expect(c.runs[id], `${lang}: ${id}`).not.toContain(label.slice(0, 2));
          continue;
        }
        const taken = new Set(contentWords([scene, ...others].join(" ")));
        expect(contentWords(c.runs[id]).filter((w) => taken.has(w)), `${lang}: ${id}`).toEqual([]);
      }
      // A line is something one would say: no full stop, nothing that looks like code, and short
      // enough for a phone (36 mono characters is one row there, beside nothing else).
      for (const id of CHIP_IDS) {
        expect(c.runs[id].length, `${lang}: ${id}`).toBeLessThanOrEqual(36);
        expect(c.runs[id]).not.toMatch(/[.{}<>_]$|[{}<>_]/);
      }
    }
  });

  it("names Erdenet in the page language when the visitor's place is not known", async () => {
    for (const lang of LANGS) {
      const html = await storyWith(Promise.resolve(reading({ place: "Erdenet", local: false })), lang);
      expect(textOf(sceneOf(html, "city"))).toContain(`Open-Meteo · ${STORY_COPY[lang].erdenet}`);
    }
  });

  it("never calls Erdenet's reading the visitor's own", async () => {
    for (const lang of LANGS) {
      const c = STORY_COPY[lang];
      // The home lines are their own sentences, in every language.
      expect([c.city.lineHome === c.city.line, c.weather.lineHome === c.weather.line, c.weather.ours === c.weather.yours], lang).toEqual([false, false, false]);
      const home = await storyWith(Promise.resolve(reading({ place: "Erdenet", local: false })), lang);
      expect(textOf(sceneOf(home, "city")), lang).toContain(c.city.lineHome);
      expect(textOf(sceneOf(home, "city")), lang).not.toContain(c.city.line);
      expect(textOf(sceneOf(home, "weather")), lang).toContain(c.weather.lineHome);
      expect(textOf(sceneOf(home, "weather")), lang).not.toContain(c.weather.line);
      // A visitor whose place is known keeps the lines about their own.
      const own = await storyWith(Promise.resolve(reading()), lang);
      expect(textOf(sceneOf(own, "city")), lang).toContain(c.city.line);
      expect(textOf(sceneOf(own, "weather")), lang).toContain(c.weather.line);
    }
  });

  it("never shows an overridden reading as the current weather", async () => {
    const html = await storyWith(Promise.resolve(reading({ preview: true, aqi: 42 })));
    const city = sceneOf(html, "city");
    // The figures that were read are still shown, named a preview: no live mark and no source.
    expect([...city.matchAll(/data-dial="(\w+)"/g)].map((m) => m[1])).toEqual(["temp", "wind", "cloud"]);
    expect(textOf(city)).toContain(`${STORY_COPY.en.city.preview} · Darkhan`);
    expect(city).not.toContain("st-live-dot");
    expect(city).not.toContain("data-live");
    expect(textOf(city)).not.toContain(liveWord("en"));
    // The air figure is never part of a preview.
    expect(city).not.toContain('data-dial="air"');
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
      expect(html).not.toContain("data-dial=");
      expect(html).not.toContain("st-live-dot");
      expect(html).not.toContain("data-prov=");
      expect(html).not.toContain("Open-Meteo");
      expect(count(html, `>${STORY_COPY.en.example}</span>`)).toBe(2);
    }
  });

  it("never makes the story wait for the reading", () => {
    // A reading that never arrives: the synchronous render still has every scene in full. Scene
    // 002 is its head and nothing else meanwhile (no figure that could turn out wrong), never a skeleton.
    const html = renderToString(createElement(Story, { lang: "en", weather: new Promise<LandingWeather | null>(() => {}) }));
    const c = STORY_COPY.en;
    expect(count(html, "<section")).toBe(5);
    for (const scene of [c.ask, c.city, c.weather, c.languages, c.work]) expect(html).toContain(esc(scene.line));
    expect(html).not.toContain("data-dial=");
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
    expect(usableReading(reading())).toEqual({ place: "Darkhan", local: true, current: true, tempC: -12.4, kind: "snow", isDay: false, windKph: 12, cloudCover: 90, aqi: null, timeZone: "Asia/Ulaanbaatar" });
    const odd = usableReading(reading({ place: `  ${"b".repeat(200)}  `, preview: true, sky: { kind: "lava" as never, intensity: 9, isDay: "yes" as never, windKph: 0, cloudCover: null } }));
    expect(odd).toMatchObject({ current: false, kind: "clear", isDay: false, windKph: 0, cloudCover: null });
    expect(odd?.place).toHaveLength(80);
  });

  it("takes wind, cloud cover, air quality and the time zone only when they can be true", () => {
    // Every one of them may be missing.
    const bare = usableReading({ place: "X", local: true, preview: false, tempC: 3, sky: { kind: "clear", isDay: true } } as unknown as LandingWeather);
    expect(bare).toMatchObject({ tempC: 3, windKph: null, cloudCover: null, aqi: null, timeZone: null });
    // A whole number from 0, as the page's weather gives it; anything else is no figure.
    expect(usableReading(reading({ aqi: 42 }))?.aqi).toBe(42);
    expect(usableReading(reading({ aqi: 0 }))?.aqi).toBe(0);
    expect(usableReading(reading({ aqi: 612 }))?.aqi).toBe(612);
    for (const aqi of [null, undefined, -1, Number.NaN, Number.POSITIVE_INFINITY, 1500, "42"]) expect(usableReading(reading({ aqi: aqi as never }))?.aqi, String(aqi)).toBeNull();
    // Never part of a preview, even when it is given.
    expect(usableReading(reading({ aqi: 42, preview: true }))?.aqi).toBeNull();
    const sky = (over: object) => reading({ sky: { kind: "rain", intensity: 0.5, isDay: true, windKph: 12, cloudCover: 90, ...over } as never });
    for (const windKph of [null, -1, Number.NaN, 9999, "12"]) expect(usableReading(sky({ windKph }))?.windKph, String(windKph)).toBeNull();
    for (const cloudCover of [null, -1, 101, Number.NaN, "90"]) expect(usableReading(sky({ cloudCover }))?.cloudCover, String(cloudCover)).toBeNull();
    expect(usableReading(sky({ windKph: 0, cloudCover: 0 }))).toMatchObject({ windKph: 0, cloudCover: 0 });
    // A zone name is letters, digits and the few marks IANA names use: nothing else reaches Intl.
    expect(usableReading(reading({ timeZone: "America/Argentina/Buenos_Aires" }))?.timeZone).toBe("America/Argentina/Buenos_Aires");
    expect(usableReading(reading({ timeZone: "Etc/GMT+8" }))?.timeZone).toBe("Etc/GMT+8");
    for (const timeZone of [null, "", "x".repeat(65), "Asia/Ulaan baatar", "<script>", "../etc", 8]) expect(usableReading(reading({ timeZone: timeZone as never }))?.timeZone, String(timeZone)).toBeNull();
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
      expect(Object.keys(c.index.rows)).toEqual([...FEATURE_IDS]);
      expect(Object.keys(c.work.chips)).toEqual([...CHIP_IDS]);
      // The sign in the photo tile is in another language than the page, so there is something to read out.
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

describe("the dials", () => {
  const usable = (over: Partial<LandingWeather> = {}) => usableReading(reading(over));

  it("turns a reading into the dials it can fill, in order, and nothing into none", () => {
    expect(DIAL_IDS).toEqual(["temp", "wind", "cloud", "air", "time"]);
    expect(readingDials(null)).toEqual([]);
    expect(readingDials(undefined)).toEqual([]);
    const all = readingDials(usable({ aqi: 42 }));
    expect(all.map((d) => d.id)).toEqual(["temp", "wind", "cloud", "air"]);
    expect(all.map((d) => d.text)).toEqual(["−12", "12", "90", "42"]);
    expect(all.map((d) => d.value)).toEqual([-12.4, 12, 90, 42]);
    for (const d of all) expect(d.fill).toBe(dialFill(d.id, d.value));
    // A missing figure leaves its dial out; it is never filled in with a zero.
    expect(readingDials(usable()).map((d) => d.id)).toEqual(["temp", "wind", "cloud"]);
    expect(readingDials(usable({ sky: { kind: "fog", intensity: 0.4, isDay: true, windKph: null, cloudCover: null } })).map((d) => d.id)).toEqual(["temp"]);
    // Zero is a figure: no wind and a clear sky are both shown.
    expect(readingDials(usable({ sky: { kind: "clear", intensity: 0, isDay: true, windKph: 0, cloudCover: 0 } })).map((d) => d.text)).toEqual(["−12", "0", "0"]);
    // A real minus sign, and never "-0" or "−0".
    expect(readingDials(usable({ tempC: -0.4 }))[0].text).toBe("0");
    expect(readingDials(usable({ tempC: 0.4 }))[0].text).toBe("0");
    expect(readingDials(usable({ tempC: -0.6 }))[0].text).toBe("−1");
    expect(readingDials(usable({ tempC: 31.5 }))[0].text).toBe("32");
  });

  it("draws each arc as far as its figure goes, and never past the ends", () => {
    expect(dialFill("temp", -40)).toBe(0);
    expect(dialFill("temp", 0)).toBe(0.5);
    expect(dialFill("temp", 40)).toBe(1);
    expect(dialFill("temp", -12.4)).toBeCloseTo(0.345, 6);
    expect(dialFill("temp", -70)).toBe(0);
    expect(dialFill("temp", 56)).toBe(1);
    expect(dialFill("wind", 0)).toBe(0);
    expect(dialFill("wind", 40)).toBe(0.5);
    expect(dialFill("wind", 12)).toBeCloseTo(0.15, 6);
    expect(dialFill("wind", 200)).toBe(1);
    expect(dialFill("cloud", 0)).toBe(0);
    expect(dialFill("cloud", 90)).toBeCloseTo(0.9, 6);
    expect(dialFill("cloud", 100)).toBe(1);
    // Air quality sits on the app's own six-band scale, which ends at 500.
    for (const aqi of [0, 42, 100, 151, 300, 500]) expect(dialFill("air", aqi)).toBeCloseTo(aqiPosition(aqi), 6);
    expect(dialFill("air", 50)).toBeCloseTo(1 / 6, 6);
    expect(dialFill("air", 612)).toBe(1);
    // The clock: how much of the day has gone.
    expect(dialFill("time", 0)).toBe(0);
    expect(dialFill("time", 720)).toBe(0.5);
    expect(dialFill("time", 1439)).toBeCloseTo(1439 / 1440, 6);
    for (const id of DIAL_IDS) {
      expect(dialFill(id, Number.NaN)).toBe(0);
      for (const v of [-1e9, -1, 0, 1, 17, 99, 1e9]) {
        expect(dialFill(id, v)).toBeGreaterThanOrEqual(0);
        expect(dialFill(id, v)).toBeLessThanOrEqual(1);
      }
      // More is never less.
      for (let v = -50; v < 600; v += 7) expect(dialFill(id, v + 7)).toBeGreaterThanOrEqual(dialFill(id, v));
    }
  });

  it("reads the clock at the place's zone, or says it cannot", () => {
    const at = Date.UTC(2026, 10, 21, 13, 24, 40);
    expect(minutesAt(at, "UTC")).toBe(13 * 60 + 24);
    expect(minutesAt(at, "Asia/Ulaanbaatar")).toBe(21 * 60 + 24);
    expect(minutesAt(at, "Asia/Kolkata")).toBe(18 * 60 + 54);
    expect(minutesAt(Date.UTC(2026, 10, 21, 16, 0, 0), "Asia/Ulaanbaatar")).toBe(0); // midnight is 00:00, never 24:00
    // No zone: the device's own clock, whatever it is.
    const own = minutesAt(at, null);
    expect(own).not.toBeNull();
    expect(own).toBeGreaterThanOrEqual(0);
    expect(own).toBeLessThan(1440);
    // A zone the runtime does not know, or no moment at all: no clock, never a guess.
    expect(minutesAt(at, "Mars/Olympus_Mons")).toBeNull();
    expect(minutesAt(Number.NaN, "UTC")).toBeNull();
    expect(clockText(0)).toBe("00:00");
    expect(clockText(21 * 60 + 24)).toBe("21:24");
    expect(clockText(9 * 60 + 5)).toBe("09:05");
    expect(clockText(1440)).toBe("00:00");
    expect(clockText(-1)).toBe("23:59");
    expect(clockDial(21 * 60 + 24)).toEqual({ id: "time", value: 1284, fill: 1284 / 1440, text: "21:24" });
    // The unit beside the clock.
    expect(utcOffsetLabel(at, "Asia/Ulaanbaatar")).toBe("UTC+8");
    expect(utcOffsetLabel(at, "Asia/Kolkata")).toBe("UTC+5:30");
    expect(utcOffsetLabel(at, "America/New_York")).toBe("UTC−5");
    expect(utcOffsetLabel(at, "UTC")).toBe("UTC");
    expect(utcOffsetLabel(at, "Mars/Olympus_Mons")).toBeNull();
    expect(utcOffsetLabel(Number.NaN, "UTC")).toBeNull();
    for (const zone of ["Asia/Ulaanbaatar", "America/St_Johns", "Pacific/Chatham", null]) {
      const label = utcOffsetLabel(at, zone);
      expect(label).not.toBeNull();
      expect(label).not.toMatch(DASHES);
      expect(label).not.toContain("-");
    }
  });

  it("holds each dial, rolls on to the next, never back, and ends on the last", () => {
    for (const n of [2, 3, 4, 5]) {
      const starts = dialStarts(n);
      expect(starts).toHaveLength(n);
      expect(starts[0]).toBe(0);
      // Each dial is exactly in the middle when its stretch begins, and for the first half of it.
      for (let i = 0; i < n; i++) {
        expect(dialTurn(starts[i], n)).toBeCloseTo(i, 9);
        expect(dialTurn(starts[i] + 0.5 / n, n)).toBeCloseTo(i, 9);
      }
      let last = -1;
      for (let pin = 0; pin <= 1.0001; pin += 0.002) {
        const t = dialTurn(pin, n);
        expect(t).toBeGreaterThanOrEqual(last - 1e-9);
        expect(t).toBeLessThanOrEqual(n - 1);
        last = t;
      }
      // The last one stays for the whole of its stretch, so the scene ends on a figure that can be read.
      expect(dialTurn(1 - 0.9 / n, n)).toBe(n - 1);
      expect(dialTurn(1, n)).toBe(n - 1);
      expect(dialTurn(7, n)).toBe(n - 1);
      expect(dialTurn(-3, n)).toBe(0);
    }
    // One dial (no reading: the clock alone): nothing ever rolls.
    for (const pin of [0, 0.3, 1]) expect(dialTurn(pin, 1)).toBe(0);
    expect(dialTurn(0.5, 0)).toBe(0);
    expect(dialStarts(0)).toEqual([0]);
  });

  it("shows the figure in the middle in full, its neighbours as ghosts, and nothing further away", () => {
    expect(ghostAlpha(0)).toBe(1);
    expect(ghostAlpha(1)).toBeCloseTo(0.1, 9);
    expect(ghostAlpha(-1)).toBeCloseTo(0.1, 9);
    expect(ghostAlpha(2)).toBe(0);
    expect(ghostAlpha(-3.5)).toBe(0);
    expect(ghostAlpha(0.5)).toBeCloseTo(0.55, 9);
    // The name, the index and the caption belong to one dial at a time: half way between two, neither shows.
    expect(soloAlpha(0)).toBe(1);
    expect(soloAlpha(0.5)).toBe(0);
    expect(soloAlpha(-1)).toBe(0);
    expect(soloAlpha(0.1)).toBeGreaterThan(0.7);
  });

  it("sets a longer figure smaller, so every one fits its gauge", () => {
    expect(figureFit("7")).toBe(1);
    expect(figureFit("17")).toBe(1);
    expect(figureFit("−12")).toBeLessThan(1);
    expect(figureFit("100")).toBe(figureFit("−12"));
    expect(figureFit("21:24")).toBeLessThan(figureFit("−12"));
    // The widest a figure sets, in em of the full size: never more than two full-size digits and a half.
    for (const text of ["7", "17", "−12", "100", "−100", "21:24"]) expect([...text].length * figureFit(text)).toBeLessThanOrEqual(2.6);
  });

  it("makes the scene as tall as it has dials to show", () => {
    for (let n = 1; n < 5; n++) {
      expect(dialsTall(n + 1)[0]).toBeGreaterThan(dialsTall(n)[0]);
      expect(dialsTall(n + 1)[1]).toBeGreaterThan(dialsTall(n)[1]);
    }
    for (let n = 0; n <= 5; n++) {
      const [phone, wide] = dialsTall(n);
      // Always more than one screen (there is a pin to scroll through), never an endless one.
      expect(phone).toBeGreaterThan(1.5);
      expect(wide).toBeGreaterThanOrEqual(phone);
      expect(wide).toBeLessThan(4);
    }
    expect(dialsTall(0)).toEqual(dialsTall(1));
  });
});

describe("the numbers behind the motion", () => {
  it("brings each box up from just below its cell and lands it there", () => {
    for (let i = 0; i < CHIP_IDS.length; i++) {
      const [from, to] = chipWindow(i);
      expect(from).toBeGreaterThanOrEqual(0);
      expect(to).toBeGreaterThan(from);
      // Every box is home with a good part of the pin left, so one can be pressed.
      expect(to).toBeLessThanOrEqual(0.75);
    }
    expect(chipWindow(1)[0]).toBeGreaterThan(chipWindow(0)[0]);
    expect(chipCss(1)).toBe("none");
    expect(chipCss(1.4)).toBe("none");
    const start = chipCss(0);
    expect(start).toMatch(/^translate3d\(0, \d+\.\d+%, 0\)$/);
    // Never from further away than the start, and never turned or scaled.
    expect(chipCss(-3)).toBe(start);
    expect(chipCss(0.5)).toMatch(/^translate3d\(0, \d+\.\d+%, 0\)$/);
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

  it("sends a step button to a place where its own step is fully on", () => {
    for (const starts of [SKY_STARTS, LANG_STARTS]) {
      expect(stepTarget(starts, 0)).toBe(0);
      for (let i = 0; i < starts.length; i++) {
        const to = stepTarget(starts, i);
        expect(to).toBeGreaterThanOrEqual(starts[i]);
        expect(to).toBeLessThan(starts[i + 1] ?? 1);
        // The button that was pressed is the one that lights up...
        expect(stepAt(starts, to)).toBe(i);
        // ...and its crossfade is over there: the step before has gone, the one after has not begun.
        for (let k = 0; k < starts.length; k++) {
          const at = fadeStops(starts, k, 0.035);
          const on = fadeValues(starts, k, 0, 1, 0);
          let opacity = to <= at[0] ? on[0] : on[on.length - 1];
          for (let j = 1; j < at.length; j++) if (to >= at[j - 1] && to <= at[j]) opacity = on[j - 1] + ((on[j] - on[j - 1]) * (to - at[j - 1])) / (at[j] - at[j - 1]);
          expect(opacity, `step ${k} at the target of ${i}`).toBeCloseTo(k === i ? 1 : 0, 6);
        }
      }
      expect(stepAt(starts, 0)).toBe(0);
      expect(stepAt(starts, 1)).toBe(starts.length - 1);
      expect(stepAt(starts, -1)).toBe(0);
    }
    // The sky the page is asked for at a weather step's target is that step's own.
    for (let i = 0; i < SKY_DEMO.length; i++) expect(skyStep(1, stepTarget(SKY_STARTS, i), 0)).toBe(i);
    expect(skyStep(1, stepTarget(SKY_STARTS, SKY_DEMO.length), 0)).toBe(-1);
  });

  it("works out where the page must be scrolled for a pinned scene to stand at a step", () => {
    // A scene 2.5 screens tall, 900 px a screen, starting 4000 px down: pinned for 1350 px.
    expect(pinScrollTop(4000, 2250, 900, 0)).toBe(4000);
    expect(pinScrollTop(4000, 2250, 900, 1)).toBe(5350);
    expect(pinScrollTop(4000, 2250, 900, 0.5)).toBe(4675);
    // Never outside the pin, whatever is asked.
    expect(pinScrollTop(4000, 2250, 900, -2)).toBe(4000);
    expect(pinScrollTop(4000, 2250, 900, 9)).toBe(5350);
    // A scene no taller than the screen is not pinned at all: its top is the only place.
    expect(pinScrollTop(4000, 800, 900, 0.7)).toBe(4000);
  });

  it("plays the exchange in order and ends on the finished one", () => {
    expect([0, 0.2, 0.45, 0.7, 1].map(askPhase)).toEqual(["idle", "ask", "think", "answer", "rest"]);
  });
});

describe("the settling mono line", () => {
  const lines = ["Now · Open-Meteo · Darkhan", "Сейчас · Open-Meteo · Дархан", "实时 · Open-Meteo · 达尔汗", "open notepad on my pc", "UTC+8"];

  it("ends on the text itself and keeps its length on the way", () => {
    for (const text of lines) {
      const n = [...text].length;
      expect(decodeFrame(text, n, 3)).toBe(text);
      expect(decodeFrame(text, n + 9, 0)).toBe(text);
      for (let settled = 0; settled < n; settled++) {
        for (const tick of [0, 1, 7]) {
          const frame = [...decodeFrame(text, settled, tick)];
          expect(frame).toHaveLength(n);
          // What has settled is the text; what has not is still a letter or a digit, never a symbol.
          expect(frame.slice(0, settled).join("")).toBe([...text].slice(0, settled).join(""));
          expect(frame.join("")).not.toMatch(SYMBOLS);
          expect(frame.join("")).not.toMatch(DASHES);
        }
      }
      expect(decodeFrame(text, -4, 0)).toBe(decodeFrame(text, 0, 0));
    }
  });

  it("only stands in for letters and digits, in their own alphabet and case", () => {
    for (const text of lines) {
      const before = [...text];
      const after = [...decodeFrame(text, 0, 5)];
      for (const [i, ch] of before.entries()) {
        if (/[a-z0-9]/i.test(ch)) {
          expect(after[i]).toMatch(/[a-z0-9]/i);
          // Case is kept, so an uppercase line stays the same width in any face.
          if (/[a-z]/i.test(ch) && /[a-z]/i.test(after[i])) expect(after[i] === after[i].toLowerCase()).toBe(ch === ch.toLowerCase());
        } else if (/[\u0400-\u04ff]/.test(ch)) expect(after[i]).toMatch(/[\u0400-\u04ff]/);
        // Spaces, the dots between the parts, punctuation and Chinese stay exactly where they are.
        else expect(after[i]).toBe(ch);
      }
    }
    // It does move: a line of letters is not left as it is.
    expect(decodeFrame("OPEN-METEO", 0, 0)).not.toBe("OPEN-METEO");
    expect(decodeFrame("OPEN-METEO", 0, 0)).not.toBe(decodeFrame("OPEN-METEO", 0, 1));
  });

  it("is over in under 600 ms, however long the line", () => {
    expect(DECODE_MS).toBeLessThan(600);
    for (const chars of [0, 1, 5, 12, 30, 80, 400]) {
      expect(decodeMs(chars)).toBeGreaterThan(0);
      expect(decodeMs(chars)).toBeLessThanOrEqual(DECODE_MS);
    }
    expect(decodeMs(12)).toBeGreaterThan(decodeMs(3));
    expect(decodeMs(-5)).toBe(decodeMs(0));
  });
});

describe("the recorded clips", () => {
  it("names one file per language and kind, and never builds a path from outside text", () => {
    for (const lang of LANGS) {
      expect(clipSrc("question", lang)).toBe(`/landing/audio/question-${lang}.mp3`);
      expect(clipSrc("answer", lang)).toBe(`/landing/audio/answer-${lang}.mp3`);
    }
    expect(clipSrc("answer", "xx" as Lang)).toBe("/landing/audio/answer-en.mp3");
    expect(clipSrc("question", "../../etc/passwd" as Lang)).toBe("/landing/audio/question-en.mp3");
  });

  /** An audio element that can be told to play, to refuse, or to be missing its file. */
  class FakeAudio {
    static made: FakeAudio[] = [];
    static refuse = false;
    static crash = false;
    src = "";
    muted = false;
    paused = true;
    preload = "";
    currentTime = 5;
    duration = Number.NaN;
    plays: boolean[] = [];
    private listeners = new Map<string, Array<() => void>>();
    constructor() {
      FakeAudio.made.push(this);
    }
    addEventListener(type: string, fn: () => void) {
      this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
    }
    emit(type: string) {
      for (const fn of this.listeners.get(type) ?? []) fn();
    }
    play(): Promise<void> {
      // Recorded: was this start a silent one?
      this.plays.push(this.muted);
      if (FakeAudio.crash) throw new Error("play() is not there");
      if (FakeAudio.refuse && !this.muted) return Promise.reject(new Error("NotAllowedError"));
      this.paused = false;
      return Promise.resolve();
    }
    pause() {
      this.paused = true;
    }
  }
  /** Lets every pending promise callback run. */
  const settle = async () => {
    for (let i = 0; i < 6; i++) await Promise.resolve();
  };
  const withAudio = () => {
    FakeAudio.made = [];
    FakeAudio.refuse = false;
    FakeAudio.crash = false;
    vi.stubGlobal("Audio", FakeAudio);
  };
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("plays a clip from a press and says when it has finished", async () => {
    withAudio();
    const heard: Array<string | null> = [];
    const ends: boolean[] = [];
    const player = createPlayer((src) => heard.push(src));
    const clip = player.play("/landing/audio/question-en.mp3", (ok) => ends.push(ok));
    const audio = FakeAudio.made[0];
    expect(FakeAudio.made).toHaveLength(1);
    expect(audio.src).toBe("/landing/audio/question-en.mp3");
    // Audible at once: the press itself is what allows it.
    expect(audio.plays).toEqual([false]);
    expect(heard).toEqual(["/landing/audio/question-en.mp3"]);
    expect(player.heard()).toBe(true);
    // Its length is not known until the browser says.
    expect(clip.seconds()).toBeNull();
    audio.duration = 6.5;
    expect(clip.seconds()).toBe(6.5);
    // start() is for a readied clip: here it must not start the clip over.
    clip.start();
    await settle();
    expect(audio.plays).toEqual([false]);
    audio.emit("ended");
    expect(ends).toEqual([true]);
    expect(heard).toEqual(["/landing/audio/question-en.mp3", null]);
    expect(player.heard()).toBe(false);
    // Told once, whatever arrives afterwards.
    audio.emit("ended");
    audio.emit("error");
    player.stop();
    expect(ends).toEqual([true]);
  });

  it("readies a clip silently inside the press and sounds it when its turn comes", async () => {
    withAudio();
    const heard: Array<string | null> = [];
    const ends: boolean[] = [];
    const player = createPlayer((src) => heard.push(src));
    const clip = player.ready("/landing/audio/answer-en.mp3", (ok) => ends.push(ok));
    const audio = FakeAudio.made[0];
    // A muted start, paused again as soon as it has begun: nothing is heard yet.
    expect(audio.plays).toEqual([true]);
    await settle();
    expect(audio.paused).toBe(true);
    expect(heard).toEqual([]);
    expect(player.heard()).toBe(false);
    clip.start();
    await settle();
    // Unmuted, from the beginning.
    expect(audio.plays).toEqual([true, false]);
    expect(audio.muted).toBe(false);
    expect(audio.currentTime).toBe(0);
    expect(heard).toEqual(["/landing/audio/answer-en.mp3"]);
    expect(player.heard()).toBe(true);
    player.stop();
    expect(ends).toEqual([false]);
    expect(audio.paused).toBe(true);
    expect(heard).toEqual(["/landing/audio/answer-en.mp3", null]);
    // A clip that was stopped never starts after all.
    clip.start();
    await settle();
    expect(audio.plays).toEqual([true, false]);
  });

  it("stays silent, and throws nothing, when a clip is missing, refused or cannot be made", async () => {
    // The file is not there: the element reports an error.
    withAudio();
    let ends: boolean[] = [];
    let player = createPlayer(() => {});
    let clip = player.ready("/landing/audio/answer-xx.mp3", (ok) => ends.push(ok));
    FakeAudio.made[0].emit("error");
    expect(ends).toEqual([false]);
    clip.start();
    await settle();
    // Nothing was started unmuted, and nobody is told twice.
    expect(FakeAudio.made[0].plays).toEqual([true]);
    expect(ends).toEqual([false]);
    expect(player.heard()).toBe(false);

    // The browser refuses to play: the rejection is taken, not left unhandled.
    withAudio();
    FakeAudio.refuse = true;
    ends = [];
    const heard: Array<string | null> = [];
    player = createPlayer((src) => heard.push(src));
    clip = player.play("/landing/audio/answer-en.mp3", (ok) => ends.push(ok));
    await settle();
    expect(ends).toEqual([false]);
    expect(heard.at(-1)).toBeNull();
    expect(player.heard()).toBe(false);

    // play() itself throws (a very old browser).
    withAudio();
    FakeAudio.crash = true;
    ends = [];
    player = createPlayer(() => {});
    expect(() => player.play("/landing/audio/answer-en.mp3", (ok) => ends.push(ok))).not.toThrow();
    expect(ends).toEqual([false]);
    ends = [];
    expect(() => player.ready("/landing/audio/answer-en.mp3", (ok) => ends.push(ok)).start()).not.toThrow();
    await settle();
    expect(ends).toEqual([false]);

    // No audio at all in this runtime.
    vi.unstubAllGlobals();
    ends = [];
    player = createPlayer(() => {});
    const none = player.play("/landing/audio/answer-en.mp3", (ok) => ends.push(ok));
    expect(ends).toEqual([false]);
    expect(none.seconds()).toBeNull();
    expect(() => none.start()).not.toThrow();
    expect(() => player.stop()).not.toThrow();
    expect(() => player.dispose()).not.toThrow();
  });

  it("lets one clip sound at a time on the whole page", async () => {
    withAudio();
    const endsA: boolean[] = [];
    const endsB: boolean[] = [];
    const a = createPlayer(() => {});
    const b = createPlayer(() => {});
    a.play("/landing/audio/answer-en.mp3", (ok) => endsA.push(ok));
    expect(a.heard()).toBe(true);
    // Another scene starts one: the first is stopped and told so.
    b.play("/landing/audio/question-de.mp3", (ok) => endsB.push(ok));
    expect(endsA).toEqual([false]);
    expect(a.heard()).toBe(false);
    expect(FakeAudio.made[0].paused).toBe(true);
    expect(b.heard()).toBe(true);
    // The same scene starting another of its own replaces its first.
    b.play("/landing/audio/question-ru.mp3", (ok) => endsB.push(ok));
    expect(endsB).toEqual([false]);
    expect(FakeAudio.made[1].paused).toBe(true);
    expect(FakeAudio.made[2].paused).toBe(false);
    // A scene that goes away takes its sound with it, and leaves the floor to the others.
    b.dispose();
    expect(endsB).toEqual([false, false]);
    expect(FakeAudio.made[2].paused).toBe(true);
    a.play("/landing/audio/answer-en.mp3", (ok) => endsA.push(ok));
    expect(a.heard()).toBe(true);
    a.dispose();
  });

  it("says in each clip exactly what the page shows", () => {
    // The clips are recorded from these two strings: they must be there, and be plain speakable text.
    for (const lang of LANGS) {
      const { q, a } = STORY_COPY[lang].ask;
      for (const line of [q, a]) {
        expect(line.trim()).toBe(line);
        expect(line.length).toBeGreaterThan(5);
        expect(line).not.toMatch(/[<>{}\[\]]/);
      }
    }
  });
});
