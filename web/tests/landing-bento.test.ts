// The bento grid of the opening page (components/landing/Bento.tsx): its server render is the
// finished grid in every language (the head, the key, eight lettered tiles with their title and
// line), nothing in it waits for a script to be seen, the made-up content is marked once, the
// visitor's weather is only shown when it is real and only called live when it is current, the
// copy has no emojis and no em or en dashes, and the stylesheet only moves what it may move.
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { prerender } from "react-dom/static";
import { describe, expect, it } from "vitest";
import {
  Bento,
  BUS_FIRST,
  BUS_GAP,
  clock,
  clockText,
  COMMAND,
  DECODE_AT_MS,
  DECODE_FRAMES,
  DECODE_STEP_MS,
  decodeFrames,
  gaugeFraction,
  letterOf,
  liveReading,
  STAGED,
} from "@/components/landing/Bento";
import { BENTO_COPY, bentoCopy } from "@/components/landing/bento-copy";
import { FEATURE_IDS, STORY_COPY, type FeatureId } from "@/components/landing/story/copy";
import { V6 } from "@/components/v6/text";
import type { LandingWeather } from "@/lib/landing-weather";
import { HTML_LANG, LANGS, type Lang } from "@/lib/lang";

const SYMBOLS = /[\u{2190}-\u{21FF}\u{2300}-\u{23FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]|\p{Extended_Pictographic}/u;
/** Figure dash, en dash, em dash, horizontal bar. The minus sign of a temperature (U+2212) is not one. */
const DASHES = /[‒-―]/;
/** How React writes text into HTML. */
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
/** The page as plain text: comments and tags out, React's entities back to characters. */
const textOf = (html: string) =>
  html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
const count = (html: string, part: string) => html.split(part).length - 1;
const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const css = source("../components/landing/bento.css");

/** What is inside one tile: from its opening tag to its own closing tag (a tile may hold a list of its own). */
function tileOf(html: string, id: FeatureId): string {
  const at = html.indexOf(`data-tile="${id}"`);
  expect(at, id).toBeGreaterThan(-1);
  const next = html.indexOf("data-tile=", at + 1);
  const rest = html.slice(html.indexOf(">", at) + 1, next === -1 ? html.indexOf("</ul></div></section>") : next);
  return next === -1 ? rest.slice(0, rest.lastIndexOf("</li>")) : rest.slice(0, rest.lastIndexOf("</li><li"));
}
/** The picture of a tile: everything after its line. */
function picOf(html: string, id: FeatureId): string {
  const tile = tileOf(html, id);
  const at = tile.indexOf('<div class="bn-pic">');
  expect(at, id).toBeGreaterThan(-1);
  return tile.slice(at);
}

const bento = (lang: Lang) => renderToString(createElement(Bento, { lang }));

/** A reading as lib/landing-weather.ts returns it: Darkhan, minus 12.4, snowing at 21:00, air index 42. */
const reading = (over: Omit<Partial<LandingWeather>, "aqi"> & { aqi?: unknown } = {}): LandingWeather =>
  ({
    place: "Darkhan",
    local: true,
    preview: false,
    tempC: -12.4,
    sky: { kind: "snow", intensity: 0.6, isDay: false, windKph: 12, cloudCover: 90 },
    localHour: 21,
    timeZone: "Asia/Ulaanbaatar",
    at: "2026-11-21T13:00:00.000Z",
    source: "open-meteo",
    aqi: 42,
    ...over,
  }) as LandingWeather;

/** A failure while rendering fails the test, unless the test asks to collect it. */
const rethrow = (e: unknown) => {
  throw e;
};

/**
 * The grid once its <Suspense> has resolved (what a visitor ends up with). A reading that fails is
 * reported to `onError` and leaves the boundary's fallback in the HTML, as it does on the server.
 */
async function bentoWith(weather: Promise<LandingWeather | null>, lang: Lang = "en", onError: (e: unknown) => void = rethrow): Promise<string> {
  const { prelude } = await prerender(createElement(Bento, { lang, weather }), { progressiveChunkSize: 1e9, onError });
  return new Response(prelude).text();
}

describe("Bento (server render)", () => {
  for (const lang of LANGS) {
    it(`shows the head and all eight lettered tiles in ${lang}`, () => {
      const html = bento(lang);
      const c = STORY_COPY[lang];
      expect(count(html, "<section")).toBe(1);
      expect(html).toContain('<section id="features" aria-labelledby="features-title" class="bn">');
      expect(count(html, "<h2")).toBe(1);
      expect(html).toContain(`<h2 id="features-title" class="bn-title v6-on-photo">${esc(c.index.label)}</h2>`);
      expect(FEATURE_IDS).toHaveLength(8);
      expect(count(html, "data-tile=")).toBe(8);
      expect(count(html, "<h3")).toBe(8);
      for (const [i, id] of FEATURE_IDS.entries()) {
        const tile = tileOf(html, id);
        const letter = "ABCDEFGH"[i];
        expect(letterOf(id)).toBe(letter);
        expect(tile).toContain(`<h3 class="bn-name"><span class="bn-letter">${letter}.</span> <span>${esc(c.index.rows[id].title)}</span></h3>`);
        expect(tile).toContain(`<p class="bn-line readout">${esc(c.index.rows[id].line)}</p>`);
        expect(tile).toContain('<div class="bn-pic">');
        // Read as plain text, the letter, the title and the line stay apart.
        expect(textOf(tile)).toContain(`${letter}. ${c.index.rows[id].title} ${c.index.rows[id].line}`);
      }
      // The tiles come in the order they are lettered.
      const order = [...html.matchAll(/data-tile="(\w+)"/g)].map((m) => m[1]);
      expect(order).toEqual([...FEATURE_IDS]);
    });

    it(`needs no script to be read in ${lang}`, () => {
      const html = bento(lang);
      // Nothing plays, nothing is hidden, moved away or waiting for an observer.
      expect(html).not.toContain("data-play");
      expect(html).not.toContain("data-roll");
      expect(html).not.toContain("bn-decode-frame");
      expect(html).not.toMatch(/opacity:0[;"]/);
      expect(html).not.toContain("visibility:hidden");
      expect(html).not.toContain("animation");
      expect(html).not.toMatch(/class="[^"]*\binvisible\b/);
      // Pictures are drawn: no image, no canvas, no video.
      expect(html).not.toContain("<img");
      expect(html).not.toContain("<canvas");
      expect(html).not.toContain("<video");
      // No heading above the page's own, no list markers, nothing folded away.
      expect(html).not.toContain("<h1");
      expect(html).not.toContain("<ol");
      expect(html).not.toContain("<details");
      expect(html).not.toMatch(SYMBOLS);
      expect(html).not.toMatch(DASHES);
    });

    it(`marks the made-up content once and calls nothing live in ${lang}`, () => {
      const html = bento(lang);
      const c = STORY_COPY[lang];
      const v = V6[lang];
      // One example mark for the whole grid, in the key above it, and the word nowhere else.
      expect(count(html, `<span class="bn-tag">${esc(c.example)}</span>`)).toBe(1);
      expect(count(html, esc(c.example))).toBe(1);
      const key = html.slice(html.indexOf('<p class="bn-key'), html.indexOf("<ul"));
      expect(textOf(key)).toBe(`${c.example} ${STAGED.map(letterOf).join(" · ")}`);
      // Every tile the key names holds its example, in the page's language.
      expect(textOf(picOf(html, "bus"))).toBe(`3 ${c.city.to[0]}${clockText(BUS_FIRST)}5 ${c.city.to[1]} ${clockText(BUS_FIRST + BUS_GAP)}`);
      expect(textOf(picOf(html, "traffic"))).toBe(`${v.load.low} `);
      expect(textOf(picOf(html, "reminders"))).toBe("08:00");
      expect(picOf(html, "photo")).toContain(`<p lang="${HTML_LANG[c.index.signLang]}" class="bn-sign"><span>${esc(c.index.sign)}</span>`);
      expect(textOf(picOf(html, "photo"))).toBe(`${c.index.sign}${BENTO_COPY[lang].meaning}`);
      expect(textOf(picOf(html, "chat"))).toBe(`> ${COMMAND}`);
      // The tiles it does not name show no word and no figure: a map and headlines drawn in lines.
      expect(textOf(picOf(html, "map"))).toBe("");
      expect(textOf(picOf(html, "news"))).toBe("");
      // No reading: the gauge is empty beside one plain line, and nothing claims to be live.
      const gauge = picOf(html, "weather");
      expect(textOf(gauge)).toBe(v.none);
      expect(gauge).not.toMatch(/\d°/);
      expect(gauge).not.toContain("<data");
      expect(html).not.toContain("data-live");
      expect(html).not.toContain("bn-dot");
      expect(html).not.toContain("Open-Meteo");
    });

    it(`shows no word twice inside a tile in ${lang}`, () => {
      const c = STORY_COPY[lang];
      const v = V6[lang];
      // Words of four letters and more; a language written without spaces is compared as whole strings.
      const words = (s: string) => new Set(s.toLowerCase().match(/\p{L}{4,}/gu) ?? []);
      const clash = (label: string, text: string) => (lang === "zh" ? text.includes(label) : [...words(label)].some((w) => words(text).has(w)));
      const own = (id: FeatureId) => `${c.index.rows[id].title} ${c.index.rows[id].line}`;
      const labels: [FeatureId, string[]][] = [
        ["bus", [...c.city.to]],
        ["weather", [v.live, v.static, v.none, v.usAqi, ...Object.values(v.aqi)]],
        ["traffic", [v.load.low]],
        ["photo", [BENTO_COPY[lang].meaning]],
        ["chat", [COMMAND]],
      ];
      for (const [id, list] of labels) for (const label of list) expect(clash(label, own(id)), `${lang} ${id}: ${label}`).toBe(false);
      // The traffic word can share a screen with any air quality word: they must differ.
      for (const word of Object.values(v.aqi)) expect(clash(v.load.low, word), `${lang}: ${word}`).toBe(false);
      // The sign is in another language than the page, so there is something to read out.
      expect(c.index.signLang).not.toBe(lang);
    });
  }

  it("falls back to English for an unknown language", () => {
    const html = renderToString(createElement(Bento, { lang: "xx" as Lang }));
    expect(html).toContain(esc(STORY_COPY.en.index.rows.bus.line));
    expect(html).toContain(`>${BENTO_COPY.en.meaning}</span>`);
    expect(bentoCopy("xx" as Lang)).toBe(BENTO_COPY.en);
  });
});

describe("the visitor's weather in tile B", () => {
  it("shows the real reading with its source and marks it live, in every language", async () => {
    for (const lang of LANGS) {
      const html = await bentoWith(Promise.resolve(reading()), lang);
      const v = V6[lang];
      const gauge = picOf(html, "weather");
      expect(gauge).toContain('<div class="bn-wx" data-live="">');
      expect(gauge).toMatch(/<data value="-12.4" class="bn-g-temp numeral">−12°C<\/data>/);
      expect(gauge).toMatch(/<data value="42" class="bn-air-n numeral">42<\/data>/);
      expect(textOf(gauge)).toBe(`−12°C${v.usAqi} 42 ${v.aqi.good}${v.live} · Open-Meteo · Darkhan`);
      // The arc and the needle stand where the temperature puts them: 27.6 of 80 degrees up the scale.
      expect(gauge).toContain("stroke-dashoffset:0.655");
      expect(gauge).toContain("--a:124.2deg");
      // Only this tile is live, and the one example mark of the grid is still the only one.
      expect(count(html, "data-live")).toBe(1);
      expect(count(html, "bn-dot")).toBe(1);
      expect(count(html, esc(STORY_COPY[lang].example))).toBe(1);
      expect(html).not.toContain("NaN");
      expect(html).not.toMatch(SYMBOLS);
      expect(html).not.toMatch(DASHES);
    }
  });

  it("names the air in words, and says so when the reading has no index", async () => {
    const v = V6.en;
    const bands: [number, string][] = [[0, v.aqi.good], [51, v.aqi.moderate], [135, v.aqi.sensitive], [180, v.aqi.unhealthy], [250, v.aqi.very_unhealthy], [480, v.aqi.hazardous]];
    for (const [aqi, word] of bands) {
      const gauge = picOf(await bentoWith(Promise.resolve(reading({ aqi }))), "weather");
      expect(textOf(gauge), String(aqi)).toContain(`${v.usAqi} ${aqi} ${word}`);
    }
    // A reading from before the index existed, or one with a value that is not an index.
    const without = reading();
    delete (without as { aqi?: unknown }).aqi;
    for (const w of [without, reading({ aqi: null }), reading({ aqi: Number.NaN }), reading({ aqi: -3 }), reading({ aqi: "42" }), reading({ aqi: 1e9 })]) {
      const gauge = picOf(await bentoWith(Promise.resolve(w)), "weather");
      expect(textOf(gauge)).toBe(`−12°C${v.usAqi} ${v.none}${v.live} · Open-Meteo · Darkhan`);
      expect(gauge).toContain("--p:0");
      expect(gauge).not.toContain("NaN");
    }
  });

  it("names Erdenet in the page language when the visitor's place is not known", async () => {
    for (const lang of LANGS) {
      const html = await bentoWith(Promise.resolve(reading({ place: "Erdenet", local: false })), lang);
      expect(picOf(html, "weather")).toContain(`<span class="bn-place">${STORY_COPY[lang].erdenet}</span>`);
    }
  });

  it("never calls an overridden reading live", async () => {
    for (const lang of LANGS) {
      const gauge = picOf(await bentoWith(Promise.resolve(reading({ preview: true })), lang), "weather");
      const v = V6[lang];
      expect(gauge).not.toContain("data-live");
      expect(gauge).not.toContain("bn-dot");
      expect(gauge).not.toContain("Open-Meteo");
      expect(textOf(gauge)).toBe(`−12°C${v.usAqi} 42 ${v.aqi.good}${v.static} · Darkhan`);
    }
  });

  it("treats a null, rejected or unusable reading as no reading", async () => {
    // Made one at a time: a rejected promise must not wait unhandled while the others render.
    const bad: (() => Promise<LandingWeather | null>)[] = [
      () => Promise.resolve(null),
      () => Promise.reject(new Error("down")),
      () => Promise.resolve(reading({ tempC: Number.NaN })),
      () => Promise.resolve(reading({ tempC: 900 })),
      () => Promise.resolve({ place: "X" } as LandingWeather),
    ];
    const failures: unknown[] = [];
    for (const make of bad) {
      const html = await bentoWith(make(), "en", (e) => failures.push(e));
      const gauge = picOf(html, "weather");
      expect(textOf(gauge)).toBe(V6.en.none);
      expect(gauge).not.toContain("<data");
      expect(html).not.toContain("data-live");
      expect(html).not.toContain("NaN");
      expect(count(html, "data-tile=")).toBe(8);
    }
    // Only the rejected one was an error at all, and it broke nothing but its own gauge.
    expect(failures.map((e) => (e as Error).message)).toEqual(["down"]);
  });

  it("never makes the grid wait for the reading", () => {
    // A reading that never arrives: the synchronous render still has all eight tiles, and tile B
    // is the empty gauge meanwhile (a finished tile even without JavaScript), never a skeleton.
    const html = renderToString(createElement(Bento, { lang: "en", weather: new Promise<LandingWeather | null>(() => {}) }));
    const c = STORY_COPY.en;
    for (const id of FEATURE_IDS) expect(html).toContain(esc(c.index.rows[id].line));
    expect(textOf(picOf(html, "weather"))).toBe(V6.en.none);
    expect(html).not.toContain("v6-skeleton");
    expect(html).not.toContain("data-live");
    expect(textOf(picOf(html, "chat"))).toBe(`> ${COMMAND}`);
  });

  it("escapes a place name and keeps it short", async () => {
    const html = await bentoWith(Promise.resolve(reading({ place: `<img src=x onerror=alert(1)>${"a".repeat(300)}` })));
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("a".repeat(81));
  });

  it("checks a reading before it is shown", () => {
    expect(liveReading(null)).toBeNull();
    expect(liveReading(undefined)).toBeNull();
    expect(liveReading(reading({ tempC: Number.POSITIVE_INFINITY }))).toBeNull();
    expect(liveReading(reading({ tempC: -120 }))).toBeNull();
    expect(liveReading({ ...reading(), sky: null } as unknown as LandingWeather)).toBeNull();
    expect(liveReading(reading())).toEqual({ place: "Darkhan", local: true, live: true, tempC: -12.4, aqi: 42 });
    const odd = liveReading(reading({ place: `  ${"b".repeat(200)}  `, preview: true, local: "yes" as never, aqi: 41.6 }));
    expect(odd).toMatchObject({ live: false, local: false, aqi: 42 });
    expect(odd?.place).toHaveLength(80);
  });
});

describe("the numbers behind the pictures", () => {
  it("counts the two example departures down from four and eleven minutes", () => {
    expect(clock(BUS_FIRST)).toEqual([0, 4, 0, 0]);
    expect(clockText(BUS_FIRST)).toBe("04:00");
    expect(clockText(BUS_FIRST + BUS_GAP)).toBe("11:00");
    expect(clockText(BUS_FIRST - 1)).toBe("03:59");
    expect(clockText(0)).toBe("00:00");
    // Never a negative or broken clock.
    expect(clockText(-5)).toBe("00:00");
    expect(clockText(Number.NaN)).toBe("00:00");
    expect(clockText(61.9)).toBe("01:01");
  });

  it("puts a temperature on the gauge between 40 below and 40 above", () => {
    expect(gaugeFraction(-40)).toBe(0);
    expect(gaugeFraction(0)).toBe(0.5);
    expect(gaugeFraction(40)).toBe(1);
    expect(gaugeFraction(-89)).toBe(0);
    expect(gaugeFraction(57)).toBe(1);
  });

  it("decodes a line from the left in under 600 ms, with its own characters, the same way every time", () => {
    expect(DECODE_FRAMES * DECODE_STEP_MS).toBeLessThan(600);
    for (const lang of LANGS) {
      const text = BENTO_COPY[lang].meaning;
      const chars = [...text];
      const frames = decodeFrames(text);
      expect(frames).toHaveLength(DECODE_FRAMES);
      expect(decodeFrames(text)).toEqual(frames);
      let settledBefore = -1;
      for (const [k, frame] of frames.entries()) {
        const got = [...frame];
        expect(got).toHaveLength(chars.length);
        const settled = Math.floor((k / DECODE_FRAMES) * chars.length);
        expect(got.slice(0, settled)).toEqual(chars.slice(0, settled));
        expect(settled).toBeGreaterThanOrEqual(settledBefore);
        settledBefore = settled;
        for (const [i, ch] of got.entries()) {
          // Spaces stay where they are, and a stand-in is one of the line's own characters.
          if (chars[i] === " ") expect(ch).toBe(" ");
          else expect(chars).toContain(ch);
        }
        expect(frame).not.toMatch(SYMBOLS);
        expect(frame).not.toMatch(DASHES);
      }
    }
    expect(decodeFrames("")).toEqual([]);
    expect(decodeFrames("   ")).toEqual([]);
    expect(decodeFrames("ab", 0)).toEqual([]);
  });

  it("keeps the photo tile's loop in step with the stylesheet", () => {
    // The real text takes over when the last scrambled frame is gone; each frame shows for one step.
    const loopMs = Number(css.match(/animation: bn-settle (\d+)s steps\(1, end\) infinite;/)?.[1]) * 1000;
    expect(loopMs).toBeGreaterThan(DECODE_AT_MS + DECODE_FRAMES * DECODE_STEP_MS);
    expect(css).toContain(`animation: bn-blip ${loopMs / 1000}s steps(1, end) infinite;`);
    expect(css).toContain(`animation: bn-scan ${loopMs / 1000}s linear infinite;`);
    const settle = Number(css.match(/@keyframes bn-settle \{\s*0% \{\s*opacity: 0;\s*\}\s*([\d.]+)%,/)?.[1]);
    const blip = Number(css.match(/@keyframes bn-blip \{\s*0% \{\s*opacity: 1;\s*\}\s*([\d.]+)%,/)?.[1]);
    expect(settle).toBeCloseTo(((DECODE_AT_MS + DECODE_FRAMES * DECODE_STEP_MS) / loopMs) * 100, 1);
    expect(blip).toBeCloseTo((DECODE_STEP_MS / loopMs) * 100, 2);
  });

  it("types the bots' own link command with a code in the real format", () => {
    // The pairing alphabet and length, read from the module that makes the real codes.
    const desktop = source("../lib/desktop.ts");
    const pattern = desktop.match(/DESKTOP_CODE_RE = \/(\^.+\$)\/;/)?.[1];
    expect(pattern).toBeTruthy();
    const [command, code] = COMMAND.split(" ");
    expect(command).toBe("/link");
    expect(code).toMatch(new RegExp(pattern as string));
    expect(source("../lib/bots/text.ts")).toContain("/link <code>");
    // The typing steps are counted from the command itself.
    expect(bento("en")).toContain(`style="--n:${COMMAND.length}"`);
  });

  it("names five staged tiles, each of them a real feature", () => {
    expect(STAGED.map(letterOf)).toEqual(["A", "C", "F", "G", "H"]);
    for (const id of STAGED) expect(FEATURE_IDS).toContain(id);
    expect(new Set(STAGED).size).toBe(STAGED.length);
  });
});

describe("bento.css", () => {
  /** Every innermost rule of the stylesheet: its selector (or keyframe step) and its declarations. */
  const rules = [...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1].trim(), body: m[2] }));
  const keyframes = [...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/@keyframes (bn-[\w-]+) \{((?:[^{}]*\{[^{}]*\})+)\s*\}/g)].map((m) => ({ name: m[1], body: m[2] }));

  it("moves transform, opacity, stroke-dashoffset and clip-path and nothing else", () => {
    const allowed = new Set(["transform", "opacity", "stroke-dashoffset", "clip-path"]);
    expect(keyframes.length).toBeGreaterThan(15);
    for (const { name, body } of keyframes) {
      const props = [...body.matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1]);
      expect(props.length, name).toBeGreaterThan(0);
      for (const prop of props) expect(allowed.has(prop), `${name}: ${prop}`).toBe(true);
    }
    for (const { selector, body } of rules) {
      const moved = body.match(/transition:\s*([a-z-]+)/)?.[1];
      if (moved) expect(allowed.has(moved), `${selector}: ${moved}`).toBe(true);
      expect(body, selector).not.toContain("transition: all");
      // No layout property is ever animated or promised to the compositor.
      expect(body, selector).not.toContain("will-change");
    }
  });

  it("runs a loop only on a tile that is marked as playing", () => {
    const animated = rules.filter((r) => /\banimation(-name)?:/.test(r.body));
    expect(animated.length).toBeGreaterThan(15);
    for (const { selector } of animated) expect(selector, selector).toMatch(/^\.bn-tile\[data-play\] /);
    // Every keyframe set is used, and every one used exists.
    const used = new Set(animated.map((r) => r.body.match(/animation:\s*(bn-[\w-]+)/)?.[1]));
    expect([...used].sort()).toEqual(keyframes.map((k) => k.name).sort());
    // Hover answers within 150 to 250 ms.
    for (const { body } of rules) {
      const ms = body.match(/transition: (?:transform|opacity) (\d+)ms/)?.[1];
      if (ms) {
        expect(Number(ms)).toBeGreaterThanOrEqual(150);
        expect(Number(ms)).toBeLessThanOrEqual(250);
      }
    }
  });

  it("keeps small text at 4.5:1 on a tile whatever is behind it", () => {
    const lin = (c: number) => (c / 255 <= 0.03928 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);
    const lum = ([r, g, b]: number[]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    const contrast = (a: number[], b: number[]) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
    const BG = [5, 5, 5];
    const WHITE = [255, 255, 255];
    const over = (alpha: number) => BG.map((c, i) => c * alpha + WHITE[i] * (1 - alpha));
    const ground = Number(css.match(/--bn-ground: rgb\(5 5 5 \/ ([\d.]+)\);/)?.[1]);
    expect(ground).toBeGreaterThan(0);
    expect(ground).toBeLessThan(1);
    // The worst sky there could be is white: the tile's own ground has to do all the work.
    expect(contrast([221, 221, 221], over(ground)), "ink on a tile").toBeGreaterThanOrEqual(4.5);
    expect(contrast([168, 168, 168], over(ground)), "muted ink on a tile").toBeGreaterThanOrEqual(4.5);
    expect(contrast([252, 79, 0], over(ground)), "accent on a tile").toBeGreaterThanOrEqual(4.5);
    // The key carries the accent too, and tiles pass under it: it is solid.
    expect(css.match(/\.bn-key \{[^}]*\}/)?.[0]).toContain("background-color: var(--color-bg);");
    // The head stands straight on the sky: ink, never the accent.
    expect(css.match(/\.bn-title \{[^}]*\}/)?.[0]).toContain("color: var(--color-ink);");
  });

  it("uses the app's tokens: one accent, the live green for the live dot only, no raw colours beside ink and the page colour", () => {
    const plain = css.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(plain).not.toMatch(/#[0-9a-f]{3,8}\b(?<!#000)/i);
    for (const rgb of plain.match(/rgb\([^)]*\)/g) ?? []) expect(rgb).toMatch(/^rgb\((221 221 221|5 5 5|252 79 0|0 0 0) \/ [\d.]+\)$/);
    const live = rules.filter((r) => r.body.includes("--color-live"));
    expect(live.map((r) => r.selector)).toEqual([".bn-dot", ".bn-dot::after"]);
  });
});

describe("bento copy and source", () => {
  it("has the one extra string in every language, with no emoji and no dash", () => {
    expect(Object.keys(BENTO_COPY).sort()).toEqual([...LANGS].sort());
    for (const lang of LANGS) {
      const { meaning } = BENTO_COPY[lang];
      expect(meaning.trim()).toBe(meaning);
      expect(meaning.length).toBeGreaterThan(0);
      expect(meaning).not.toMatch(SYMBOLS);
      expect(meaning).not.toMatch(DASHES);
      // The sign of the story's copy and its meaning are the same word in two languages.
      expect(meaning.toLowerCase()).not.toBe(STORY_COPY[lang].index.sign.toLowerCase());
    }
  });

  it("has no em or en dash and no emoji anywhere in the grid's source", () => {
    for (const file of ["Bento.tsx", "bento.css", "bento-copy.ts"]) {
      const text = source(`../components/landing/${file}`);
      expect(text, file).not.toMatch(DASHES);
      expect(text, file).not.toMatch(SYMBOLS);
      expect(text, file).not.toMatch(/[\u{1F1E6}-\u{1F1FF}]/u);
    }
  });
});
