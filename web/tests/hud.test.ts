// The sky layer renders on the server; only https URLs reach a page.
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { httpsUrl } from "@/lib/utils";
import { Sky, skyFamily } from "@/components/aspire/Sky";

describe("httpsUrl and sky families", () => {
  it("refuses non-https URLs and maps weather families", () => {
    expect(httpsUrl("http://a.test")).toBeNull();
    expect(httpsUrl("javascript:alert(1)")).toBeNull();
    expect(httpsUrl("//a.test/x")).toBe("https://a.test/x");
    expect(httpsUrl(42)).toBeNull();
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
