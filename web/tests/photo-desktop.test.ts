// The hero photo no longer vanishes when a snapshot comes without one (the photo showed for about 2 s,
// then the first /api/ambient snapshot blanked it), another city's photo still never shows, and the
// Aspire Desktop bridge calls the native commands only inside the desktop app.
import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { HeroCard } from "@/components/v6/HeroCard";
import type { Ambient } from "@/lib/ambient-types";
import { desktopCapabilities, desktopOpenAction, desktopOpenApp, desktopOpenUrl, inDesktopApp } from "@/lib/desktop-bridge";
import type { OpenAppAction } from "@/lib/tools/types";
import { forgetPhoto, heroPhoto, parseCachedPhoto, rememberPhoto, type CachedPhoto } from "@/lib/use-ambient";

afterEach(() => vi.unstubAllGlobals());

const NOW = Date.parse("2026-11-21T04:00:00Z");
const ERDENET = { lat: 49.03, lng: 104.08 };
const cached = parseCachedPhoto(
  JSON.stringify({
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/34/Erdenet.jpg/1920px-Erdenet.jpg",
    attribution: { name: "Erdii123 / CC BY-SA 4.0", uri: "https://commons.wikimedia.org/wiki/File:Erdenet.jpg" },
    place: "Erdenet, Mongolia",
    savedAt: NOW,
    at: ERDENET,
  }),
) as CachedPhoto;
const snap = (x: Partial<Ambient>) => ({ photo: null, coords: null, place: null, ...x }) as unknown as Ambient;
const hero = (photo: unknown, fallback: unknown = null) =>
  renderToString(
    createElement(HeroCard, {
      lang: "mn",
      place: "Эрдэнэт, Монгол",
      sky: { kind: "clear", intensity: 0, isDay: true, windKph: 0, cloudCover: null },
      weather: null,
      photo: photo as never,
      fallback: fallback as never,
      timeZone: "Asia/Ulaanbaatar",
      now: NOW,
      onOpenMap: () => {},
    }),
  );

describe("hero photo after the first snapshot", () => {
  it("keeps the kept photo when the snapshot has none, whatever its place label says", () => {
    expect(cached?.at).toEqual(ERDENET);
    expect(heroPhoto(null, cached)).toBe(cached); // before the snapshot
    // The regression: same city, label in Mongolian, no photo -> the photo stays.
    expect(heroPhoto(snap({ place: "Эрдэнэт, Монгол", coords: { lat: 49.0301, lng: 104.0801 } }), cached)).toBe(cached);
    expect(heroPhoto(snap({}), cached)).toBe(cached); // no place, no coords
    expect(hero(heroPhoto(snap({ place: "Эрдэнэт, Монгол" }), cached))).toContain('src="https://upload.wikimedia.org/');
  });

  it("never shows another city's photo, and a snapshot's own photo wins", () => {
    expect(heroPhoto(snap({ coords: { lat: 47.92, lng: 106.92 } }), cached)).toBeNull(); // Ulaanbaatar, about 240 km away
    const own = { url: "https://upload.wikimedia.org/ub.jpg", attribution: { name: "B", uri: "https://commons.wikimedia.org/wiki/File:UB.jpg" } };
    expect(heroPhoto(snap({ photo: own, coords: { lat: 47.92, lng: 106.92 } }), cached)).toBe(own);
    // A photo kept before positions were stored has nothing to compare: kept (picking a place drops it).
    const legacy = parseCachedPhoto(JSON.stringify({ ...cached, at: undefined }));
    expect(heroPhoto(snap({ coords: { lat: 47.92, lng: 106.92 } }), legacy)).toBe(legacy);
    expect(parseCachedPhoto(JSON.stringify({ ...cached, at: { lat: "x", lng: 1 } }))?.at).toBeUndefined();
  });

  it("falls back to the kept photo when the snapshot's photo is unusable", () => {
    expect(hero({ url: "javascript:alert(1)", attribution: { name: "x", uri: "" } }, cached)).toContain('src="https://upload.wikimedia.org/');
    expect(hero(null, null)).not.toContain("<img");
  });

  it("stores the photo with a rough position, and forgets it on a failed load or another place", () => {
    const data = new Map<string, string>();
    vi.stubGlobal("window", new EventTarget());
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
    });
    rememberPhoto(cached, "Erdenet, Mongolia", { lat: 49.0312, lng: 104.0787 });
    const kept = parseCachedPhoto([...data.values()][0] ?? null);
    expect(kept?.at).toEqual({ lat: 49, lng: 104.1 });
    forgetPhoto("https://upload.wikimedia.org/other.jpg"); // another URL failed: kept
    expect(data.size).toBe(1);
    forgetPhoto(cached.url); // this one failed: dropped
    expect(data.size).toBe(0);
    rememberPhoto(cached, "Erdenet", ERDENET);
    forgetPhoto(); // the person picked another place
    expect(data.size).toBe(0);
  });
});

describe("Aspire Desktop bridge", () => {
  const spotify: OpenAppAction = { type: "open_app", id: "spotify", name: "Spotify", scheme: "spotify:", web: "https://open.spotify.com" };
  const youtube: OpenAppAction = { type: "open_app", id: "youtube", name: "YouTube", scheme: "youtube://", web: "https://www.youtube.com" };
  const desktop = (answer: unknown = { ok: true, message: "allowed" }) => {
    const invoke = vi.fn(async () => answer);
    vi.stubGlobal("window", { __TAURI__: { core: { invoke } } });
    return invoke;
  };

  it("does nothing in a normal browser (the card keeps its links)", async () => {
    vi.stubGlobal("window", {});
    expect(inDesktopApp()).toBe(false);
    expect(await desktopOpenUrl("https://www.youtube.com")).toEqual({ ok: false, message: "not_desktop" });
    expect(await desktopCapabilities()).toBeNull();
  });

  it("opens apps by catalog name and web-only apps by their https link", async () => {
    const invoke = desktop();
    expect(inDesktopApp()).toBe(true);
    expect(await desktopOpenAction(spotify)).toEqual({ ok: true, message: "allowed" });
    expect(invoke).toHaveBeenLastCalledWith("desktop_open_app", { name: "Spotify" });
    await desktopOpenAction(youtube);
    expect(invoke).toHaveBeenLastCalledWith("desktop_open_url", { url: "https://www.youtube.com/" });
    await desktopOpenAction({ ...spotify, scheme: "spotify:search:queen", web: "https://open.spotify.com/search/queen" });
    expect(invoke).toHaveBeenLastCalledWith("desktop_open_url", { url: "https://open.spotify.com/search/queen" });
  });

  it("refuses anything outside the allow-lists before it reaches the desktop", async () => {
    const invoke = desktop();
    expect(desktopOpenAction({ ...spotify, web: "https://evil.example/" })).toBeNull();
    expect(desktopOpenAction({ type: "open_app", id: "phone", name: "Phone", scheme: "tel:+97699112233", web: "" })).toBeNull();
    expect((await desktopOpenUrl("file:///C:/Windows/System32/cmd.exe")).ok).toBe(false);
    expect((await desktopOpenUrl("http://example.com")).ok).toBe(false);
    expect((await desktopOpenApp("C:\\Windows\\cmd.exe")).ok).toBe(false);
    expect((await desktopOpenApp("calc --evil")).ok).toBe(false);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("reads a denial, a failure and the capabilities safely", async () => {
    desktop({ ok: false, message: "denied" });
    expect(await desktopOpenApp("Spotify")).toEqual({ ok: false, message: "denied" });
    vi.stubGlobal("window", { __TAURI__: { core: { invoke: async () => Promise.reject(new Error("no such command")) } } });
    expect((await desktopOpenApp("Spotify")).ok).toBe(false);
    desktop({ version: "0.3.0", commands: ["desktop_open_url", 7, "desktop_open_app"] });
    expect(await desktopCapabilities()).toEqual({ version: "0.3.0", commands: ["desktop_open_url", "desktop_open_app"] });
    desktop({ ok: "yes" });
    expect((await desktopOpenApp("Spotify")).ok).toBe(false);
  });
});
