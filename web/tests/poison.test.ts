import { describe, expect, it } from "vitest";
import { POISON, poisonHelp, poisonLine } from "@/lib/tools/poison";
import type { ToolContext } from "@/lib/tools/types";

const ctx = (extra: Partial<ToolContext> = {}): ToolContext => ({ now: new Date(), lang: "en", device: { memory: {}, reminders: [] }, actions: [], ...extra });

describe("poison_help", () => {
  it("shows the emergency number first, then the poison centre", async () => {
    const c = ctx({ country: "US" });
    const out = await poisonHelp.run({ country: "" }, c);
    expect(out).toMatchObject({ emergency: "911", poisonCentre: "18002221222" });
    expect(c.actions).toEqual([
      { type: "call", number: "911", label: "Emergency 911", known: true },
      { type: "call", number: "18002221222", label: "Poison centre", known: true },
    ]);
  });

  it("picks the regional line by city, in the person's language", async () => {
    const c = ctx({ country: "DE", city: "Munich", lang: "de" });
    await poisonHelp.run({ country: "" }, c);
    expect(c.actions.map((a) => (a.type === "call" ? [a.number, a.label] : null))).toEqual([
      ["112", "Notruf 112"],
      ["08919240", "Giftnotruf"],
    ]);
    expect(poisonLine("CA", "Montreal")?.number).toBe("18004635060");
    expect(poisonLine("CA", "Toronto")?.number).toBe("18447647669");
  });

  it("an unverified country gets no made-up number", async () => {
    for (const country of ["MN", "CN", "Germany", "<script>"]) {
      const c = ctx();
      const out = await poisonHelp.run({ country }, c);
      expect(out).toMatchObject({ poisonCentre: "unknown" });
      expect(c.actions).toEqual([]);
    }
  });

  it("every entry is a plausible dialable number", () => {
    for (const { emergency, lines } of Object.values(POISON)) {
      expect(emergency).toMatch(/^\d{3}$/);
      for (const l of lines) expect(l.number).toMatch(/^\+?\d{3,15}$/);
    }
  });
});
