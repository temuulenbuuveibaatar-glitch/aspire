// v4 HUD look: Backdrop (photo, grade, credit, overlay sky) and HudFrame render on the server.
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { Backdrop, httpsUrl } from "@/components/aspire/Backdrop";
import { HudFrame } from "@/components/aspire/HudFrame";
import { Sky, skyFamily } from "@/components/aspire/Sky";
import type { AmbientSky } from "@/lib/ambient-types";

const NO_SYMBOLS = /[\p{Extended_Pictographic}\u{2190}-\u{21FF}\u{2600}-\u{27BF}]/u;
const snow: AmbientSky = { kind: "snow", intensity: 0.6, isDay: false, windKph: 12, cloudCover: 90 };
const photo = { url: "https://places.googleusercontent.com/p/abc", attribution: { name: "A. Bat", uri: "//maps.google.com/maps/contrib/1" } };

describe("Backdrop", () => {
  it("grades by time and weather, credits the photo and lays particles over it", () => {
    const html = renderToString(createElement(Backdrop, { photo, sky: snow, localHour: 22, effects: true }));
    expect(html).toContain('data-time="night"');
    expect(html).toContain('data-sky="snow"');
    expect(html).toContain('src="https://places.googleusercontent.com/p/abc"');
    expect(html).toContain('href="https://maps.google.com/maps/contrib/1"');
    expect(html).toContain("A. Bat");
    expect(html).toContain("Google Maps");
    expect(html).toContain("<canvas");
    expect(html).not.toMatch(NO_SYMBOLS);
  });

  it("falls back to the still gradient with no photo, no credit and no particles when effects are off", () => {
    const html = renderToString(createElement(Backdrop, { photo: null, sky: { ...snow, isDay: true }, localHour: 12, effects: false }));
    expect(html).toContain("linear-gradient");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("Google Maps");
    expect(html).not.toContain("<canvas");
    expect(html).toContain('data-time="day"');
  });

  it("draws no guessed grade before the time is known, and no weather over an unknown sky", () => {
    const blank = renderToString(createElement(Backdrop, { photo, sky: snow, localHour: null, effects: true }));
    expect(blank).not.toContain("<img");
    expect(blank).not.toContain("data-time");
    const unknown = renderToString(createElement(Backdrop, { photo: null, sky: { ...snow, known: false }, localHour: 23, effects: true }));
    expect(unknown).not.toContain("<canvas");
    expect(unknown).toContain('data-sky="clear"');
  });

  it("refuses non-https photo and credit URLs", () => {
    const bad = { url: "javascript:alert(1)", attribution: { name: "X", uri: "http://evil.test" } };
    const html = renderToString(createElement(Backdrop, { photo: bad, sky: snow, localHour: 1, effects: false }));
    expect(html).not.toContain("<img");
    expect(html).not.toContain("javascript:");
    expect(httpsUrl("http://a.test")).toBeNull();
    expect(httpsUrl("//a.test/x")).toBe("https://a.test/x");
    expect(httpsUrl(42)).toBeNull();
  });

  it("maps weather families", () => {
    expect(skyFamily("hail")).toBe("rain");
    expect(skyFamily("cloudy")).toBe("cloud");
    expect(skyFamily("bogus")).toBe("clear");
  });
});

describe("Sky", () => {
  it("overlay mode draws no gradient or vignette", () => {
    const full = renderToString(createElement(Sky, { kind: "rain", intensity: 0.5, isDay: true }));
    const over = renderToString(createElement(Sky, { kind: "rain", intensity: 0.5, isDay: true, overlay: true }));
    expect(full).toContain("aspire-fade-in");
    expect(over).not.toContain("aspire-fade-in");
    expect(over).not.toContain("bg-[#060B16]");
  });
});

describe("HudFrame", () => {
  it("renders clock and readouts, as buttons with a spoken hint only when clickable", () => {
    const html = renderToString(
      // eslint-disable-next-line react/no-children-prop -- HudFrameProps requires children
      createElement(HudFrame, {
        children: createElement("main", null, "body"),
        clock: "14:32",
        readouts: [
          { id: "temp", icon: createElement("svg"), label: "Snow", value: "-17 C", tone: "warn" },
          { id: "aqi", icon: createElement("svg"), label: "AQI", value: "42", tone: "ok", onClick: () => {}, hint: "Open the live map" },
        ],
      }),
    );
    expect(html).toContain("14:32");
    expect(html).toContain('<span class="sr-only">, <!-- -->Open the live map</span>');
    expect(html).toContain("-17 C");
    expect(html.match(/<button/g)?.length).toBe(1);
    expect(html).toContain("font-mono");
    expect(html).toContain("<main>body</main>");
    expect(html).not.toMatch(NO_SYMBOLS);
  });
});
