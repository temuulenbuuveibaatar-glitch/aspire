import { describe, expect, it } from "vitest";
import { particleBudget, streakLen } from "@/components/aspire/Sky";

describe("rain reads as rain", () => {
  it("a streak is at least as long as its own fall per frame", () => {
    expect(streakLen(10, 1200, 30)).toBeGreaterThanOrEqual(1200 / 30);
    expect(streakLen(10, 450, 60)).toBeGreaterThanOrEqual(450 / 60);
    expect(streakLen(40, 300, 60)).toBe(40); // already long enough: unchanged
  });

  it("light rain on a low-tier small phone keeps the floor; still and clear skies stay cheap", () => {
    expect(particleBudget("rain", 0, 0.6, 0.5, false, 260)).toBeGreaterThanOrEqual(60);
    expect(particleBudget("storm", 0, 0.6, 0.5, false, 260)).toBeGreaterThanOrEqual(60);
    expect(particleBudget("rain", 1, 2.2, 1, false, 520)).toBe(396);
    expect(particleBudget("storm", 1, 2.2, 1, false, 520)).toBe(520); // capped
    expect(particleBudget("rain", 0, 0.6, 0.5, true, 260)).toBe(18); // still frame keeps the 0.3 factor
    expect(particleBudget("clear", 1, 1, 1, false, 520)).toBe(0);
  });
});
