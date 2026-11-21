// Accessibility for blind and low-vision people (a11y plan items 7, 11, 13, 14, 15): hero text contrast,
// the picked camera announced and focused, long live names that wrap instead of being cut, the language
// of mixed-language text, and small semantic fixes (sheet backdrop, traffic counts, retry focus).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createElement, type FunctionComponent } from "react";
import { renderToString } from "react-dom/server";
import type { AmbientSky, AmbientWeather } from "@/lib/ambient-types";
import { detectTextLanguage, HTML_LANG } from "@/lib/lang";
import { BriefingCard } from "@/components/aspire/BriefingCard";
import { Sheet } from "@/components/aspire/Sheet";
import { UI } from "@/lib/ui-text";
import { Card } from "@/components/v6/Card";
import { HeroCard } from "@/components/v6/HeroCard";
import { TrafficCard } from "@/components/v6/TrafficCard";
import { TransitCard, type Departure } from "@/components/v6/TransitCard";
import { fill, V6 } from "@/components/v6/text";

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper over many prop shapes
const html = <P,>(c: FunctionComponent<P>, props: P) => renderToString(createElement(c as FunctionComponent<any>, props as any));
const noop = () => {};
const NOW = Date.parse("2026-11-21T04:00:00Z");
const ago = (s: number) => new Date(NOW - s * 1000).toISOString();

describe("hero photo text contrast (item 7, WCAG 1.4.3)", () => {
  const css = src("app/globals.css");
  it("the scrim's base layer is .5, and More contrast darkens it evenly", () => {
    expect(css).toMatch(/rgb\(11 19 17 \/ 0\.5\);\s*\}/);
    const more = css.slice(css.lastIndexOf("@media (prefers-contrast: more)"));
    expect(more.slice(0, more.indexOf("@media", 10))).toMatch(/\.v6-scrim\s*\{\s*background: linear-gradient\(180deg, rgb\(11 19 17 \/ 0\.6\), rgb\(11 19 17 \/ 0\.85\)\);/);
  });

  it("text over the photo uses full ink, not muted ink", () => {
    const sky: AmbientSky = { kind: "rain", intensity: 0.5, isDay: true, windKph: 10, cloudCover: 90 };
    const weather: AmbientWeather = { tempC: 12, feelsC: 9, text: "Light rain", days: [{ date: "2026-11-21", minC: 9, maxC: 14, text: "Rain", kind: "rain", precipChance: 80 }] };
    const out = html(HeroCard, { lang: "en", place: "Erdenet, Mongolia", sky, weather, photo: null, timeZone: "Asia/Ulaanbaatar", now: NOW, onOpenMap: noop });
    expect(out).toContain(`<p class="text-copy text-ink">${V6.en.tagline}</p>`);
    expect(out).toMatch(/<p class="num text-copy text-ink">Feels/);
    expect(out).toMatch(/<span class="num block text-meta tracking-wide text-ink uppercase">/);
  });
});

describe("camera viewer is announced and focused (item 11, WCAG 2.4.3, 1.1.1)", () => {
  // The viewer only shows after a click (client state), so the markup is checked at the source.
  const cam = src("components/aspire/CameraSheet.tsx");
  it("the figure takes focus when a camera is picked, shows it, and is named by its figcaption", () => {
    expect(cam).toMatch(/<figure ref=\{viewer\} tabIndex=\{-1\} className="[^"]*focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">/);
    expect(cam).not.toMatch(/<figure[^>]*aria-label/);
    expect(cam).toMatch(/useEffect\(\(\) => \{\s*if \(picked\) viewer\.current\?\.focus\(\);\s*\}, \[picked\]\);/);
  });
  it("the snapshot's alt says it is a snapshot, in the person's language (the caption says the name)", () => {
    expect(cam).toContain("alt={t.kinds.image}");
  });
});

describe("long live names wrap instead of being cut (item 13, WCAG 1.4.4, 1.4.10)", () => {
  const long = "Central Station via the long road past the old market and the hospital";
  it("TransitCard: a long headsign has no ellipsis and no hover-only title", () => {
    const dep: Departure = { route: "24", minutes: 5, kind: "live", at: ago(0), source: "Transitous", headsign: long };
    const out = html(TransitCard, { lang: "en", now: NOW, coverage: "live", stopName: long, walkMin: 2, departures: [dep], onViewRoutes: noop });
    expect(out).toContain(`[overflow-wrap:anywhere]">${long}</span>`);
    const body = out.slice(out.indexOf("</header>"));
    expect(body.slice(0, body.indexOf("View all routes"))).not.toMatch(/\btruncate\b|title=/);
  });
  it("TransitCard: OpenStreetMap stop names wrap too", () => {
    const out = html(TransitCard, { lang: "en", now: NOW, coverage: "static", departures: [], stops: [{ name: long, distanceM: 300 }], onViewRoutes: noop });
    expect(out).toContain(`[overflow-wrap:anywhere]">${long}</span>`);
    expect(out).not.toContain(`title="${long}"`);
  });
  it("Assistant: the phone tab bar labels wrap, and the dock scrolls away on short screens (item 8)", () => {
    const app = src("components/Assistant.tsx");
    expect(app).toContain('<span className="max-w-full text-center leading-tight [overflow-wrap:anywhere]">{label}</span>');
    expect(app).not.toContain('<span className="max-w-full truncate">{label}</span>');
    expect(app).toMatch(/pointer-events-none fixed inset-x-0 z-20 \[@media\(max-height:30rem\)\]:static/);
    expect(app).toContain("lg:pb-6 [@media(max-height:30rem)]:pb-4");
  });
  it("City sheet: parking, station and operator names are not cut", () => {
    const city = src("components/v6/CitySheet.tsx");
    expect(city).not.toMatch(/truncate[^"]*" title=\{(l|s)\.name\}/);
    expect(city).not.toContain('<p lang="mn" className="truncate');
  });
});

describe("language of parts (item 14, WCAG 3.1.2)", () => {
  it("news headlines carry their own language", () => {
    expect(src("components/aspire/NewsStrip.tsx")).toContain("lang={HTML_LANG[detectTextLanguage(h.title, lang)]}");
    // An English headline on a Mongolian screen is read in English; a Mongolian one stays Mongolian.
    expect(HTML_LANG[detectTextLanguage("Central bank raises interest rates again", "mn")]).toBe("en");
    expect(HTML_LANG[detectTextLanguage("Улаанбаатарт цас орно", "mn")]).toBe("mn");
  });
  it("briefing headlines carry their own language and say they open a new tab", () => {
    const headlines = [{ title: "Central bank raises interest rates again", source: "Reuters", url: "https://example.com/a", publishedAt: null, category: [] }];
    const out = html(BriefingCard, { text: "Өглөөний мэнд", t: UI.mn, onReplay: noop, headlines, lang: "mn", newTab: "шинэ цонхонд нээгдэнэ" });
    expect(out).toMatch(/<span lang="en" class="line-clamp-2[^"]*">Central bank/);
    expect(out).toContain('<span class="sr-only">, <!-- -->шинэ цонхонд нээгдэнэ</span>');
  });
  it("legal page titles mark the Mongolian half", async () => {
    const { default: Privacy } = await import("@/app/privacy/page");
    const { default: Terms } = await import("@/app/terms/page");
    expect(renderToString(createElement(Privacy))).toMatch(/<h1[^>]*><span lang="mn">Нууцлалын бодлого<\/span> · Privacy Policy<\/h1>/);
    expect(renderToString(createElement(Terms))).toMatch(/<h1[^>]*><span lang="mn">Үйлчилгээний нөхцөл<\/span> · Terms of Use<\/h1>/);
  });
  it("the live map's canvas is named in the person's language", () => {
    expect(src("components/aspire/LiveMap.tsx")).toContain('"Map.Title": t.title');
  });
});

describe("small semantic fixes (item 15)", () => {
  it("the sheet backdrop is hidden from screen readers (WCAG 4.1.2)", () => {
    const out = html(Sheet, { open: true, title: "Cameras", closeLabel: "Close", onClose: noop, children: "body" });
    expect(out).toMatch(/<button type="button" aria-label="Close" aria-hidden="true" tabindex="-1"/);
    // The first row's focus ring is not clipped by the scroller's top edge (WCAG 2.4.7).
    expect(out).toMatch(/overflow-y-auto overscroll-contain px-5 pt-2/);
  });

  it("traffic counts read as a phrase, not a bare number (WCAG 1.3.1)", () => {
    const cams = [
      { id: "c1", name: "Оюутны гудамж", lat: 49, lng: 104, vehicles: 42, load: "high" as const, detectedAt: ago(20) },
      { id: "c2", name: "Төв талбай", lat: 49, lng: 104, vehicles: 18, load: "medium" as const, detectedAt: ago(40) },
    ];
    const traffic = { cameras: cams, summary: { level: "high" as const, busiest: ["Оюутны гудамж", "Төв талбай"], updatedAt: ago(20) } };
    for (const lang of ["en", "mn", "ru"] as const) {
      const out = html(TrafficCard, { lang, now: NOW, city: "Erdenet", traffic, credit: "Орхон ТКХДТ" });
      expect(out).toContain(`<data aria-hidden="true" value="42">42</data><span class="sr-only">${fill(V6[lang].vehicles, { n: 42 }, lang)}</span>`);
    }
  });

  it("a card can take focus, so Retry does not drop it (WCAG 2.4.3)", () => {
    const out = html(Card, { title: "X", icon: null, lang: "en", state: "error", onRetry: noop });
    expect(out).toMatch(/<section[^>]*tabindex="-1"/);
    expect(src("components/v6/Card.tsx")).toContain('e.currentTarget.closest("section")?.focus();');
    expect(src("components/aspire/NewsStrip.tsx")).toContain('e.currentTarget.closest("section")?.focus();');
  });
});
