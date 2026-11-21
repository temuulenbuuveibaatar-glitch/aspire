import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { boltPoints, flashDelay, rainStreak, Sky } from "@/components/aspire/Sky";
import { coverUv, dropCap, MAX_DROPS, stepDrops, type Drop } from "@/components/aspire/RainGlass";

/** Deterministic 0..1 sequence. */
function lcg(seed = 1): () => number {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

describe("rain streaks", () => {
  it("far streaks are 15-25 px, near 45-90 px, and longer with speed", () => {
    for (const u of [0, 0.5, 1]) {
      const far = rainStreak("rain", 0, u, 0.6);
      const near = rainStreak("rain", 2, u, 0.6);
      expect(far.len).toBeGreaterThanOrEqual(15);
      expect(far.len).toBeLessThanOrEqual(25);
      expect(near.len).toBeGreaterThanOrEqual(45);
      expect(near.len).toBeLessThanOrEqual(90);
      expect(near.vy).toBeGreaterThan(far.vy);
      expect(near.width).toBeGreaterThan(far.width);
    }
    const slow = rainStreak("rain", 1, 0, 0.6), fast = rainStreak("rain", 1, 1, 0.6);
    expect(fast.vy).toBeGreaterThan(slow.vy);
    expect(fast.len).toBeGreaterThan(slow.len);
  });

  it("drizzle is finer and slower; a storm at 30 fps still covers each frame's fall", () => {
    const rain = rainStreak("rain", 2, 0.5, 0.5), drizzle = rainStreak("drizzle", 2, 0.5, 0.5);
    expect(drizzle.vy).toBeLessThan(rain.vy);
    expect(drizzle.width).toBeLessThan(rain.width);
    expect(drizzle.len).toBeLessThan(rain.len);
    for (let L = 0; L < 3; L++) {
      const s = rainStreak("storm", L, 1, 1, 30);
      expect(s.len).toBeGreaterThanOrEqual(s.vy / 30);
      expect(s.len).toBeLessThanOrEqual(90);
    }
  });
});

describe("storm", () => {
  it("lightning waits at least 6 s, whatever the random draw", () => {
    expect(flashDelay(0)).toBe(6000);
    expect(flashDelay(-5)).toBe(6000);
    expect(flashDelay(1)).toBe(14000);
  });

  it("a bolt runs from the top down, inside the box", () => {
    const pts = boltPoints(lcg(7)).split(" ").map((p) => p.split(",").map(Number));
    expect(pts).toHaveLength(11);
    expect(pts[0][1]).toBe(0);
    for (let i = 1; i < pts.length; i++) expect(pts[i][1]).toBeGreaterThan(pts[i - 1][1]);
    for (const [x, y] of pts) {
      expect(x).toBeGreaterThanOrEqual(2);
      expect(x).toBeLessThanOrEqual(98);
      expect(y).toBeLessThanOrEqual(60);
    }
  });
});

describe("rain on glass", () => {
  it("caps drops by area and device", () => {
    expect(dropCap(10, 10, 1)).toBe(40);
    expect(dropCap(5000, 5000, 1)).toBe(MAX_DROPS);
    expect(dropCap(5000, 5000, 0.5)).toBe(MAX_DROPS / 2);
  });

  it("maps the screen onto an object-fit: cover photo", () => {
    // A 2:1 photo in a square box: full height, the middle half of the width.
    expect(coverUv(100, 100, 200, 100)).toEqual([0.5, 1, 0.25, 0]);
    expect(coverUv(300, 100, 300, 100)).toEqual([1, 1, 0, 0]);
  });

  it("never exceeds the cap and keeps every drop on the glass", () => {
    const drops: Drop[] = [];
    const cap = dropCap(800, 400, 1), rand = lcg(3);
    let most = 0;
    for (let s = 0; s < 900; s++) {
      stepDrops(drops, 1 / 15, 800, 400, 1, cap, rand);
      most = Math.max(most, drops.length);
      for (const d of drops) {
        expect(d.r).toBeGreaterThanOrEqual(1);
        expect(d.r).toBeLessThanOrEqual(16);
      }
    }
    expect(most).toBeLessThanOrEqual(cap);
    expect(most).toBeGreaterThan(cap / 2);
    expect(drops.some((d) => d.vy > 0)).toBe(true);
  });

  it("a running drop swallows what it touches and keeps the water", () => {
    const drops: Drop[] = [
      { x: 50, y: 50, r: 8, vy: 100, drift: 0, slid: 0 },
      { x: 52, y: 52, r: 4, vy: 0, drift: 0, slid: 0 },
      { x: 50, y: 500, r: 9, vy: 100, drift: 0, slid: 0 },
    ];
    stepDrops(drops, 0.001, 400, 300, 0, 100, () => 0.99);
    expect(drops).toHaveLength(1); // merged; the third ran off the bottom
    expect(drops[0].r).toBeCloseTo(Math.cbrt(8 ** 3 + 4 ** 3), 3);
  });
});

describe("Sky", () => {
  it("only mounts the glass for rain over a photo", () => {
    const glass = (kind: "rain" | "snow", photo?: string) => renderToString(createElement(Sky, { kind, intensity: 0.6, isDay: true, overlay: true, photo })).match(/<canvas/g)?.length;
    expect(glass("rain", "https://upload.wikimedia.org/x.jpg")).toBe(2);
    expect(glass("rain")).toBe(1);
    expect(glass("snow", "https://upload.wikimedia.org/x.jpg")).toBe(1);
  });
});
